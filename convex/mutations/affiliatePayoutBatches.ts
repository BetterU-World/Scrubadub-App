import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "../lib/auth";

/**
 * Create a payout batch from selected locked ledger rows and mark them paid.
 * Super-admin only. Manual bookkeeping — no Stripe transfer.
 */
export const createPayoutBatchAndMarkPaid = mutation({
  args: {
    userId: v.id("users"),
    ledgerIds: v.array(v.id("affiliateLedger")),
    method: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireSuperAdmin(ctx, args.userId);

    if (args.ledgerIds.length === 0) {
      throw new Error("No ledger entries selected");
    }

    // Deduplicate
    const uniqueIds = [...new Set(args.ledgerIds)];

    // Fetch and validate all entries
    let totalCommissionCents = 0;
    const entries = [];
    for (const id of uniqueIds) {
      const entry = await ctx.db.get(id);
      if (!entry) throw new Error(`Ledger entry ${id} not found`);
      if (entry.status !== "locked") {
        throw new Error(
          `Ledger entry ${id} is "${entry.status}" — only locked entries can be batched`
        );
      }
      if (entry.payoutBatchId) {
        throw new Error(
          `Ledger entry ${id} already belongs to a payout batch`
        );
      }
      totalCommissionCents += entry.commissionCents;
      entries.push(entry);
    }

    // Create batch
    const now = Date.now();
    const batchId = await ctx.db.insert("affiliatePayoutBatches", {
      createdAt: now,
      createdByUserId: user._id,
      method: args.method.trim(),
      notes: args.notes ? args.notes.trim().slice(0, 280) : undefined,
      totalCommissionCents,
      ledgerIds: uniqueIds,
      status: "recorded",
    });

    // Mark each ledger entry paid with batch reference
    for (const entry of entries) {
      await ctx.db.patch(entry._id, {
        status: "paid",
        paidAt: now,
        payoutBatchId: batchId,
      });
    }

    return { batchId };
  },
});

/**
 * Void a payout batch and revert its ledger entries to locked.
 * Super-admin only. For mistake recovery.
 */
export const voidPayoutBatchAndRevertPaid = mutation({
  args: {
    userId: v.id("users"),
    batchId: v.id("affiliatePayoutBatches"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);

    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Payout batch not found");

    // Already voided — no-op
    if (batch.status === "voided") return batch;

    // Block voiding while Stripe transfer is in progress
    if (batch.payoutStatus === "processing") {
      throw new Error(
        "Cannot void a batch while a Stripe transfer is processing"
      );
    }

    const now = Date.now();

    // Revert each ledger entry that still points at this batch
    for (const ledgerId of batch.ledgerIds) {
      const entry = await ctx.db.get(ledgerId);
      if (
        entry &&
        entry.status === "paid" &&
        entry.payoutBatchId === args.batchId
      ) {
        await ctx.db.patch(entry._id, {
          status: "locked",
          paidAt: undefined,
          payoutBatchId: undefined,
        });
      }
    }

    // Void the batch
    const patch: Record<string, unknown> = {
      status: "voided",
      voidedAt: now,
    };
    if (args.notes !== undefined) {
      patch.notes = args.notes.trim().slice(0, 280);
    }
    await ctx.db.patch(batch._id, patch);

    return { ...batch, ...patch };
  },
});
