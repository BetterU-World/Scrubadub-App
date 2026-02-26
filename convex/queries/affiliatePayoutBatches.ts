import { query, internalQuery } from "../_generated/server";
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

    // Look up affiliate Stripe Connect status from first ledger row
    const firstReferrer = ledgerRows[0]?.referrerUserId ?? null;
    let affiliateStripe: {
      userId: string;
      stripeConnectAccountId: string | null;
      payoutsEnabled: boolean;
    } | null = null;
    if (firstReferrer) {
      const aff = await ctx.db.get(firstReferrer as any);
      if (aff) {
        affiliateStripe = {
          userId: String(aff._id),
          stripeConnectAccountId: aff.stripeConnectAccountId ?? null,
          payoutsEnabled: aff.stripeConnectPayoutsEnabled ?? false,
        };
      }
    }

    return { ...batch, ledgerRows, affiliateStripe };
  },
});

/**
 * Internal query: validate batch is ready for Stripe payout and return
 * all data the action needs. Does NOT mutate state.
 */
export const getBatchPayoutData = internalQuery({
  args: {
    userId: v.id("users"),
    batchId: v.id("affiliatePayoutBatches"),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);

    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Payout batch not found");
    if (batch.status === "voided") throw new Error("Batch is voided");
    if (batch.stripeTransferId) {
      throw new Error("Batch already has a Stripe transfer");
    }

    const currentPayoutStatus = batch.payoutStatus ?? "recorded";
    if (currentPayoutStatus !== "recorded" && currentPayoutStatus !== "failed") {
      throw new Error(
        `Batch payoutStatus is "${currentPayoutStatus}" — must be "recorded" or "failed" to pay`
      );
    }

    // Validate ledger rows
    let referrerUserId: string | null = null;
    for (const ledgerId of batch.ledgerIds) {
      const entry = await ctx.db.get(ledgerId);
      if (!entry) throw new Error(`Ledger entry ${ledgerId} not found`);
      if (entry.status !== "locked") {
        throw new Error(
          `Ledger ${ledgerId} is "${entry.status}" — must be locked`
        );
      }
      if (entry.commissionCents <= 0) {
        throw new Error(`Ledger ${ledgerId} has zero commission`);
      }
      if (!referrerUserId) referrerUserId = entry.referrerUserId;
    }

    if (!referrerUserId) {
      throw new Error("No ledger rows in batch");
    }

    const affiliate = await ctx.db.get(referrerUserId as any);
    if (!affiliate) throw new Error("Affiliate user not found");
    if (!affiliate.stripeConnectAccountId) {
      throw new Error("affiliate_not_ready");
    }
    if (!affiliate.stripeConnectPayoutsEnabled) {
      throw new Error("affiliate_not_ready");
    }

    return {
      batchId: batch._id,
      totalCommissionCents: batch.totalCommissionCents,
      stripeConnectAccountId: affiliate.stripeConnectAccountId,
      affiliateUserId: affiliate._id,
      ledgerIds: batch.ledgerIds,
    };
  },
});
