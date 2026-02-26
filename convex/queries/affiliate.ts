import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

export const getMyReferrals = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId).catch(() => null);
    if (!user || !user.referralCode) return [];

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
