import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAffiliateSession } from "../lib/sessionAuth";

export const getMyReferrals = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAffiliateSession(ctx, args.sessionToken, args.userId);
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
