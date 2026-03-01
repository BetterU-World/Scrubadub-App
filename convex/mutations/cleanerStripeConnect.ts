import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Internal mutation: store Stripe Connect account ID on user.
 */
export const setCleanerStripeConnectAccount = internalMutation({
  args: {
    userId: v.id("users"),
    stripeConnectAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      stripeConnectAccountId: args.stripeConnectAccountId,
      stripeConnectOnboardingStatus: "in_progress",
    });
  },
});

/**
 * Internal mutation: mark cleaner's connect onboarding as complete.
 */
export const markCleanerConnectOnboarded = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      stripeConnectOnboardingStatus: "complete",
      stripeConnectLastSyncAt: Date.now(),
    });
  },
});
