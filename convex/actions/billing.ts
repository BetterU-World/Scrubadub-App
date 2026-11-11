"use node";

// Node types for process.env in Convex "use node" runtime
declare const process: { env: Record<string, string | undefined> };

import { winnerAwardEnd, cancellationParameters } from "../lib/winnerBilling";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

import { planToEnvVar, planToTier, type ScrubPlan } from "../lib/plans";
import { requireOwnerSession } from "../lib/sessions";
import { getStripeClientOrNull } from "../lib/stripe";
import { requireAppUrl } from "../lib/environment";
import { subscriptionDisclosure, SUBSCRIPTION_TERMS_VERSION } from "../lib/subscriptionDisclosure";

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
  return getStripeClientOrNull();
}

export const createCheckoutSession = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    tier: v.union(v.literal("cleaning_owner"), v.literal("str_owner")),
    plan: v.optional(v.union(v.literal("solo"), v.literal("team"), v.literal("pro"))),
  },
  handler: async (ctx: any, args: any): Promise<any> => {
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const data: any = await ctx.runQuery(
      internal.queries.billing.getCompanyForBilling,
      { userId: principal.userId }
    );
    if (!data) throw new Error("User or company not found");
    if (data.role !== "owner") throw new Error("Only owners can subscribe");

    const stripe: any = getStripe();

    // Create or retrieve Stripe customer
    let customerId: string | undefined = data.stripeCustomerId;

    if (!customerId) {
      const customer: any = await stripe.customers.create({
        email: data.email,
        metadata: { companyId: data.companyId, ownerUserId: principal.userId },
      });

      customerId = customer.id as string;

      // customerId is definitely set here
      await ctx.runMutation(internal.mutations.billing.setStripeCustomerId, {
        companyId: data.companyId,
        stripeCustomerId: customerId,
      });
    }

    const APP_URL = requireAppUrl();

    // Use new plan arg if provided, fallback to "pro" for legacy callers
    const selectedPlan: ScrubPlan = args.plan ?? "pro";
    const priceId = getPriceIdForPlan(selectedPlan);
    const internalTier = planToTier(selectedPlan);
    const disclosure = subscriptionDisclosure(await stripe.prices.retrieve(priceId), selectedPlan, APP_URL);
    const session: any = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          companyId: data.companyId,
          ownerUserId: principal.userId,
          tier: internalTier,
        },
      },
      allow_promotion_codes: true,
      ...disclosure,
      success_url: `${APP_URL}/billing/success`,
      cancel_url: `${APP_URL}/billing/cancel`,
      metadata: {
        subscriptionTermsVersion: SUBSCRIPTION_TERMS_VERSION,
        companyId: data.companyId,
        ownerUserId: principal.userId,
        tier: internalTier,
      },
    });

    return session.url ?? null;
  },
});

export const createBillingPortalSession = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx: any, args: any): Promise<any> => {
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const data: any = await ctx.runQuery(
      internal.queries.billing.getCompanyForBilling,
      { userId: principal.userId }
    );
    if (!data) throw new Error("User or company not found");
    if (data.role !== "owner") throw new Error("Only owners can manage billing");
    if (!data.stripeCustomerId) throw new Error("No billing account found");

    const stripe: any = getStripe();
    const APP_URL = requireAppUrl();

    let configuration: string | undefined;
    if (data.stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(data.stripeSubscriptionId, { expand: ["discounts.source.coupon"] });
      const award = winnerAwardEnd(sub, process.env.SCRUB_WINNER_PROMOTION_CODE_ID);
      if (award && award * 1000 > Date.now()) {
        configuration = process.env.STRIPE_WINNER_PORTAL_CONFIGURATION_ID;
        if (!configuration) throw new Error("Use Cancel automatic renewal below; winner billing portal configuration is not ready");
        const config = await stripe.billingPortal.configurations.retrieve(configuration);
        if (!config.active || config.features.subscription_cancel.enabled || config.features.subscription_update.enabled) {
          throw new Error("Winner portal must preserve awarded access; use Cancel automatic renewal below");
        }
      }
    }
    const session: any = await stripe.billingPortal.sessions.create({
      ...(configuration ? { configuration } : {}),
      customer: data.stripeCustomerId,
      return_url: APP_URL,
    });

    return session.url ?? null;
  },
});

/** One-step authenticated cancellation. A winner cancels at the entire award end, not this month's invoice end. */
export const cancelAutomaticRenewal = action({
  args: { userId: v.id("users"), sessionToken: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const data = await ctx.runQuery(internal.queries.billing.getCompanyForBilling, { userId: principal.userId });
    if (!data?.stripeSubscriptionId || !data.stripeCustomerId) throw new Error("No subscription found");
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(data.stripeSubscriptionId, { expand: ["discounts.source.coupon"] });
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    if (customerId !== data.stripeCustomerId) throw new Error("Subscription customer mismatch");
    const award = winnerAwardEnd(sub, process.env.SCRUB_WINNER_PROMOTION_CODE_ID);
    // Setting the desired cancellation state is idempotent. A permanent request key would
    // incorrectly replay an old result if the owner resumed and canceled again within 24 hours.
    if ((award && sub.cancel_at !== award) || (!sub.cancel_at && !sub.cancel_at_period_end)) {
      await stripe.subscriptions.update(sub.id, cancellationParameters(sub, award));
    }
    return null;
  },
});
