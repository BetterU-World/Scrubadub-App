import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Internal mutation: atomically mark batch as "processing".
 * Validates state hasn't changed since the read.
 */
export const markBatchProcessing = internalMutation({
  args: { batchId: v.id("affiliatePayoutBatches") },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Payout batch not found");

    const currentPayoutStatus = batch.payoutStatus ?? "recorded";
    if (
      currentPayoutStatus !== "recorded" &&
      currentPayoutStatus !== "failed"
    ) {
      throw new Error(
        `Race condition: batch payoutStatus changed to "${currentPayoutStatus}"`
      );
    }
    if (batch.stripeTransferId) {
      throw new Error("Race condition: batch already has stripeTransferId");
    }

    await ctx.db.patch(args.batchId, {
      payoutStatus: "processing",
      processingAt: Date.now(),
      payoutErrorMessage: undefined,
    });
  },
});

/**
 * Internal mutation: mark batch as "paid" and mark all ledger rows paid.
 */
export const markBatchPaid = internalMutation({
  args: {
    batchId: v.id("affiliatePayoutBatches"),
    stripeTransferId: v.string(),
    ledgerIds: v.array(v.id("affiliateLedger")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.batchId, {
      stripeTransferId: args.stripeTransferId,
      payoutStatus: "paid",
      paidAt: now,
    });

    for (const ledgerId of args.ledgerIds) {
      const entry = await ctx.db.get(ledgerId);
      if (entry && entry.status === "locked") {
        await ctx.db.patch(ledgerId, {
          status: "paid",
          paidAt: now,
          payoutBatchId: args.batchId,
        });
      }
    }
  },
});

/**
 * Internal mutation: mark batch as "failed" — ledger rows stay locked.
 */
export const markBatchFailed = internalMutation({
  args: {
    batchId: v.id("affiliatePayoutBatches"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.batchId, {
      payoutStatus: "failed",
      payoutErrorMessage: args.errorMessage.slice(0, 500),
    });
  },
});
