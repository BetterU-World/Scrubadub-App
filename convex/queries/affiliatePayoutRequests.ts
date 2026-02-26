import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser, requireSuperAdmin } from "../lib/auth";

/**
 * List the current user's payout requests, newest first.
 */
export const getMyPayoutRequests = query({
  args: {
    userId: v.id("users"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const limit = args.limit ?? 20;

    let entries = await ctx.db
      .query("affiliatePayoutRequests")
      .withIndex("by_referrerUserId_createdAt", (q) =>
        q.eq("referrerUserId", user._id)
      )
      .order("desc")
      .collect();

    if (args.cursor !== undefined) {
      entries = entries.filter((e) => e.createdAt < args.cursor!);
    }

    const page = entries.slice(0, limit);
    const nextCursor =
      page.length === limit ? page[page.length - 1].createdAt : undefined;

    return { rows: page, nextCursor };
  },
});

/**
 * Get a single payout request with hydrated ledger summaries.
 * Must belong to the calling user.
 */
export const getMyPayoutRequest = query({
  args: {
    userId: v.id("users"),
    requestId: v.id("affiliatePayoutRequests"),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Payout request not found");
    if (request.referrerUserId !== user._id) {
      throw new Error("Access denied");
    }

    const ledgerRows = [];
    for (const id of request.ledgerIds) {
      const entry = await ctx.db.get(id);
      if (entry) {
        ledgerRows.push({
          _id: entry._id,
          periodStart: entry.periodStart,
          periodEnd: entry.periodEnd,
          periodType: entry.periodType,
          commissionCents: entry.commissionCents,
          attributedRevenueCents: entry.attributedRevenueCents,
          status: entry.status,
        });
      }
    }

    return { ...request, ledgerRows };
  },
});

/**
 * List all payout requests (admin). Super-admin only.
 * Optional status filter, newest first.
 */
export const listPayoutRequestsAdmin = query({
  args: {
    userId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("submitted"),
        v.literal("approved"),
        v.literal("denied"),
        v.literal("cancelled"),
        v.literal("completed")
      )
    ),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);
    const limit = args.limit ?? 20;

    let entries;
    if (args.status) {
      entries = await ctx.db
        .query("affiliatePayoutRequests")
        .withIndex("by_status_createdAt", (q) =>
          q.eq("status", args.status!)
        )
        .order("desc")
        .collect();
    } else {
      entries = await ctx.db
        .query("affiliatePayoutRequests")
        .order("desc")
        .collect();
    }

    if (args.cursor !== undefined) {
      entries = entries.filter((e) => e.createdAt < args.cursor!);
    }

    const page = entries.slice(0, limit);

    // Hydrate referrer info
    const rows = [];
    for (const req of page) {
      const referrer = await ctx.db.get(req.referrerUserId);
      rows.push({
        ...req,
        referrerName: referrer?.name ?? "Unknown",
        referrerEmail: referrer?.email ?? "Unknown",
      });
    }

    const nextCursor =
      page.length === limit ? page[page.length - 1].createdAt : undefined;

    return { rows, nextCursor };
  },
});

/**
 * Get a single payout request with full details (admin). Super-admin only.
 * Includes hydrated ledger rows, referrer info, and eligibility check.
 */
export const getPayoutRequestAdmin = query({
  args: {
    userId: v.id("users"),
    requestId: v.id("affiliatePayoutRequests"),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Payout request not found");

    const referrer = await ctx.db.get(request.referrerUserId);

    const ledgerRows = [];
    const invalidLedgerIds: string[] = [];
    for (const id of request.ledgerIds) {
      const entry = await ctx.db.get(id);
      if (entry) {
        ledgerRows.push({
          _id: entry._id,
          periodStart: entry.periodStart,
          periodEnd: entry.periodEnd,
          periodType: entry.periodType,
          commissionCents: entry.commissionCents,
          attributedRevenueCents: entry.attributedRevenueCents,
          status: entry.status,
          payoutBatchId: entry.payoutBatchId,
          payoutRequestId: entry.payoutRequestId,
        });

        // Eligibility check: must be locked, no existing batch,
        // and payoutRequestId must match this request
        if (
          entry.status !== "locked" ||
          entry.payoutBatchId ||
          (entry.payoutRequestId && entry.payoutRequestId !== request._id)
        ) {
          invalidLedgerIds.push(entry._id);
        }
      } else {
        invalidLedgerIds.push(id);
      }
    }

    return {
      ...request,
      referrerName: referrer?.name ?? "Unknown",
      referrerEmail: referrer?.email ?? "Unknown",
      ledgerRows,
      invalidLedgerIds,
    };
  },
});
