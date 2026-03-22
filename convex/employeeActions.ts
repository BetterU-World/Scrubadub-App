"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { hashPassword } from "./lib/password";
import { generateSecureToken, INVITE_TOKEN_EXPIRY_MS } from "./lib/tokens";
import { validatePassword, validateEmail, validateName } from "./lib/validation";
import { validateRequiredEnv } from "./lib/validateEnv";

validateRequiredEnv();

export const inviteCleaner = action({
  args: {
    companyId: v.id("companies"),
    email: v.string(),
    name: v.string(),
    userId: v.id("users"),
    role: v.optional(v.union(v.literal("cleaner"), v.literal("maintenance"), v.literal("manager"))),
    // Manager permission flags (only used when role === "manager")
    canSeeAllJobs: v.optional(v.boolean()),
    canCreateJobs: v.optional(v.boolean()),
    canAssignCleaners: v.optional(v.boolean()),
    canRequestRework: v.optional(v.boolean()),
    canApproveForms: v.optional(v.boolean()),
    canManageSchedule: v.optional(v.boolean()),
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

    // Enforce cleaner cap — only when adding a cleaner role
    const role = args.role ?? "cleaner";
    if (role === "cleaner") {
      const capResult: any = await ctx.runQuery(
        internal.queries.billing.getCleanerUsage,
        { companyId: args.companyId }
      );
      if (capResult && capResult.limit !== null && capResult.activeCleaners >= capResult.limit) {
        const planName = capResult.planName ?? "your current plan";
        throw new Error(
          `Your ${planName} plan includes ${capResult.limit === 1 ? "1 cleaner" : `up to ${capResult.limit} cleaners`}. Upgrade to add more cleaners.`
        );
      }
    }

    const email = args.email.toLowerCase();

    const existing = await ctx.runQuery(internal.authInternal.getUserByEmail, {
      email,
    });
    if (existing) throw new Error("Email already registered");

    const token = generateSecureToken();

    const createArgs: Record<string, unknown> = {
      email,
      passwordHash: "",
      name: args.name,
      companyId: args.companyId,
      role,
      status: "pending",
      inviteToken: token,
      inviteTokenExpiry: Date.now() + INVITE_TOKEN_EXPIRY_MS,
    };
    // Pass manager permission flags when creating a manager
    if (role === "manager") {
      createArgs.canSeeAllJobs = args.canSeeAllJobs ?? false;
      createArgs.canCreateJobs = args.canCreateJobs ?? false;
      createArgs.canAssignCleaners = args.canAssignCleaners ?? false;
      createArgs.canRequestRework = args.canRequestRework ?? false;
      createArgs.canApproveForms = args.canApproveForms ?? false;
      createArgs.canManageSchedule = args.canManageSchedule ?? false;
    }

    const newUserId: Id<"users"> = await ctx.runMutation(
      internal.authInternal.createUser,
      createArgs as any
    );

    await ctx.runMutation(internal.authInternal.logAuditEntry, {
      companyId: args.companyId,
      userId: args.userId,
      action: `invite_${role}`,
      entityType: "user",
      entityId: newUserId,
      details: `Invited ${email} as ${role}`,
    });

    // Schedule invite email async — does not block the response
    await ctx.runMutation(internal.mutations.scheduleEmail.scheduleInviteEmail, {
      email,
      inviteToken: token,
    });

    return { token, userId: newUserId, emailSent: true };
  },
});

/**
 * Resend the invite email for a pending user who didn't receive it.
 * Only the owner can trigger this, and the user must still be in "pending" status.
 */
export const resendInviteEmail = action({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    employeeEmail: v.string(),
  },
  handler: async (ctx, args): Promise<{ emailSent: boolean }> => {
    const isOwner: boolean = await ctx.runQuery(
      internal.clientPortalInternal.verifyOwner,
      { userId: args.userId, companyId: args.companyId }
    );
    if (!isOwner) throw new Error("Owner access required");

    const email = args.employeeEmail.toLowerCase();
    const user = await ctx.runQuery(internal.authInternal.getUserByEmail, { email });
    if (!user) throw new Error("Employee not found");
    if (user.status !== "pending") throw new Error("Employee already accepted invite");
    if (user.companyId !== args.companyId) throw new Error("Employee not in your company");
    if (!user.inviteToken) throw new Error("No invite token found");

    await ctx.runMutation(internal.mutations.scheduleEmail.scheduleInviteEmail, {
      email,
      inviteToken: user.inviteToken,
    });
    return { emailSent: true };
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

    // Rate limit by first 8 chars of token to avoid storing full token as key
    const tokenPrefix = args.token.slice(0, 8);
    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `tp:${tokenPrefix}:acceptInvite`,
      limit: 5,
      windowMs: 60_000,
    });

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