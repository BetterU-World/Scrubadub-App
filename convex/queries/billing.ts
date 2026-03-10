import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { isFounderEmail } from "../lib/founderEmails";

/** Safe fallback when subscription data cannot be determined yet. */
const EMPTY_SUB = {
  subscriptionStatus: undefined as string | undefined,
  tier: undefined as string | undefined,
  currentPeriodEnd: undefined as number | undefined,
  cancelAtPeriodEnd: undefined as boolean | undefined,
  subscriptionBecameInactiveAt: undefined as number | undefined,
  stripeCustomerId: undefined as string | undefined,
  companyBypassed: false,
};

export const getCompanySubscription = query({
  args: { companyId: v.id("companies"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    // No userId → can't verify access
    if (!args.userId) return EMPTY_SUB;

    // Caller must exist and belong to this company
    const caller = await ctx.db.get(args.userId);
    if (!caller || caller.status === "inactive") return EMPTY_SUB;
    if (caller.companyId !== args.companyId) return EMPTY_SUB;

    const company = await ctx.db.get(args.companyId);
    if (!company) return EMPTY_SUB;

    // Check if any owner in this company is a founder → company-level bypass
    let hasSuperadminOwner = false;
    try {
      const owners = await ctx.db
        .query("users")
        .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
        .collect();
      hasSuperadminOwner = owners.some(
        (u) => u.role === "owner" && isFounderEmail(u.email)
      );
    } catch {
      // If the founder check fails, continue without bypass
    }

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
