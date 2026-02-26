import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser, requireSuperAdmin } from "../lib/auth";

/**
 * Create a payout request for locked ledger rows. Affiliate-initiated.
 * Validates ownership, status=locked, no existing payoutBatchId or payoutRequestId.
 */
export const createPayoutRequest = mutation({
  args: {
    userId: v.id("users"),
    ledgerIds: v.array(v.id("affiliateLedger")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    if (args.ledgerIds.length === 0) {
      throw new Error("No ledger entries selected");
    }

    const uniqueIds = [...new Set(args.ledgerIds)];

    // Validate all entries
    let totalCommissionCents = 0;
    let totalRevenueCents = 0;
    for (const id of uniqueIds) {
      const entry = await ctx.db.get(id);
      if (!entry) throw new Error(`Ledger entry ${id} not found`);
      if (entry.referrerUserId !== user._id) {
        throw new Error("Access denied: ledger entry does not belong to you");
      }
      if (entry.status !== "locked") {
        throw new Error(
          `Ledger entry ${id} is "${entry.status}" — only locked entries can be requested`
        );
      }
      if (entry.payoutBatchId) {
        throw new Error(
          `Ledger entry ${id} is already in a payout batch`
        );
      }
      if (entry.payoutRequestId) {
        throw new Error(
          `Ledger entry ${id} is already in a pending payout request`
        );
      }
      totalCommissionCents += entry.commissionCents;
      totalRevenueCents += entry.attributedRevenueCents;
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("affiliatePayoutRequests", {
      referrerUserId: user._id,
      status: "submitted",
      ledgerIds: uniqueIds,
      totalCommissionCents,
      totalRevenueCents,
      notes: args.notes ? args.notes.trim().slice(0, 280) : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Mark each ledger entry with the request reference
    for (const id of uniqueIds) {
      await ctx.db.patch(id, { payoutRequestId: requestId });
    }

    return { requestId };
  },
});

/**
 * Cancel a payout request. Only allowed when status=submitted.
 * Clears payoutRequestId on associated ledger rows.
 */
export const cancelMyPayoutRequest = mutation({
  args: {
    userId: v.id("users"),
    requestId: v.id("affiliatePayoutRequests"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Payout request not found");
    if (request.referrerUserId !== user._id) {
      throw new Error("Access denied");
    }
    if (request.status !== "submitted") {
      throw new Error(
        `Cannot cancel request with status "${request.status}" — only submitted requests can be cancelled`
      );
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
      ...(args.notes ? { notes: args.notes.trim().slice(0, 280) } : {}),
    });

    // Clear payoutRequestId on ledger rows
    for (const ledgerId of request.ledgerIds) {
      const entry = await ctx.db.get(ledgerId);
      if (
        entry &&
        entry.payoutRequestId === request._id &&
        entry.status !== "paid"
      ) {
        await ctx.db.patch(entry._id, { payoutRequestId: undefined });
      }
    }

    return { requestId: request._id };
  },
});

/**
 * Approve a submitted payout request. Super-admin only.
 */
export const approvePayoutRequest = mutation({
  args: {
    userId: v.id("users"),
    requestId: v.id("affiliatePayoutRequests"),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Payout request not found");
    if (request.status !== "submitted") {
      throw new Error(
        `Cannot approve request with status "${request.status}"`
      );
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "approved",
      approvedAt: now,
      updatedAt: now,
      ...(args.adminNotes
        ? { adminNotes: args.adminNotes.trim().slice(0, 280) }
        : {}),
    });

    return { requestId: request._id };
  },
});

/**
 * Deny a submitted payout request. Super-admin only.
 * Requires adminNotes (reason). Clears payoutRequestId on ledger rows.
 */
export const denyPayoutRequest = mutation({
  args: {
    userId: v.id("users"),
    requestId: v.id("affiliatePayoutRequests"),
    adminNotes: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);

    if (!args.adminNotes.trim()) {
      throw new Error("Denial reason is required");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Payout request not found");
    if (request.status !== "submitted" && request.status !== "approved") {
      throw new Error(
        `Cannot deny request with status "${request.status}"`
      );
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "denied",
      deniedAt: now,
      updatedAt: now,
      adminNotes: args.adminNotes.trim().slice(0, 280),
    });

    // Clear payoutRequestId on ledger rows
    for (const ledgerId of request.ledgerIds) {
      const entry = await ctx.db.get(ledgerId);
      if (
        entry &&
        entry.payoutRequestId === request._id &&
        entry.status !== "paid"
      ) {
        await ctx.db.patch(entry._id, { payoutRequestId: undefined });
      }
    }

    return { requestId: request._id };
  },
});

/**
 * Convert a payout request into a batch and mark complete. Super-admin only.
 * Re-validates all ledger entries, creates batch via direct insert (same logic
 * as createPayoutBatchAndMarkPaid), then marks request completed.
 */
export const completePayoutRequestAsBatch = mutation({
  args: {
    userId: v.id("users"),
    requestId: v.id("affiliatePayoutRequests"),
    method: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireSuperAdmin(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Payout request not found");
    if (request.status !== "submitted" && request.status !== "approved") {
      throw new Error(
        `Cannot complete request with status "${request.status}"`
      );
    }

    // Re-validate all ledger entries
    let totalCommissionCents = 0;
    const entries = [];
    for (const id of request.ledgerIds) {
      const entry = await ctx.db.get(id);
      if (!entry) throw new Error(`Ledger entry ${id} not found`);
      if (entry.status !== "locked") {
        throw new Error(
          `Ledger entry ${id} is "${entry.status}" — must be locked`
        );
      }
      if (entry.payoutBatchId) {
        throw new Error(`Ledger entry ${id} already has a payout batch`);
      }
      if (entry.payoutRequestId && entry.payoutRequestId !== request._id) {
        throw new Error(
          `Ledger entry ${id} belongs to a different request`
        );
      }
      totalCommissionCents += entry.commissionCents;
      entries.push(entry);
    }

    // Create payout batch (same shape as createPayoutBatchAndMarkPaid)
    const now = Date.now();
    const batchId = await ctx.db.insert("affiliatePayoutBatches", {
      createdAt: now,
      createdByUserId: admin._id,
      method: args.method.trim(),
      notes: args.notes ? args.notes.trim().slice(0, 280) : undefined,
      totalCommissionCents,
      ledgerIds: request.ledgerIds,
      status: "recorded",
    });

    // Mark each ledger entry paid + clear payoutRequestId
    for (const entry of entries) {
      await ctx.db.patch(entry._id, {
        status: "paid",
        paidAt: now,
        payoutBatchId: batchId,
        payoutRequestId: undefined,
      });
    }

    // Mark request completed
    await ctx.db.patch(request._id, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
      payoutBatchId: batchId,
    });

    return { requestId: request._id, batchId };
  },
});
