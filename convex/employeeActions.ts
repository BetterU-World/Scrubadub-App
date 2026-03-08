"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { hashPassword } from "./lib/password";
import { generateSecureToken, INVITE_TOKEN_EXPIRY_MS } from "./lib/tokens";
import { validatePassword, validateEmail, validateName } from "./lib/validation";
import { sendInviteEmail } from "./lib/email";

export const inviteCleaner = action({
  args: {
    companyId: v.id("companies"),
    email: v.string(),
    name: v.string(),
    userId: v.id("users"),
    role: v.optional(v.union(v.literal("cleaner"), v.literal("maintenance"))),
  },
  handler: async (ctx, args): Promise<{ token: string; userId: Id<"users">; emailSent: boolean }> => {
    // Verify the caller is an active owner of the target company
    const isOwner: boolean = await ctx.runQuery(
      internal.clientPortalInternal.verifyOwner,
      { userId: args.userId, companyId: args.companyId }
    );
    if (!isOwner) {
      throw new Error("Owner access required");
    }

    validateEmail(args.email);
    validateName(args.name);

    await ctx.runQuery(internal.authInternal.checkSubscription, {
      companyId: args.companyId,
    });

    const email = args.email.toLowerCase();
    const role = args.role ?? "cleaner";

    const existing = await ctx.runQuery(internal.authInternal.getUserByEmail, {
      email,
    });
    if (existing) throw new Error("Email already registered");

    const token = generateSecureToken();

    const newUserId: Id<"users"> = await ctx.runMutation(
      internal.authInternal.createUser,
      {
        email,
        passwordHash: "",
        name: args.name,
        companyId: args.companyId,
        role,
        status: "pending",
        inviteToken: token,
        inviteTokenExpiry: Date.now() + INVITE_TOKEN_EXPIRY_MS,
      }
    );

    await ctx.runMutation(internal.authInternal.logAuditEntry, {
      companyId: args.companyId,
      userId: args.userId,
      action: `invite_${role}`,
      entityType: "user",
      entityId: newUserId,
      details: `Invited ${email} as ${role}`,
    });

    // Send invite email (non-blocking — invite creation succeeds regardless)
    const emailSent = await sendInviteEmail(email, token);
    if (!emailSent) {
      console.error(`[employee] Invite email failed to send to ${email}, but invite was created successfully`);
    }

    return { token, userId: newUserId, emailSent };
  },
});

export const acceptInvite = action({
  args: {
    token: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args): Promise<{
    userId: Id<"users">;
    email: string;
    name: string;
    role: string;
    companyId: Id<"companies">;
  }> => {
    validatePassword(args.password);

    const user = await ctx.runQuery(internal.authInternal.getUserByinviteToken, {
      tokenHash: args.token,
    });

    if (!user) throw new Error("Invalid or expired invite link");
    if (user.status !== "pending") throw new Error("Invite already used");
    if (user.inviteTokenExpiry && user.inviteTokenExpiry < Date.now()) {
      throw new Error("Invalid or expired invite link");
    }

    const passwordHash = await hashPassword(args.password);

    await ctx.runMutation(internal.authInternal.consumeInviteToken, {
      userId: user._id,
      passwordHash,
    });

    await ctx.runMutation(internal.authInternal.logAuditEntry, {
      companyId: user.companyId,
      userId: user._id,
      action: "accept_invite",
      entityType: "user",
      entityId: user._id,
    });

    return {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    };
  },
});