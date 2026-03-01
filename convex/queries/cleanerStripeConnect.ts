import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

/**
 * Public query: returns the cleaner's own Stripe Connect status.
 */
export const getCleanerConnectStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    return {
      stripeConnectAccountId: user.stripeConnectAccountId ?? null,
      stripeConnectOnboardingStatus: user.stripeConnectOnboardingStatus ?? null,
      stripeConnectPayoutsEnabled: user.stripeConnectPayoutsEnabled ?? null,
    };
  },
});

/**
 * Internal query: get cleaner user data for Connect actions.
 */
export const getCleanerForConnect = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.status === "inactive") return null;
    return {
      userId: user._id,
      email: user.email,
      name: user.name,
      companyId: user.companyId,
      stripeConnectAccountId: user.stripeConnectAccountId ?? null,
    };
  },
});
