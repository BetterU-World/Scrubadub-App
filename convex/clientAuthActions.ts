"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { hashPassword, verifyBcryptPassword } from "./lib/password";
import { generateSecureToken, hashToken, INVITE_TOKEN_EXPIRY_MS } from "./lib/tokens";
import { validateEmail, validatePassword } from "./lib/validation";
import { validateRequiredEnv } from "./lib/validateEnv";
import { issueSession, requireOwnerSession } from "./lib/sessions";

validateRequiredEnv();

function appUrl() {
  return (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");
}

function cleanEmail(email: string) {
  validateEmail(email);
  return email.trim().toLowerCase();
}

function displayNameForRelationship(relationship: any) {
  return relationship.primaryContactName || relationship.displayName || relationship.businessName || "Client";
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
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const { relationship } = await ctx.runQuery(
      internal.clientAuthInternal.getRelationshipForOwner,
      { userId: principal.userId, relationshipId: args.relationshipId }
    );

    const email = cleanEmail(relationship.email || "");
    const now = Date.now();

    if (relationship.clientUserId) {
      const linkedUser = await ctx.runQuery(internal.clientAuthInternal.getClientUserById, {
        clientUserId: relationship.clientUserId,
      });
      if (linkedUser?.status === "active") {
        return { inviteUrl: `${appUrl()}/client/login`, emailSent: false, status: "active" };
      }
    }

    const existingClientUser = await ctx.runQuery(
      internal.clientAuthInternal.getClientUserByEmail,
      { email }
    );

    let clientUserId = relationship.clientUserId as Id<"clientUsers"> | undefined;
    let pendingInviteClientUserId: Id<"clientUsers"> | undefined;

    if (!clientUserId && existingClientUser) {
      pendingInviteClientUserId = existingClientUser._id;
    } else if (!clientUserId) {
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
    });

    return { inviteUrl, emailSent: true, status: "pending" };
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
      throw new Error(genericError);
    }

    const ok = await verifyBcryptPassword(args.password, clientUser.passwordHash);
    if (!ok) throw new Error(genericError);

    const session = await issueSession(ctx, {
      principalType: "client",
      clientUserId: clientUser._id,
    });
    return { clientUserId: clientUser._id, ...session };
  },
});
