"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { generateSecureToken } from "./lib/tokens";
import { validateEmail, validateName } from "./lib/validation";
import { validateRequiredEnv } from "./lib/validateEnv";
import { isSuperAdminEmail } from "./lib/auth";

validateRequiredEnv();

/** Affiliate invite expiry: 7 days */
const AFFILIATE_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Verify caller is a superadmin via internal query + email check.
 * Actions cannot use requireSuperAdmin() directly (no QueryCtx),
 * so we fetch the user record and check the email list.
 */
async function verifySuperAdmin(
  ctx: { runQuery: Function },
  callerUserId: Id<"users">
) {
  const caller: any = await ctx.runQuery(internal.authQueries.getUser, {
    userId: callerUserId,
  });
  if (!caller) throw new Error("Authentication required");
  if (!isSuperAdminEmail(caller.email)) {
    throw new Error("Super admin access required");
  }
  return caller;
}

/**
 * Create an affiliate invite. Superadmin only.
 * Creates a pending user with role=affiliate and no companyId.
 */
export const inviteAffiliate = action({
  args: {
    callerUserId: v.id("users"),
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
    await verifySuperAdmin(ctx, args.callerUserId);

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
        affiliateInvitedBy: args.callerUserId,
      }
    );

    // 7. Build invite URL
    const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
    const inviteUrl = `${appUrl}/invite/${token}`;

    // 8. Email sending will be wired in Step 4
    // if (args.sendEmail) { ... }

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
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{
    token: string;
    inviteUrl: string;
  }> => {
    // 1. Verify superadmin
    await verifySuperAdmin(ctx, args.callerUserId);

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

    // 6. Email sending will be wired in Step 4

    return { token, inviteUrl };
  },
});
