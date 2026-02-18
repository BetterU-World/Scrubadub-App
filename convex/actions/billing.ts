"use node";

// Node types for process.env in Convex "use node" runtime
declare const process: { env: Record<string, string | undefined> };

import Stripe from "stripe";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

const PRICE_IDS = {
  cleaning_owner: "price_1T1qhM9bHruUzqYi7qMlyhFq",
  str_owner: "price_1T1qhu9bHruUZqYiR0lus6To",
} as const;

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export const createCheckoutSession = action({
  args: {
    userId: v.id("users"),
    tier: v.union(v.literal("cleaning_owner"), v.literal("str_owner")),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.queries.billing.getCompanyForBilling,
      { userId: args.userId }
    );
    if (!data) throw new Error("User or company not found");
    if (data.role !== "owner") throw new Error("Only owners can subscribe");

    const stripe = getStripe();

    // Create or retrieve Stripe customer
    let customerId = data.stripeCustomerId as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: data.email,
        metadata: { companyId: data.companyId, ownerUserId: args.userId },
      });
      customerId = customer.id;
      await ctx.runMutation(
        internal.mutations.billing.setStripeCustomerId,
        { companyId: data.companyId, stripeCustomerId: customerId }
      );
    }

    const APP_URL =
      process.env.APP_URL ?? "https://scrubadub-app-frontend.vercel.app";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: PRICE_IDS[args.tier], quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          companyId: data.companyId,
          ownerUserId: args.userId,
          tier: args.tier,
        },
      },
      allow_promotion_codes: true,
      success_url: `${APP_URL}/billing/success`,
      cancel_url: `${APP_URL}/billing/cancel`,
      metadata: {
        companyId: data.companyId,
        ownerUserId: args.userId,
        tier: args.tier,
      },
    });

    return session.url;
  },
});

export const createBillingPortalSession = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.queries.billing.getCompanyForBilling,
      { userId: args.userId }
    );
    if (!data) throw new Error("User or company not found");
    if (data.role !== "owner") throw new Error("Only owners can manage billing");
    if (!data.stripeCustomerId)
      throw new Error("No billing account found");

    const stripe = getStripe();
    const APP_URL =
      process.env.APP_URL ?? "https://scrubadub-app-frontend.vercel.app";

    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripeCustomerId as string,
      return_url: APP_URL,
    });

    return session.url;
  },
});
