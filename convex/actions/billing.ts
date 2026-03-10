"use node";

// Node types for process.env in Convex "use node" runtime
declare const process: { env: Record<string, string | undefined> };

import Stripe from "stripe";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

/**
 * Owner subscription price ID — set via STRIPE_PRICE_SCRUB_PRO env var
 * in the Convex dashboard.
 */
function getOwnerPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_SCRUB_PRO;
  if (!priceId) {
    throw new Error("STRIPE_PRICE_SCRUB_PRO env var not set");
  }
  return priceId;
}

/** @deprecated kept only so the tier arg still compiles; single plan now */
const PRICE_IDS = {
  cleaning_owner: "scrub_pro",
  str_owner: "scrub_pro",
} as const;

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

/** TEMPORARY DIAGNOSTIC — remove after debugging price issue */
function logCheckoutDiagnostic(action: string, priceId: string) {
  const raw = process.env.STRIPE_PRICE_SCRUB_PRO;
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const keyHint = key.length > 8 ? `${key.slice(0, 7)}...${key.slice(-4)}` : "(not set)";
  console.log(
    `[STRIPE-DIAG] action=${action} | priceEnvPresent=${raw !== undefined} | priceId=${priceId} | keyHint=${keyHint}`
  );
}

export const createCheckoutSession = action({
  args: {
    userId: v.id("users"),
    tier: v.union(v.literal("cleaning_owner"), v.literal("str_owner")),
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

    const priceId = getOwnerPriceId();
    logCheckoutDiagnostic("billing.createCheckoutSession", priceId);

    const session: any = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
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