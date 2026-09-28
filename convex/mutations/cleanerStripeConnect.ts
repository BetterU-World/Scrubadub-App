import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { retireLegacyOutgoing } from "../lib/legacyOutgoingRetirement";

/**
 * Internal mutation: store Stripe Connect account ID on user.
 */
export const setCleanerStripeConnectAccount = internalMutation({
  args: {
    userId: v.id("users"),
    stripeConnectAccountId: v.string(),
  },
  handler: async () => retireLegacyOutgoing(),
});
