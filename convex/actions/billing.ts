"use node";

// Node types for process.env in Convex "use node" runtime
declare const process: { env: Record<string, string | undefined> };

import Stripe from "stripe";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

import { planToEnvVar, planToTier, type ScrubPlan } from "../lib/plans";

/**
 * Resolve the Stripe price ID for a given plan.
 * Falls back to STRIPE_PRICE_SCRUB_PRO for the legacy "cleaning_owner" tier arg.
 */
function getPriceIdForPlan(plan: ScrubPlan): string {
  const envVar = planToEnvVar(plan);
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(`${envVar} env var not set`);
  }
  return priceId;
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export const createCheckoutSession = action({
  args: {
    userId: v.id("users"),
    tier: v.union(v.literal("cleaning_owner"), v.literal("str_owner")),
    plan: v.optional(v.union(v.literal("solo"), v.literal("team"), v.literal("pro"))),
  },
  handler: async (ctx: any, args: any): Promise<any> => {
    const data: any = await ctx.runQuery(
      internal.queries.billing.getCompanyForBilling,
      { userId: args.userId }
    );
    if (!data) throw new Error("User or company not found");
    if (data.role !== "owner") throw new Error("Only owners can subscribe");

    const stripe: any = getStripe();

    // Create or retrieve Stripe customer
    let customerId: string | undefined = data.stripeCustomerId;

    if (!customerId) {
      const customer: any = await stripe.customers.create({
        email: data.email,
        metadata: { companyId: data.companyId, ownerUserId: args.userId },
      });

      customerId = customer.id as string;

      // customerId is definitely set here
      await ctx.runMutation(internal.mutations.billing.setStripeCustomerId, {
        companyId: data.companyId,
        stripeCustomerId: customerId,
      });
    }

    const APP_URL =
      process.env.APP_URL ?? "https://scrubadub-app-frontend.vercel.app";

    // Use new plan arg if provided, fallback to "pro" for legacy callers
    const selectedPlan: ScrubPlan = args.plan ?? "pro";
    const priceId = getPriceIdForPlan(selectedPlan);
    const internalTier = planToTier(selectedPlan);
    const session: any = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          companyId: data.companyId,
          ownerUserId: args.userId,
          tier: internalTier,
        },
      },
      allow_promotion_codes: true,
      success_url: `${APP_URL}/billing/success`,
      cancel_url: `${APP_URL}/billing/cancel`,
      metadata: {
        companyId: data.companyId,
        ownerUserId: args.userId,
        tier: internalTier,
      },
    });

    return session.url ?? null;
  },
});

export const createBillingPortalSession = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx: any, args: any): Promise<any> => {
    const data: any = await ctx.runQuery(
      internal.queries.billing.getCompanyForBilling,
      { userId: args.userId }
    );
    if (!data) throw new Error("User or company not found");
    if (data.role !== "owner") throw new Error("Only owners can manage billing");
    if (!data.stripeCustomerId) throw new Error("No billing account found");

    const stripe: any = getStripe();
    const APP_URL =
      process.env.APP_URL ?? "https://scrubadub-app-frontend.vercel.app";

    const session: any = await stripe.billingPortal.sessions.create({
      customer: data.stripeCustomerId,
      return_url: APP_URL,
    });

    return session.url ?? null;
  },
});
