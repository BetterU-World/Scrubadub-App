"use node";

declare const process: { env: Record<string, string | undefined> };

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getStripeClientOrNull } from "../lib/stripe";

const PLATFORM_FEE_CENTS = 200; // $2

/**
 * Create a Stripe Checkout Session so Owner can pay a cleaner for a job.
 * Uses destination charge: funds land in cleaner's connected account minus the
 * platform application_fee_amount.
 */
export const createCleanerPaymentCheckout = action({
  args: {
    userId: v.id("users"),
    cleanerPaymentId: v.id("cleanerPayments"),
  },
  handler: async (ctx, args) => {
    const stripe = getStripeClientOrNull();
    if (!stripe) throw new Error("Stripe is not configured");

    // Fetch caller (payer) info
    const payer = await ctx.runQuery(
      internal.queries.companyStripeConnect.getOwnerAndCompany,
      { userId: args.userId },
    );
    if (!payer) throw new Error("Owner or company not found");

    // Fetch payment + cleaner data via internal query
    const data = await ctx.runQuery(
      internal.queries.cleanerPayments.getCleanerPaymentForCheckout,
      { cleanerPaymentId: args.cleanerPaymentId },
    );
    if (!data) throw new Error("Cleaner payment not found");

    // Authorization: caller must be from the same company
    if (data.companyId !== payer.companyId) {
      throw new Error("Access denied");
    }

    if (data.status !== "OPEN") {
      throw new Error("Payment is not open");
    }

    if (!data.cleanerStripeAccountId) {
      throw new Error(
        "Cleaner has not connected Stripe yet. They must complete Stripe Connect onboarding first.",
      );
    }

    const amountCents = data.amountCents;
    if (!amountCents || amountCents < 100) {
      throw new Error("Payment amount must be set (min $1.00) before checkout");
    }
    // Cap fee so we never charge more fee than the payment amount
    const feeCents = Math.min(PLATFORM_FEE_CENTS, amountCents);

    const appUrl = process.env.APP_URL ?? "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Payment for job — ${data.cleanerName}`,
              description: `Payment for this job: ${data.jobLabel}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: {
          destination: data.cleanerStripeAccountId,
        },
        metadata: {
          type: "cleaner_payout",
          cleanerPaymentId: String(args.cleanerPaymentId),
          jobId: String(data.jobId),
          companyId: String(data.companyId),
          payerUserId: String(args.userId),
        },
      },
      metadata: {
        type: "cleaner_payout",
        cleanerPaymentId: String(args.cleanerPaymentId),
        jobId: String(data.jobId),
        companyId: String(data.companyId),
        payerUserId: String(args.userId),
      },
      success_url: `${appUrl}/owner/jobs/${data.jobId}?payment=success`,
      cancel_url: `${appUrl}/owner/jobs/${data.jobId}?payment=cancel`,
    });

    return { url: session.url };
  },
});
