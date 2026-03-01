import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole } from "../lib/auth";

/**
 * Create a cleaner payment record with status OPEN (for Stripe checkout flow).
 * Returns the cleanerPayment ID so the action can create a Stripe session.
 */
export const createCleanerPayment = mutation({
  args: {
    userId: v.id("users"),
    jobId: v.id("jobs"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    if (args.amountCents < 100) {
      throw new Error("Minimum payment is $1.00");
    }

    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== owner.companyId) {
      throw new Error("Job not found or does not belong to your company");
    }

    // Check not already paid
    if (job.cleanerPaymentId) {
      const existing = await ctx.db.get(job.cleanerPaymentId);
      if (existing && existing.status === "PAID") {
        throw new Error("This job already has a completed payment");
      }
      // If OPEN or CANCELED, allow creating a new one
      if (existing && existing.status === "OPEN") {
        throw new Error("A payment checkout is already in progress for this job");
      }
    }

    const cleanerId = job.cleanerIds[0];
    if (!cleanerId) {
      throw new Error("No cleaner assigned to this job");
    }

    const now = Date.now();
    const paymentId = await ctx.db.insert("cleanerPayments", {
      companyId: owner.companyId,
      jobId: args.jobId,
      cleanerUserId: cleanerId,
      amountCents: args.amountCents,
      method: "in_app",
      status: "OPEN",
      createdAt: now,
      paidByUserId: args.userId,
    });

    // Link to job
    await ctx.db.patch(args.jobId, { cleanerPaymentId: paymentId });

    return paymentId;
  },
});

/**
 * Mark a cleaner as paid outside the app (cash, Zelle, etc.).
 * Creates a cleanerPayment record with method="outside_app", status="PAID".
 */
export const markCleanerPaidOutside = mutation({
  args: {
    userId: v.id("users"),
    jobId: v.id("jobs"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    if (args.amountCents < 100) {
      throw new Error("Minimum payment is $1.00");
    }

    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== owner.companyId) {
      throw new Error("Job not found or does not belong to your company");
    }

    // Check not already paid
    if (job.cleanerPaymentId) {
      const existing = await ctx.db.get(job.cleanerPaymentId);
      if (existing && existing.status === "PAID") {
        throw new Error("This job already has a completed payment");
      }
    }

    const cleanerId = job.cleanerIds[0];
    if (!cleanerId) {
      throw new Error("No cleaner assigned to this job");
    }

    const now = Date.now();
    const paymentId = await ctx.db.insert("cleanerPayments", {
      companyId: owner.companyId,
      jobId: args.jobId,
      cleanerUserId: cleanerId,
      amountCents: args.amountCents,
      method: "outside_app",
      status: "PAID",
      createdAt: now,
      paidAt: now,
      paidByUserId: args.userId,
    });

    // Link to job
    await ctx.db.patch(args.jobId, { cleanerPaymentId: paymentId });

    return paymentId;
  },
});

/**
 * Internal mutation: mark a cleaner payment as paid via Stripe (called from webhook).
 * Idempotent — if already PAID, no-op.
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

    // Idempotent
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
  },
});
