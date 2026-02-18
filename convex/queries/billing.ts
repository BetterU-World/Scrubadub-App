import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getCompanySubscription = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) return null;
    return {
      subscriptionStatus: company.subscriptionStatus,
      tier: company.tier,
      currentPeriodEnd: company.currentPeriodEnd,
      cancelAtPeriodEnd: company.cancelAtPeriodEnd,
      subscriptionBecameInactiveAt: company.subscriptionBecameInactiveAt,
      stripeCustomerId: company.stripeCustomerId,
    };
  },
});

export const getCompanyForBilling = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const company = await ctx.db.get(user.companyId);
    if (!company) return null;
    return {
      companyId: user.companyId,
      role: user.role,
      email: user.email,
      stripeCustomerId: company.stripeCustomerId,
    };
  },
});
