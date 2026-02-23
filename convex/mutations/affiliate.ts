import { mutation } from "../_generated/server";
import { v } from "convex/values";

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
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

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
        await ctx.db.patch(args.userId, { referralCode: code });
        return code;
      }
    }

    throw new Error("Unable to generate a unique referral code. Please try again.");
  },
});
