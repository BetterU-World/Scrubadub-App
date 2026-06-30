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
    await ctx.db.patch(args.companyId, {
      stripeConnectAccountId: args.stripeConnectAccountId,
    });
  },
});
