import { recordLegacyCompletionConflict } from "../lib/legacyOutgoingCompletion";
import { retireLegacyOutgoing } from "../lib/legacyOutgoingRetirement";
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessionAuth";

/** Retired compatibility endpoint; authenticates ownership but never writes financial state. */
export const createCleanerPayment = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    jobId: v.id("jobs"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const record = await ctx.db.get(args.jobId);
    if (!record || record.companyId !== owner.companyId) throw new Error("Access denied");
    return retireLegacyOutgoing();
  },
});

/** Retired compatibility endpoint; authenticates ownership but never writes financial state. */
export const markCleanerPaidOutside = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    jobId: v.id("jobs"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const record = await ctx.db.get(args.jobId);
    if (!record || record.companyId !== owner.companyId) throw new Error("Access denied");
    return retireLegacyOutgoing();
  },
});

/**
 * Internal mutation: mark a cleaner payment as paid via Stripe (called from webhook).
 * Same-Session retries are no-ops; conflicting Session evidence is audited.
 */
export const markCleanerPaidViaStripe = internalMutation({
  args: {
    cleanerPaymentId: v.id("cleanerPayments"),
    stripeCheckoutSessionId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
    stripeTransferId: v.optional(v.string()),
    payerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.cleanerPaymentId);
    if (!payment) {
      console.warn("[cleanerPayment:webhook] payment not found:", args.cleanerPaymentId);
      return;
    }

    // Preserve distinct completion evidence without overwriting historical state.
    if ((payment.status === "PAID" && payment.stripeCheckoutSessionId !== args.stripeCheckoutSessionId) || (payment.stripeCheckoutSessionId && payment.stripeCheckoutSessionId !== args.stripeCheckoutSessionId)) {
      await recordLegacyCompletionConflict(ctx, { companyId: payment.companyId, entityType: "cleanerPayments", entityId: String(payment._id), previousSessionId: payment.stripeCheckoutSessionId, incomingSessionId: args.stripeCheckoutSessionId, incomingPaymentIntentId: args.stripePaymentIntentId });
      return;
    }
    // Same-object retries are idempotent; distinct completion evidence stays visible.
    if (payment.status === "PAID") {
      console.log("[cleanerPayment:webhook] already paid, skipping:", args.cleanerPaymentId);
      return;
    }

    const now = Date.now();
    await ctx.db.patch(args.cleanerPaymentId, {
      status: "PAID",
      paidAt: now,
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      stripePaymentIntentId: args.stripePaymentIntentId,
      stripeTransferId: args.stripeTransferId,
      paidByUserId: args.payerUserId,
    });

    // Ensure job pointer is set
    const job = await ctx.db.get(payment.jobId);
    if (job && !job.cleanerPaymentId) {
      await ctx.db.patch(payment.jobId, { cleanerPaymentId: args.cleanerPaymentId });
    }

    console.log("[cleanerPayment:webhook] marked paid via Stripe:", args.cleanerPaymentId);

    // Also mark any batch-linked jobs
    const batchLinks = await ctx.db
      .query("cleanerPaymentJobs")
      .withIndex("by_cleanerPaymentId", (q) => q.eq("cleanerPaymentId", args.cleanerPaymentId))
      .take(501);
    if (batchLinks.length > 500) throw new Error("Legacy payment batch history is too large; reconciliation required");
    for (const link of batchLinks) {
      const linkedJob = await ctx.db.get(link.jobId);
      if (linkedJob && !linkedJob.cleanerPaymentId) {
        await ctx.db.patch(link.jobId, { cleanerPaymentId: args.cleanerPaymentId });
      }
    }
  },
});

/** Retired compatibility endpoint; authenticates ownership but never writes financial state. */
export const createCleanerPaymentBatch = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    jobIds: v.array(v.id("jobs")),
    totalAmountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    for (const id of args.jobIds) {
      const record = await ctx.db.get(id);
      if (!record || record.companyId !== owner.companyId) throw new Error("Access denied");
    }
    return retireLegacyOutgoing();
  },
});

/** Retired compatibility endpoint; authenticates ownership but never writes financial state. */
export const markCleanerBatchPaidOutside = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    jobIds: v.array(v.id("jobs")),
    totalAmountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    for (const id of args.jobIds) {
      const record = await ctx.db.get(id);
      if (!record || record.companyId !== owner.companyId) throw new Error("Access denied");
    }
    return retireLegacyOutgoing();
  },
});

/** Retired compatibility endpoint; authenticates ownership but never writes financial state. */
export const updateCleanerPaymentAmount = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    cleanerPaymentId: v.id("cleanerPayments"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const record = await ctx.db.get(args.cleanerPaymentId);
    if (!record || record.companyId !== owner.companyId) throw new Error("Access denied");
    return retireLegacyOutgoing();
  },
});

/** Retired compatibility endpoint; authenticates ownership but never writes financial state. */
export const sendStripeConnectInvite = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    cleanerUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const record = await ctx.db.get(args.cleanerUserId);
    if (!record || record.companyId !== owner.companyId) throw new Error("Access denied");
    return retireLegacyOutgoing();
  },
});
