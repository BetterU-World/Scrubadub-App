import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Internal mutation: store Stripe Connect account ID on company.
 */
export const setCompanyStripeConnectAccount = internalMutation({
  args: {
    companyId: v.id("companies"),
    stripeConnectAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");
    if (company.stripeConnectAccountId && company.stripeConnectAccountId !== args.stripeConnectAccountId) {
      throw new Error("Company already has a different Stripe account");
    }
    await ctx.db.patch(args.companyId, {
      stripeConnectAccountId: args.stripeConnectAccountId,
    });
  },
});

export const syncCompanyStripeConnectStatus = internalMutation({
  args: {
    stripeConnectAccountId: v.string(),
    observedAt: v.number(),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
    detailsSubmitted: v.boolean(),
    requirementsDue: v.boolean(),
    disabledReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.query("companies")
      .withIndex("by_stripeConnectAccountId", q => q.eq("stripeConnectAccountId", args.stripeConnectAccountId))
      .unique();
    if (!company) return false;
    if ((company.stripeConnectStatusObservedAt ?? 0) > args.observedAt) return false;
    await ctx.db.patch(company._id, {
      stripeConnectChargesEnabled: args.chargesEnabled,
      stripeConnectPayoutsEnabled: args.payoutsEnabled,
      stripeConnectDetailsSubmitted: args.detailsSubmitted,
      stripeConnectRequirementsDue: args.requirementsDue,
      stripeConnectDisabledReason: args.disabledReason,
      stripeConnectLastSyncAt: Date.now(),
      stripeConnectStatusObservedAt: args.observedAt,
    });
    return true;
  },
});
