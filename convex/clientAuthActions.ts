"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { hashPassword, verifyBcryptPassword } from "./lib/password";
import { generateSecureToken, hashToken, INVITE_TOKEN_EXPIRY_MS, RESET_TOKEN_EXPIRY_MS } from "./lib/tokens";
import { validateEmail, validatePassword } from "./lib/validation";
import { validateRequiredEnv } from "./lib/validateEnv";
import { issueSession, requireOwnerManagerSession } from "./lib/sessions";
import { recordSecurityEventFromAction } from "./lib/securityEventActions";

validateRequiredEnv();

function appUrl() {
  return (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");
}

function cleanEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  validateEmail(normalized);
  return normalized;
}

function displayNameForRelationship(relationship: any) {
  return relationship.primaryContactName || relationship.displayName || relationship.businessName || "Client";
}

async function sendClientInvitation(ctx: any, userId: Id<"users">, relationshipId: Id<"clientRelationships">) {
    const { relationship } = await ctx.runQuery(
      internal.clientAuthInternal.getRelationshipForOwner,
      { userId, relationshipId }
    );

    if (relationship.status === "archived") throw new Error("Archived client relationships cannot invite clients");
    const email = cleanEmail(relationship.email || "");
    const now = Date.now();

    if (relationship.clientUserId) {
      const linkedUser = await ctx.runQuery(internal.clientAuthInternal.getClientUserById, {
        clientUserId: relationship.clientUserId,
      });
      if (linkedUser?.status === "active") {
        return { inviteUrl: `${appUrl()}/client/login`, emailSent: false, status: "active" as const };
      }
    }

    const existingClientUser = await ctx.runQuery(internal.clientAuthInternal.getClientUserByEmail, { email });
    let clientUserId = relationship.clientUserId as Id<"clientUsers"> | undefined;
    let pendingInviteClientUserId: Id<"clientUsers"> | undefined;
    if (!clientUserId && existingClientUser) pendingInviteClientUserId = existingClientUser._id;
    else if (!clientUserId) {
      clientUserId = await ctx.runMutation(internal.clientAuthInternal.createClientUser, {
        email,
        displayName: displayNameForRelationship(relationship),
        phone: relationship.phone,
        status: "pending",
      });
    }

    const token = generateSecureToken();
    const inviteUrl = `${appUrl()}/client/accept-invite/${token}`;
    await ctx.runMutation(internal.clientAuthInternal.setRelationshipInvite, {
      relationshipId: relationship._id,
      clientUserId,
      pendingInviteClientUserId,
      inviteTokenHash: hashToken(token),
      inviteTokenExpiry: now + INVITE_TOKEN_EXPIRY_MS,
      inviteSentAt: now,
    });
    await ctx.runMutation(internal.mutations.scheduleEmail.scheduleClientInviteEmail, {
      email,
      token,
      name: displayNameForRelationship(relationship),
      companyId: relationship.companyId,
    });
    return { inviteUrl, emailSent: true, status: "pending" as const };
}

export const inviteClient = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    relationshipId: v.id("clientRelationships"),
  },
  handler: async (ctx, args): Promise<{
    inviteUrl: string;
    emailSent: boolean;
    status: "pending" | "active";
  }> => {
    const principal = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
    return await sendClientInvitation(ctx, principal.userId, args.relationshipId);
  },
});

export const inviteClientFromRequest = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    requestId: v.id("clientRequests"),
  },
  handler: async (ctx, args): Promise<{ inviteUrl: string; emailSent: boolean; status: "pending" | "active" }> => {
    const principal = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
    const relationshipId = await ctx.runMutation(internal.clientAuthInternal.resolveRelationshipForRequest, {
      userId: principal.userId,
      requestId: args.requestId,
    });
    const result = await sendClientInvitation(ctx, principal.userId, relationshipId);
    if (result.emailSent) {
      await ctx.runMutation(internal.clientAuthInternal.recordRequestInvitationAudit, {
        userId: principal.userId,
        requestId: args.requestId,
        relationshipId,
      });
    }
    return result;
  },
});

export const getInviteInfo = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<null | { email: string; displayName: string }> => {
    const relationship = await ctx.runQuery(
      internal.clientAuthInternal.getRelationshipByInviteToken,
      { tokenHash: hashToken(args.token) }
    );
    if (!relationship || !relationship.inviteTokenExpiry || relationship.inviteTokenExpiry < Date.now()) {
      return null;
    }

    const clientUserId = relationship.pendingInviteClientUserId || relationship.clientUserId;
    const clientUser = clientUserId
      ? await ctx.runQuery(internal.clientAuthInternal.getClientUserById, { clientUserId })
      : null;

    return {
      email: clientUser?.email || relationship.email || "",
      displayName: clientUser?.displayName || displayNameForRelationship(relationship),
    };
  },
});

export const acceptInvite = action({
  args: {
    token: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args): Promise<{
    clientUserId: Id<"clientUsers">;
    sessionToken: string;
    sessionExpiresAt: number;
    sessionIdleExpiresAt: number;
  }> => {
    validatePassword(args.password);

    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `ctp:${args.token.slice(0, 8)}:acceptClientInvite`,
      limit: 5,
      windowMs: 60_000,
    });

    const relationship = await ctx.runQuery(
      internal.clientAuthInternal.getRelationshipByInviteToken,
      { tokenHash: hashToken(args.token) }
    );

    if (!relationship || !relationship.inviteTokenExpiry || relationship.inviteTokenExpiry < Date.now()) {
      throw new Error("Invalid or expired invite link");
    }

    const clientUserId = relationship.pendingInviteClientUserId || relationship.clientUserId;
    if (!clientUserId) throw new Error("Invalid or expired invite link");

    const clientUser = await ctx.runQuery(internal.clientAuthInternal.getClientUserById, {
      clientUserId,
    });
    if (!clientUser || clientUser.status === "disabled") {
      throw new Error("Invalid or expired invite link");
    }

    const shouldSetPassword = clientUser.status !== "active" || !clientUser.passwordHash;
    await ctx.runMutation(internal.clientAuthInternal.acceptRelationshipInvite, {
      relationshipId: relationship._id,
      clientUserId,
      passwordHash: shouldSetPassword ? await hashPassword(args.password) : undefined,
    });

    await recordSecurityEventFromAction(ctx, {
      eventType: "client_invitation_accepted",
      principalType: "client",
      clientUserId,
      companyId: relationship.companyId,
      outcome: "success",
    });

    const session = await issueSession(ctx, { principalType: "client", clientUserId });
    return { clientUserId, ...session };
  },
});

export const signIn = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args): Promise<{
    clientUserId: Id<"clientUsers">;
    sessionToken: string;
    sessionExpiresAt: number;
    sessionIdleExpiresAt: number;
  }> => {
    const email = cleanEmail(args.email);
    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `ce:${email}:clientSignIn`,
      limit: 5,
      windowMs: 60_000,
    });

    const genericError = "Invalid email or password";
    const clientUser = await ctx.runQuery(internal.clientAuthInternal.getClientUserByEmail, {
      email,
    });
    if (!clientUser || clientUser.status !== "active" || !clientUser.passwordHash) {
      await recordSecurityEventFromAction(ctx, { eventType: "login_failure", principalType: "client", outcome: "failure", metadata: { category: "invalid_credentials" } });
      throw new Error(genericError);
    }

    const ok = await verifyBcryptPassword(args.password, clientUser.passwordHash);
    if (!ok) {
      await recordSecurityEventFromAction(ctx, { eventType: "login_failure", principalType: "client", outcome: "failure", metadata: { category: "invalid_credentials" } });
      throw new Error(genericError);
    }

    const session = await issueSession(ctx, {
      principalType: "client",
      clientUserId: clientUser._id,
    });
    await recordSecurityEventFromAction(ctx, { eventType: "client_login_success", principalType: "client", clientUserId: clientUser._id, outcome: "success" });
    return { clientUserId: clientUser._id, ...session };
  },
});

export const requestPasswordReset = action({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const email = cleanEmail(args.email);
    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `ce:${email}:clientPasswordReset`,
      limit: 3,
      windowMs: 60_000,
    });

    const clientUser = await ctx.runQuery(internal.clientAuthInternal.getClientUserByEmail, { email });
    await recordSecurityEventFromAction(ctx, { eventType: "client_password_reset_requested", principalType: "client", outcome: "success", metadata: { category: "accepted" } });
    if (!clientUser) return { success: true };

    const token = generateSecureToken();
    await ctx.runMutation(internal.clientAuthInternal.setClientResetToken, {
      clientUserId: clientUser._id,
      resetToken: hashToken(token),
      resetTokenExpiry: Date.now() + RESET_TOKEN_EXPIRY_MS,
    });
    try {
      await ctx.runMutation(internal.mutations.scheduleEmail.scheduleClientPasswordResetEmail, { email, token });
    } catch {
      console.error("[client-recovery] unable to schedule reset email");
    }
    return { success: true };
  },
});

export const resetPassword = action({
  args: { token: v.string(), newPassword: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    validatePassword(args.newPassword);
    if (!/^[a-f0-9]{64}$/i.test(args.token)) throw new Error("Invalid or expired reset token");
    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `ctp:${args.token.slice(0, 8)}:clientResetPassword`,
      limit: 5,
      windowMs: 60_000,
    });
    const clientUser = await ctx.runQuery(internal.clientAuthInternal.getClientUserByResetToken, { tokenHash: hashToken(args.token) });
    if (!clientUser || !clientUser.resetTokenExpiry || clientUser.resetTokenExpiry < Date.now()) {
      throw new Error("Invalid or expired reset token");
    }

    await ctx.runMutation(internal.clientAuthInternal.consumeClientResetToken, {
      clientUserId: clientUser._id,
      passwordHash: await hashPassword(args.newPassword),
    });
    await ctx.runMutation((internal as any).sessionInternal.revokeAllForPrincipal, {
      principal: { principalType: "client", clientUserId: clientUser._id },
      now: Date.now(),
      reason: "password_reset",
    });
    await recordSecurityEventFromAction(ctx, { eventType: "client_password_reset_completed", principalType: "client", clientUserId: clientUser._id, outcome: "success" });
    return { success: true };
  },
});
