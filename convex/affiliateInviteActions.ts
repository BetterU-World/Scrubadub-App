"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { generateSecureToken } from "./lib/tokens";
import { validateEmail, validateName } from "./lib/validation";
import { validateRequiredEnv } from "./lib/validateEnv";
import { requireSuperadminSession } from "./lib/sessions";

validateRequiredEnv();

/** Affiliate invite expiry: 7 days */
const AFFILIATE_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Create an affiliate invite. Superadmin only.
 * Creates a pending user with role=affiliate and no companyId.
 */
export const inviteAffiliate = action({
  args: {
    callerUserId: v.id("users"),
    sessionToken: v.string(),
    email: v.string(),
    name: v.string(),
    sendEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    token: string;
    userId: Id<"users">;
    inviteUrl: string;
  }> => {
    // 1. Verify superadmin
    const principal = await requireSuperadminSession(ctx as any, args.sessionToken, args.callerUserId);

    // 2. Validate inputs
    validateEmail(args.email);
    validateName(args.name);

    // 3. Rate limit
    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: "superadmin:inviteAffiliate",
      limit: 20,
      windowMs: 60_000,
    });

    const email = args.email.toLowerCase();

    // 4. Check email not already registered (any role)
    const existing = await ctx.runQuery(internal.authInternal.getUserByEmail, {
      email,
    });
    if (existing) {
      throw new Error("A user with this email already exists");
    }

    // 5. Generate secure token
    const token = generateSecureToken();

    // 6. Create affiliate user (pending, no company)
    const userId: Id<"users"> = await ctx.runMutation(
      internal.mutations.affiliateInvites.createAffiliateUser,
      {
        email,
        name: args.name,
        inviteToken: token,
        inviteTokenExpiry: Date.now() + AFFILIATE_INVITE_EXPIRY_MS,
        affiliateInvitedBy: principal.userId,
      }
    );

    // 7. Build invite URL
    const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
    const inviteUrl = `${appUrl}/invite/${token}`;

    // 8. Optionally send invite email via Resend
    if (args.sendEmail) {
      await ctx.runMutation(
        internal.mutations.scheduleEmail.scheduleAffiliateInviteEmail,
        { email, inviteToken: token, name: args.name }
      );
    }

    return { token, userId, inviteUrl };
  },
});

/**
 * Resend an affiliate invite with a fresh token. Superadmin only.
 * Works for pending affiliates (including those with expired tokens).
 */
export const resendAffiliateInvite = action({
  args: {
    callerUserId: v.id("users"),
    sessionToken: v.string(),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{
    token: string;
    inviteUrl: string;
  }> => {
    // 1. Verify superadmin
    await requireSuperadminSession(ctx as any, args.sessionToken, args.callerUserId);

    // 2. Rate limit
    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: "superadmin:resendAffiliateInvite",
      limit: 20,
      windowMs: 60_000,
    });

    // 3. Fetch target user
    const target: any = await ctx.runQuery(internal.authQueries.getUser, {
      userId: args.targetUserId,
    });
    if (!target) throw new Error("User not found");
    if (target.role !== "affiliate") throw new Error("User is not an affiliate");
    if (target.status !== "pending") {
      throw new Error("Can only resend invites for pending affiliates");
    }

    // 4. Generate fresh token with new 7-day expiry
    const token = generateSecureToken();

    await ctx.runMutation(
      internal.mutations.affiliateInvites.updateAffiliateInviteToken,
      {
        userId: args.targetUserId,
        inviteToken: token,
        inviteTokenExpiry: Date.now() + AFFILIATE_INVITE_EXPIRY_MS,
      }
    );

    // 5. Build invite URL
    const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
    const inviteUrl = `${appUrl}/invite/${token}`;

    // 6. Send invite email via Resend
    await ctx.runMutation(
      internal.mutations.scheduleEmail.scheduleAffiliateInviteEmail,
      { email: target.email, inviteToken: token, name: target.name }
    );

    return { token, inviteUrl };
  },
});
