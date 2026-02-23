import { query } from "../_generated/server";
import { getSessionUser } from "../lib/auth";

export const getMyReferrals = query({
  args: {},
  handler: async (ctx) => {
    const user = await getSessionUser(ctx).catch(() => null);
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
