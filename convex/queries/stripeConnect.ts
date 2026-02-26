import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

/**
 * Public query: returns the caller's Stripe Connect onboarding state.
 * Reactive — updates live when the user record changes.
 */
export const getMyStripeConnectStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    return {
      stripeConnectAccountId: user.stripeConnectAccountId ?? null,
      onboardingStatus: user.stripeConnectOnboardingStatus ?? "not_started",
      payoutsEnabled: user.stripeConnectPayoutsEnabled ?? false,
      detailsSubmitted: user.stripeConnectDetailsSubmitted ?? false,
      requirementsDue: user.stripeConnectRequirementsDue ?? null,
      lastSyncAt: user.stripeConnectLastSyncAt ?? null,
    };
  },
});

/**
 * Internal query used by Stripe Connect actions to fetch user data.
 */
export const getUserForStripeConnect = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.status === "inactive") return null;
    return {
      _id: user._id,
      email: user.email,
      stripeConnectAccountId: user.stripeConnectAccountId ?? null,
    };
  },
});
