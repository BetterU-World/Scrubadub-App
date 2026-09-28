import { recordLegacyCompletionConflict } from "../lib/legacyOutgoingCompletion";
import { retireLegacyOutgoing } from "../lib/legacyOutgoingRetirement";
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessionAuth";

/** Retired compatibility endpoint; authenticates ownership but never writes financial state. */
export const upsertSettlementForSharedJob = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    originalJobId: v.id("jobs"),
    toCompanyId: v.id("companies"),
    amountCents: v.number(),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const record = await ctx.db.get(args.originalJobId);
    if (!record || record.companyId !== owner.companyId) throw new Error("Access denied");
    return retireLegacyOutgoing();
  },
});

/** Retired compatibility endpoint; authenticates ownership but never writes financial state. */
export const markSettlementPaid = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    settlementId: v.id("companySettlements"),
    paidMethod: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const record = await ctx.db.get(args.settlementId);
    if (!record || record.fromCompanyId !== owner.companyId) throw new Error("Access denied");
    return retireLegacyOutgoing();
  },
});

/**
 * Internal mutation: mark a settlement as paid via Stripe (called from webhook).
 * Same-Session retries are no-ops; conflicting Session evidence is audited.
 */
export const markSettlementPaidViaStripe = internalMutation({
  args: {
    settlementId: v.id("companySettlements"),
    stripeCheckoutSessionId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
    stripeApplicationFeeCents: v.optional(v.number()),
    stripeDestinationAccountId: v.optional(v.string()),
    stripeReceiptUrl: v.optional(v.string()),
    payerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) {
      console.warn("[settlement:webhook] settlement not found:", args.settlementId);
      return;
    }

    // Preserve distinct completion evidence without overwriting historical state.
    if ((settlement.status === "paid" && settlement.stripeCheckoutSessionId !== args.stripeCheckoutSessionId) || (settlement.stripeCheckoutSessionId && settlement.stripeCheckoutSessionId !== args.stripeCheckoutSessionId)) {
      await recordLegacyCompletionConflict(ctx, { companyId: settlement.fromCompanyId, entityType: "companySettlements", entityId: String(settlement._id), previousSessionId: settlement.stripeCheckoutSessionId, incomingSessionId: args.stripeCheckoutSessionId, incomingPaymentIntentId: args.stripePaymentIntentId });
      return;
    }
    // Same-object retries are idempotent; distinct completion evidence stays visible.
    if (settlement.status === "paid") {
      console.log("[settlement:webhook] already paid, skipping:", args.settlementId);
      return;
    }

    const now = Date.now();
    await ctx.db.patch(args.settlementId, {
      status: "paid",
      paidAt: now,
      updatedAt: now,
      paidMethod: "scrubadub_stripe",
      paidByUserId: args.payerUserId,
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      stripePaymentIntentId: args.stripePaymentIntentId,
      stripeApplicationFeeCents: args.stripeApplicationFeeCents,
      stripeDestinationAccountId: args.stripeDestinationAccountId,
      stripeReceiptUrl: args.stripeReceiptUrl,
    });

    console.log("[settlement:webhook] marked paid via Stripe:", args.settlementId);
  },
});

/** Retired compatibility endpoint; authenticates ownership but never writes financial state. */
export const createSettlementBatch = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    settlementIds: v.array(v.id("companySettlements")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    for (const id of args.settlementIds) {
      const record = await ctx.db.get(id);
      if (!record || record.fromCompanyId !== owner.companyId) throw new Error("Access denied");
    }
    return retireLegacyOutgoing();
  },
});

/** Retired compatibility endpoint; authenticates ownership but never writes financial state. */
export const markSettlementBatchPaidOutside = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    settlementIds: v.array(v.id("companySettlements")),
    paidMethod: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    for (const id of args.settlementIds) {
      const record = await ctx.db.get(id);
      if (!record || record.fromCompanyId !== owner.companyId) throw new Error("Access denied");
    }
    return retireLegacyOutgoing();
  },
});

/**
 * Internal mutation: mark a settlement batch as paid via Stripe (called from webhook).
 * Idempotently marks the batch + all linked settlements as paid.
 */
export const markSettlementBatchPaidViaStripe = internalMutation({
  args: {
    batchId: v.id("settlementBatches"),
    stripeCheckoutSessionId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
    payerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      console.warn("[settlementBatch:webhook] batch not found:", args.batchId);
      return;
    }

    if ((batch.status === "PAID" && batch.stripeCheckoutSessionId !== args.stripeCheckoutSessionId) || (batch.stripeCheckoutSessionId && batch.stripeCheckoutSessionId !== args.stripeCheckoutSessionId)) {
      await recordLegacyCompletionConflict(ctx, { companyId: batch.fromCompanyId, entityType: "settlementBatches", entityId: String(batch._id), previousSessionId: batch.stripeCheckoutSessionId, incomingSessionId: args.stripeCheckoutSessionId, incomingPaymentIntentId: args.stripePaymentIntentId });
      return;
    }
    // Same-object retries are idempotent; distinct completion evidence stays visible.
    if (batch.status === "PAID") {
      console.log("[settlementBatch:webhook] already paid, skipping:", args.batchId);
      return;
    }

    const now = Date.now();
    await ctx.db.patch(args.batchId, {
      status: "PAID",
      paidAt: now,
      paidMethod: "scrubadub_stripe",
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      stripePaymentIntentId: args.stripePaymentIntentId,
      paidByUserId: args.payerUserId,
    });

    // Mark all linked settlements as paid
    const items = await ctx.db
      .query("settlementBatchItems")
      .withIndex("by_batchId", (q) => q.eq("batchId", args.batchId))
      .collect();

    for (const item of items) {
      const s = await ctx.db.get(item.settlementId);
      if (s && s.status === "open") {
        await ctx.db.patch(item.settlementId, {
          status: "paid",
          paidAt: now,
          updatedAt: now,
          paidMethod: "scrubadub_stripe",
          paidByUserId: args.payerUserId,
          stripeCheckoutSessionId: args.stripeCheckoutSessionId,
          stripePaymentIntentId: args.stripePaymentIntentId,
        });
      }
    }

    console.log("[settlementBatch:webhook] batch marked paid:", args.batchId, "settlements:", items.length);
  },
});
