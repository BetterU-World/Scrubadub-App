import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

/**
 * Generate a URL-safe referral code (8-12 chars, lowercase a-z0-9).
 */
function generateCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const length = 8 + Math.floor(Math.random() * 5); // 8–12
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const ensureReferralCode = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    // Already has a code — return it immediately
    if (user.referralCode) {
      return user.referralCode;
    }

    // Generate a collision-safe code
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

export const setReferredByCode = mutation({
  args: { userId: v.id("users"), refCode: v.string() },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    // Already attributed — do nothing
    if (user.referredByCode) return;

    // Validate the referral code exists
    const referrer = await ctx.db
      .query("users")
      .withIndex("by_referralCode", (q) => q.eq("referralCode", args.refCode))
      .first();

    if (!referrer) return; // invalid code — silently ignore
    if (referrer._id === user._id) return; // prevent self-referral

    await ctx.db.patch(user._id, {
      referredByCode: args.refCode,
      referredByUserId: referrer._id,
    });
  },
});
