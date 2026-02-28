"use node";

declare const process: { env: Record<string, string | undefined> };

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getStripeClientOrNull } from "../lib/stripe";
import Stripe from "stripe";
import { ActionCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Shared helper: load owner+company and ensure a Connect account exists.
 * Returns { stripe, data, accountId }.
 */
async function ensureConnectAccount(
  ctx: ActionCtx,
  userId: Id<"users">
): Promise<{
  stripe: Stripe;
  data: { companyId: Id<"companies">; email: string };
  accountId: string;
}> {
  const stripe = getStripeClientOrNull();
  if (!stripe) throw new Error("Stripe is not configured");

  const data = await ctx.runQuery(
    internal.queries.companyStripeConnect.getOwnerAndCompany,
    { userId }
  );
  if (!data) throw new Error("Owner or company not found");

  if (data.stripeConnectAccountId) {
    return { stripe, data, accountId: data.stripeConnectAccountId };
  }

  // Create Express account in test mode
  const account = await stripe.accounts.create({
    type: "express",
    email: data.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { convexCompanyId: String(data.companyId) },
  });

  await ctx.runMutation(
    internal.mutations.companyStripeConnect.setCompanyStripeConnectAccount,
    {
      companyId: data.companyId,
      stripeConnectAccountId: account.id,
    }
  );

  return { stripe, data, accountId: account.id };
}

/**
 * Ensure the owner's company has a Stripe Connect Express account (idempotent).
 * Creates one if it doesn't exist, returns the account ID.
 */
export const ensureCompanyStripeConnectAccount = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { accountId } = await ensureConnectAccount(ctx, args.userId);
    return accountId;
  },
});

/**
 * Create a Stripe Account Link for Express onboarding.
 * Returns the URL to redirect the owner to.
 */
export const createCompanyStripeAccountLink = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { stripe, accountId } = await ensureConnectAccount(ctx, args.userId);

    const appUrl =
      process.env.APP_URL ?? "http://localhost:5173";

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/owner/settings/billing?stripe=refresh`,
      return_url: `${appUrl}/owner/settings/billing?stripe=return`,
      type: "account_onboarding",
    });

    return { url: accountLink.url };
  },
});

/**
 * Create a $1 test Checkout Session with destination charge.
 */
export const createCompanyStripeTestCheckout = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const stripe = getStripeClientOrNull();
    if (!stripe) throw new Error("Stripe is not configured");

    const data = await ctx.runQuery(
      internal.queries.companyStripeConnect.getOwnerAndCompany,
      { userId: args.userId }
    );
    if (!data) throw new Error("Owner or company not found");
    if (!data.stripeConnectAccountId) {
      throw new Error("Connect Stripe first");
    }

    const appUrl =
      process.env.APP_URL ?? "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Scrubadub Test Charge" },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/owner/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/owner/settings/billing?checkout=cancel`,
      payment_intent_data: {
        transfer_data: {
          destination: data.stripeConnectAccountId,
        },
      },
    });

    return { url: session.url };
  },
});
