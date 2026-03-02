"use node";

declare const process: { env: Record<string, string | undefined> };

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getStripeClientOrNull } from "../lib/stripe";

const CHECKOUT_LIMIT = 3;
const CHECKOUT_WINDOW_MS = 60_000; // 60 seconds

/**
 * Flat platform fee in cents.  Simple constant — no settings UI yet.
 */
const PLATFORM_FEE_CENTS = 200; // $2

/**
 * Create a Stripe Checkout Session so Owner1 can pay Owner2 for a settlement.
 * Uses destination charge: funds land in Owner2's connected account minus the
 * platform application_fee_amount.
 */
export const createSettlementPayCheckout = action({
  args: {
    userId: v.id("users"),
    settlementId: v.id("companySettlements"),
  },
  handler: async (ctx, args) => {
    // Rate limit: 3 checkout creations per 60s per user
    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `u:${args.userId}:createSettlementPayCheckout`,
      limit: CHECKOUT_LIMIT,
      windowMs: CHECKOUT_WINDOW_MS,
    });

    const stripe = getStripeClientOrNull();
    if (!stripe) throw new Error("Stripe is not configured");

    // Fetch caller (payer) info
    const payer = await ctx.runQuery(
      internal.queries.companyStripeConnect.getOwnerAndCompany,
      { userId: args.userId },
    );
    if (!payer) throw new Error("Owner or company not found");

    // Fetch settlement + recipient company data via internal query
    const data = await ctx.runQuery(
      internal.queries.settlements.getSettlementForPayment,
      { settlementId: args.settlementId },
    );
    if (!data) throw new Error("Settlement not found");

    // Authorization: caller must be the owing company
    if (data.fromCompanyId !== payer.companyId) {
      throw new Error("Only the owing company can pay this settlement");
    }

    if (data.status !== "open") {
      throw new Error("Settlement is not open");
    }

    if (!data.recipientStripeAccountId) {
      throw new Error(
        "Recipient company has not connected Stripe yet. They must complete Stripe Connect onboarding first.",
      );
    }

    const amountCents = data.amountCents;
    // Cap fee so we never charge more fee than the payment amount
    const feeCents = Math.min(PLATFORM_FEE_CENTS, amountCents);

    const appUrl = process.env.APP_URL ?? "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: data.currency,
            product_data: {
              name: `Settlement — ${data.recipientCompanyName}`,
              description: `Payment for shared job: ${data.jobLabel}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: {
          destination: data.recipientStripeAccountId,
        },
        metadata: {
          settlementId: args.settlementId,
          payerCompanyId: String(payer.companyId),
          recipientCompanyId: String(data.toCompanyId),
          payerUserId: String(args.userId),
        },
      },
      metadata: {
        type: "settlement_payment",
        settlementId: args.settlementId,
        payerCompanyId: String(payer.companyId),
        recipientCompanyId: String(data.toCompanyId),
        payerUserId: String(args.userId),
      },
      success_url: `${appUrl}/owner/settlements?payment=success&settlement=${args.settlementId}`,
      cancel_url: `${appUrl}/owner/settlements?payment=cancel`,
    });

    return { url: session.url };
  },
});

/**
 * Create a Stripe Checkout Session for a batch of settlements to the same partner.
 */
export const createSettlementBatchCheckout = action({
  args: {
    userId: v.id("users"),
    batchId: v.id("settlementBatches"),
  },
  handler: async (ctx, args) => {
    // Rate limit: 3 checkout creations per 60s per user
    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `u:${args.userId}:createSettlementBatchCheckout`,
      limit: CHECKOUT_LIMIT,
      windowMs: CHECKOUT_WINDOW_MS,
    });

    const stripe = getStripeClientOrNull();
    if (!stripe) throw new Error("Stripe is not configured");

    const payer = await ctx.runQuery(
      internal.queries.companyStripeConnect.getOwnerAndCompany,
      { userId: args.userId },
    );
    if (!payer) throw new Error("Owner or company not found");

    const data = await ctx.runQuery(
      internal.queries.settlements.getSettlementBatchForPayment,
      { batchId: args.batchId },
    );
    if (!data) throw new Error("Settlement batch not found");

    if (data.fromCompanyId !== payer.companyId) {
      throw new Error("Only the owing company can pay this batch");
    }

    if (data.status !== "OPEN") {
      throw new Error("Batch is not open");
    }

    if (!data.recipientStripeAccountId) {
      throw new Error(
        "Recipient company has not connected Stripe yet.",
      );
    }

    const amountCents = data.totalAmountCents;
    const feeCents = Math.min(PLATFORM_FEE_CENTS, amountCents);
    const appUrl = process.env.APP_URL ?? "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: data.currency,
            product_data: {
              name: `Settlements — ${data.recipientCompanyName}`,
              description: `Batch payment for ${data.settlementCount} settlement(s)`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: {
          destination: data.recipientStripeAccountId,
        },
        metadata: {
          type: "settlement_batch",
          batchId: String(args.batchId),
          payerCompanyId: String(payer.companyId),
          recipientCompanyId: String(data.toCompanyId),
          payerUserId: String(args.userId),
        },
      },
      metadata: {
        type: "settlement_batch",
        batchId: String(args.batchId),
        payerCompanyId: String(payer.companyId),
        recipientCompanyId: String(data.toCompanyId),
        payerUserId: String(args.userId),
      },
      success_url: `${appUrl}/owner/settlements?payment=success`,
      cancel_url: `${appUrl}/owner/settlements?payment=cancel`,
    });

    return { url: session.url };
  },
});
