import { internalMutation, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "../lib/auth";

// ── Internal mutation: create an affiliate user record ─────────────
// Separate from authInternal.createUser because that mutation's validators
// don't accept role="affiliate" or optional companyId.

export const createAffiliateUser = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    inviteToken: v.string(),
    inviteTokenExpiry: v.float64(),
    affiliateInvitedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", {
      email: args.email,
      passwordHash: "",
      name: args.name,
      role: "affiliate",
      status: "pending",
      inviteToken: args.inviteToken,
      inviteTokenExpiry: args.inviteTokenExpiry,
      affiliateInvitedBy: args.affiliateInvitedBy,
    });
  },
});

// ── Internal mutation: update invite token for resend ──────────────

export const updateAffiliateInviteToken = internalMutation({
  args: {
    userId: v.id("users"),
    inviteToken: v.string(),
    inviteTokenExpiry: v.float64(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      inviteToken: args.inviteToken,
      inviteTokenExpiry: args.inviteTokenExpiry,
    });
  },
});

// ── Internal mutation: generate referral code on invite acceptance ──
// Mirrors the logic in mutations/affiliate.ts ensureReferralCode, but
// as an internalMutation so acceptInvite (an action) can call it without
// a session auth check — the action already validated via invite token.

function generateCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const length = 8 + Math.floor(Math.random() * 5); // 8–12
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const ensureReferralCodeInternal = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.referralCode) return user.referralCode;

    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateCode();
      const existing = await ctx.db
        .query("users")
        .withIndex("by_referralCode", (q) => q.eq("referralCode", code))
        .first();

      if (!existing) {
        await ctx.db.patch(user._id, { referralCode: code });
        return code;
      }
    }

    throw new Error("Unable to generate a unique referral code. Please try again.");
  },
});

// ── Public mutation: revoke an affiliate invite (superadmin only) ──

export const revokeAffiliateInvite = mutation({
  args: {
    callerUserId: v.id("users"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.callerUserId);

    const target = await ctx.db.get(args.targetUserId);
    if (!target) throw new Error("User not found");
    if (target.role !== "affiliate") throw new Error("User is not an affiliate");

    // Allow revoking pending invites or disabling active affiliates
    if (target.status === "inactive") {
      throw new Error("Affiliate is already revoked");
    }

    await ctx.db.patch(args.targetUserId, {
      status: "inactive",
      inviteToken: undefined,
      inviteTokenExpiry: undefined,
    });

    return { success: true };
  },
});
