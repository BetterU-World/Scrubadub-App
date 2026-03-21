import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { isFounderEmail } from "../lib/founderEmails";
import { tierToScrubPlan, planDisplayName, planPrice, cleanerLimit } from "../lib/plans";

/** Safe fallback when subscription data cannot be determined yet. */
const EMPTY_SUB = {
  subscriptionStatus: undefined as string | undefined,
  tier: undefined as string | undefined,
  currentPeriodEnd: undefined as number | undefined,
  cancelAtPeriodEnd: undefined as boolean | undefined,
  subscriptionBecameInactiveAt: undefined as number | undefined,
  stripeCustomerId: undefined as string | undefined,
  companyBypassed: false,
  planName: "Pro" as string,
  planPrice: "$149.99" as string,
  scrubPlan: "pro" as string,
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

    const scrubPlan = tierToScrubPlan(company.tier);

    return {
      subscriptionStatus: company.subscriptionStatus,
      tier: company.tier,
      currentPeriodEnd: company.currentPeriodEnd,
      cancelAtPeriodEnd: company.cancelAtPeriodEnd,
      subscriptionBecameInactiveAt: company.subscriptionBecameInactiveAt,
      stripeCustomerId: company.stripeCustomerId,
      companyBypassed: hasSuperadminOwner,
      // Plan metadata for UI
      planName: planDisplayName(scrubPlan),
      planPrice: planPrice(scrubPlan),
      scrubPlan,
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

/**
 * Internal query used by backend cleaner cap enforcement.
 * Returns active cleaner count, plan limit, and plan name.
 */
export const getCleanerUsage = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) return null;
    const scrubPlan = tierToScrubPlan(company.tier);
    const limit = cleanerLimit(scrubPlan);

    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    const activeCleaners = users.filter(
      (u) => u.role === "cleaner" && u.status === "active"
    ).length;

    return {
      activeCleaners,
      limit,
      planName: planDisplayName(scrubPlan),
      scrubPlan,
    };
  },
});

/**
 * Public query for frontend cleaner usage display.
 * Returns active cleaner count and plan limits.
 */
export const getCleanerUsageForUI = query({
  args: { companyId: v.id("companies"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const caller = await ctx.db.get(args.userId);
    if (!caller || caller.companyId !== args.companyId) return null;

    const company = await ctx.db.get(args.companyId);
    if (!company) return null;
    const scrubPlan = tierToScrubPlan(company.tier);
    const limit = cleanerLimit(scrubPlan);

    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    const activeCleaners = users.filter(
      (u) => u.role === "cleaner" && u.status === "active"
    ).length;

    return {
      activeCleaners,
      limit,
      planName: planDisplayName(scrubPlan),
      scrubPlan,
    };
  },
});
