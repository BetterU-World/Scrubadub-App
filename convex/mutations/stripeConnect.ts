import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { retireLegacyOutgoing } from "../lib/legacyOutgoingRetirement";

/**
 * Internal mutation: store Stripe Connect account ID and set status to in_progress.
 */
export const setStripeConnectAccount = internalMutation({
  args: {
    userId: v.id("users"),
    stripeConnectAccountId: v.string(),
  },
  handler: async () => retireLegacyOutgoing(),
});

/**
 * Internal mutation: store affiliate Stripe Connect account ID on user.
 */
export const setAffiliateStripeAccount = internalMutation({
  args: {
    userId: v.id("users"),
    affiliateStripeAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      affiliateStripeAccountId: args.affiliateStripeAccountId,
      affiliateStripeOnboardedAt: Date.now(),
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
  handler: async () => retireLegacyOutgoing(),
});
