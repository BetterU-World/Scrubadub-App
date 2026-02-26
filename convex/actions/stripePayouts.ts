"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getStripeClientOrNull } from "../lib/stripe";

/**
 * Pay an existing payout batch via Stripe Connect Transfer.
 * Super-admin only. Idempotent — uses idempotency key per batch.
 */
export const payPayoutBatchViaStripe = action({
  args: {
    userId: v.id("users"),
    batchId: v.id("affiliatePayoutBatches"),
  },
  handler: async (ctx, args) => {
    const stripe = getStripeClientOrNull();
    if (!stripe) {
      return { ok: false as const, reason: "not_configured" };
    }

    // 1. Validate everything via internal query (throws on bad state)
    let data;
    try {
      data = await ctx.runQuery(
        internal.queries.affiliatePayoutBatches.getBatchPayoutData,
        { userId: args.userId, batchId: args.batchId }
      );
    } catch (err: any) {
      return { ok: false as const, reason: err.message ?? "Validation failed" };
    }

    // 2. Atomically mark batch as "processing" (prevents double-send)
    try {
      await ctx.runMutation(
        internal.mutations.stripePayouts.markBatchProcessing,
        { batchId: args.batchId }
      );
    } catch (err: any) {
      return { ok: false as const, reason: err.message ?? "State transition failed" };
    }

    // 3. Create Stripe Transfer with idempotency key
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: data.totalCommissionCents,
          currency: "usd",
          destination: data.stripeConnectAccountId,
          metadata: {
            batchId: String(args.batchId),
            convexUserId: String(data.affiliateUserId),
          },
        },
        {
          idempotencyKey: `payout_batch_${args.batchId}`,
        }
      );

      // 4. Mark batch + ledger rows as paid
      await ctx.runMutation(
        internal.mutations.stripePayouts.markBatchPaid,
        {
          batchId: args.batchId,
          stripeTransferId: transfer.id,
          ledgerIds: data.ledgerIds,
        }
      );

      return {
        ok: true as const,
        stripeTransferId: transfer.id,
      };
    } catch (err: any) {
      // 5. Stripe failed — mark batch as failed, leave ledger locked
      const errorMessage =
        err.message ?? "Stripe transfer failed";

      await ctx.runMutation(
        internal.mutations.stripePayouts.markBatchFailed,
        {
          batchId: args.batchId,
          errorMessage,
        }
      );

      return {
        ok: false as const,
        reason: errorMessage,
      };
    }
  },
});
