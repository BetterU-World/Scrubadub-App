import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "../lib/auth";

/**
 * List users who have at least one affiliateLedger entry (i.e. are referrers).
 * Super-admin only. Returns id, email, name. Optional search filter.
 */
export const listAffiliateCandidates = query({
  args: {
    userId: v.id("users"),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);
    const limit = args.limit ?? 50;

    // Collect all distinct referrerUserIds from ledger
    const allLedger = await ctx.db
      .query("affiliateLedger")
      .collect();

    const uniqueIds = [...new Set(allLedger.map((e) => e.referrerUserId))];

    // Hydrate user records
    const candidates: {
      _id: string;
      email: string;
      name: string;
      entryCount: number;
    }[] = [];

    for (const uid of uniqueIds) {
      const user = await ctx.db.get(uid);
      if (!user) continue;

      // Optional search filter (case-insensitive on email or name)
      if (args.search) {
        const q = args.search.toLowerCase();
        if (
          !user.email.toLowerCase().includes(q) &&
          !user.name.toLowerCase().includes(q)
        ) {
          continue;
        }
      }

      const count = allLedger.filter(
        (e) => e.referrerUserId === uid
      ).length;

      candidates.push({
        _id: user._id,
        email: user.email,
        name: user.name,
        entryCount: count,
      });

      if (candidates.length >= limit) break;
    }

    return candidates;
  },
});

/**
 * Get ledger entries for a specific referrer. Super-admin only.
 * Same shape as getMyLedger but queries by explicit referrerUserId.
 */
export const getLedgerForReferrer = query({
  args: {
    userId: v.id("users"),
    referrerUserId: v.id("users"),
    periodType: v.optional(
      v.union(v.literal("monthly"), v.literal("weekly"))
    ),
    status: v.optional(
      v.union(v.literal("open"), v.literal("locked"), v.literal("paid"))
    ),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);
    const limit = args.limit ?? 50;

    let entries = await ctx.db
      .query("affiliateLedger")
      .withIndex("by_referrerUserId", (q) =>
        q.eq("referrerUserId", args.referrerUserId)
      )
      .order("desc")
      .collect();

    if (args.periodType) {
      entries = entries.filter((e) => e.periodType === args.periodType);
    }
    if (args.status) {
      entries = entries.filter((e) => e.status === args.status);
    }
    if (args.cursor !== undefined) {
      entries = entries.filter((e) => e.periodStart < args.cursor!);
    }

    const page = entries.slice(0, limit);
    const nextCursor =
      page.length === limit ? page[page.length - 1].periodStart : undefined;

    return { rows: page, nextCursor };
  },
});

/**
 * List payout batches that contain ledger entries for a specific referrer.
 * Super-admin only.
 */
export const listPayoutBatchesForReferrer = query({
  args: {
    userId: v.id("users"),
    referrerUserId: v.id("users"),
    status: v.optional(
      v.union(v.literal("recorded"), v.literal("voided"))
    ),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);
    const limit = args.limit ?? 20;

    // Get ledger entries for this referrer that have a payoutBatchId
    const ledgerEntries = await ctx.db
      .query("affiliateLedger")
      .withIndex("by_referrerUserId", (q) =>
        q.eq("referrerUserId", args.referrerUserId)
      )
      .collect();

    const batchIds = [
      ...new Set(
        ledgerEntries
          .filter((e) => e.payoutBatchId)
          .map((e) => e.payoutBatchId!)
      ),
    ];

    // Hydrate batches
    let batches = [];
    for (const batchId of batchIds) {
      const batch = await ctx.db.get(batchId);
      if (batch) batches.push(batch);
    }

    // Sort newest first
    batches.sort((a, b) => b.createdAt - a.createdAt);

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
