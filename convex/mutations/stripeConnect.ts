import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Internal mutation: store Stripe Connect account ID and set status to in_progress.
 */
export const setStripeConnectAccount = internalMutation({
  args: {
    userId: v.id("users"),
    stripeConnectAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      stripeConnectAccountId: args.stripeConnectAccountId,
      stripeConnectOnboardingStatus: "in_progress",
      stripeConnectLastSyncAt: Date.now(),
    });
  },
});

/**
 * Internal mutation: sync Stripe Connect status flags on user record.
 */
export const syncStripeConnectFields = internalMutation({
  args: {
    userId: v.id("users"),
    payoutsEnabled: v.boolean(),
    detailsSubmitted: v.boolean(),
    requirementsDue: v.string(),
    onboardingStatus: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("complete")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      stripeConnectPayoutsEnabled: args.payoutsEnabled,
      stripeConnectDetailsSubmitted: args.detailsSubmitted,
      stripeConnectRequirementsDue: args.requirementsDue,
      stripeConnectOnboardingStatus: args.onboardingStatus,
      stripeConnectLastSyncAt: Date.now(),
    });
  },
});
