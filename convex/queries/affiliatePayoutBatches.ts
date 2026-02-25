import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "../lib/auth";

/**
 * List payout batches (newest first). Super-admin only.
 */
export const listPayoutBatches = query({
  args: {
    userId: v.id("users"),
    status: v.optional(
      v.union(v.literal("recorded"), v.literal("voided"))
    ),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);
    const limit = args.limit ?? 20;

    let batches = await ctx.db
      .query("affiliatePayoutBatches")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();

    if (args.status) {
      batches = batches.filter((b) => b.status === args.status);
    }

    if (args.cursor !== undefined) {
      batches = batches.filter((b) => b.createdAt < args.cursor!);
    }

    const page = batches.slice(0, limit);
    const nextCursor =
      page.length === limit ? page[page.length - 1].createdAt : undefined;

    return { rows: page, nextCursor };
  },
});

/**
 * Get a single payout batch with hydrated ledger row summaries. Super-admin only.
 */
export const getPayoutBatch = query({
  args: {
    userId: v.id("users"),
    batchId: v.id("affiliatePayoutBatches"),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);

    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Payout batch not found");

    const ledgerRows = [];
    for (const ledgerId of batch.ledgerIds) {
      const entry = await ctx.db.get(ledgerId);
      if (entry) {
        ledgerRows.push({
          _id: entry._id,
          periodStart: entry.periodStart,
          periodType: entry.periodType,
          commissionCents: entry.commissionCents,
          attributedRevenueCents: entry.attributedRevenueCents,
          status: entry.status,
          referrerUserId: entry.referrerUserId,
        });
      }
    }

    return { ...batch, ledgerRows };
  },
});
