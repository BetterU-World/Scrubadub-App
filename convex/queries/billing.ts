import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";

// Same list used in authQueries.ts — company-level bypass for dev/testing
const SUPERADMIN_EMAILS: string[] = ["dzbfyse@gmail.com"];

export const getCompanySubscription = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) return null;

    // Check if any owner in this company is a superadmin → company-level bypass
    const owners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    const hasSuperadminOwner = owners.some(
      (u) => u.role === "owner" && SUPERADMIN_EMAILS.includes(u.email)
    );

    return {
      subscriptionStatus: company.subscriptionStatus,
      tier: company.tier,
      currentPeriodEnd: company.currentPeriodEnd,
      cancelAtPeriodEnd: company.cancelAtPeriodEnd,
      subscriptionBecameInactiveAt: company.subscriptionBecameInactiveAt,
      stripeCustomerId: company.stripeCustomerId,
      companyBypassed: hasSuperadminOwner,
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
