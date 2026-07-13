import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireVerifiedStaffSession } from "../lib/sessionAuth";

export const getMyReferrals = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    // The referral program is available to the authenticated user's own account
    // (including owners/managers with referral codes), not only role=affiliate.
    // The claimed ID remains a mismatch guard and never selects the principal.
    const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
    if (!user.referralCode) return [];

    const referred = await ctx.db
      .query("users")
      .withIndex("by_referredByCode", (q) =>
        q.eq("referredByCode", user.referralCode)
      )
      .collect();

    return referred.map((r) => ({
      userId: r._id,
      name: r.name,
      email: r.email,
      createdAt: r._creationTime,
    }));
  },
});
