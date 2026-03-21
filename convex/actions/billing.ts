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

/** TEMPORARY DIAGNOSTIC — remove after debugging price issue */
async function logCheckoutDiagnostic(action: string, priceId: string, stripe: Stripe) {
  const raw = process.env.STRIPE_PRICE_SCRUB_PRO;
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const keyHint = key.length > 8 ? `${key.slice(0, 7)}...${key.slice(-4)}` : "(not set)";
  console.log(
    `[STRIPE-DIAG] action=${action} | priceEnvPresent=${raw !== undefined} | priceId=${priceId} | keyHint=${keyHint}`
  );
  try {
    const acct = await stripe.accounts.retrieve();
    console.log(
      `[STRIPE-DIAG] account | id=${acct.id} | country=${acct.country} | currency=${acct.default_currency} | name=${acct.business_profile?.name ?? "(none)"}`
    );
  } catch (err: any) {
    console.log(`[STRIPE-DIAG] account.retrieve FAILED | error=${err?.message ?? err}`);
  }
  try {
    const list = await stripe.prices.list({ active: true, limit: 10 });
    const recurring = list.data.filter((p) => p.type === "recurring");
    console.log(`[STRIPE-DIAG] prices.list | total=${list.data.length} | recurring=${recurring.length}`);
    for (const p of recurring) {
      console.log(
        `[STRIPE-DIAG]   price | id=${p.id} | active=${p.active} | livemode=${p.livemode} | interval=${p.recurring?.interval}/${p.recurring?.interval_count} | product=${p.product}`
      );
    }
  } catch (err: any) {
    console.log(`[STRIPE-DIAG] prices.list FAILED | error=${err?.message ?? err}`);
  }
  try {
    const p = await stripe.prices.retrieve(priceId);
    console.log(
      `[STRIPE-DIAG] price.retrieve OK | id=${p.id} | livemode=${p.livemode} | active=${p.active} | type=${p.type} | recurring=${p.recurring ? p.recurring.interval + "/" + p.recurring.interval_count : "none"} | product=${p.product}`
    );
  } catch (err: any) {
    console.log(`[STRIPE-DIAG] price.retrieve FAILED | error=${err?.message ?? err}`);
  }
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
    await logCheckoutDiagnostic("billing.createCheckoutSession", priceId, stripe);

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