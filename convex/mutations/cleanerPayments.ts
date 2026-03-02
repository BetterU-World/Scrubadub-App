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

    // Also mark any batch-linked jobs
    const batchLinks = await ctx.db
      .query("cleanerPaymentJobs")
      .withIndex("by_cleanerPaymentId", (q) => q.eq("cleanerPaymentId", args.cleanerPaymentId))
      .collect();
    for (const link of batchLinks) {
      const linkedJob = await ctx.db.get(link.jobId);
      if (linkedJob && !linkedJob.cleanerPaymentId) {
        await ctx.db.patch(link.jobId, { cleanerPaymentId: args.cleanerPaymentId });
      }
    }
  },
});

/**
 * Batch: create a single cleaner payment record for multiple jobs to the same cleaner.
 * Used from the CleanerPayments OPEN tab to pay all unpaid jobs in one Stripe checkout.
 */
export const createCleanerPaymentBatch = mutation({
  args: {
    userId: v.id("users"),
    jobIds: v.array(v.id("jobs")),
    totalAmountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    if (args.jobIds.length === 0) throw new Error("No jobs selected");
    if (args.totalAmountCents < 100) throw new Error("Minimum payment is $1.00");

    // Validate all jobs belong to company, same cleaner, unpaid
    let cleanerId: any = null;
    for (const jobId of args.jobIds) {
      const job = await ctx.db.get(jobId);
      if (!job || job.companyId !== owner.companyId) {
        throw new Error("Job not found or does not belong to your company");
      }
      if (job.cleanerPaymentId) {
        const existing = await ctx.db.get(job.cleanerPaymentId);
        if (existing && (existing.status === "PAID" || existing.status === "OPEN")) {
          throw new Error("One or more jobs already have a payment");
        }
      }
      const jCleaner = job.cleanerIds[0];
      if (!jCleaner) throw new Error("One or more jobs has no assigned cleaner");
      if (!cleanerId) cleanerId = jCleaner;
      else if (String(cleanerId) !== String(jCleaner)) {
        throw new Error("All jobs in a batch must be for the same cleaner");
      }
    }

    const now = Date.now();
    const paymentId = await ctx.db.insert("cleanerPayments", {
      companyId: owner.companyId,
      jobId: args.jobIds[0], // primary job ref
      cleanerUserId: cleanerId,
      amountCents: args.totalAmountCents,
      method: "in_app",
      status: "OPEN",
      createdAt: now,
      paidByUserId: args.userId,
    });

    // Create join entries + link each job
    for (const jobId of args.jobIds) {
      await ctx.db.insert("cleanerPaymentJobs", { cleanerPaymentId: paymentId, jobId });
      await ctx.db.patch(jobId, { cleanerPaymentId: paymentId });
    }

    return paymentId;
  },
});

/**
 * Batch: mark multiple jobs to the same cleaner as paid outside app.
 */
export const markCleanerBatchPaidOutside = mutation({
  args: {
    userId: v.id("users"),
    jobIds: v.array(v.id("jobs")),
    totalAmountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    if (args.jobIds.length === 0) throw new Error("No jobs selected");
    if (args.totalAmountCents < 100) throw new Error("Minimum payment is $1.00");

    let cleanerId: any = null;
    for (const jobId of args.jobIds) {
      const job = await ctx.db.get(jobId);
      if (!job || job.companyId !== owner.companyId) {
        throw new Error("Job not found or does not belong to your company");
      }
      if (job.cleanerPaymentId) {
        const existing = await ctx.db.get(job.cleanerPaymentId);
        if (existing && existing.status === "PAID") {
          throw new Error("One or more jobs already paid");
        }
      }
      const jCleaner = job.cleanerIds[0];
      if (!jCleaner) throw new Error("One or more jobs has no assigned cleaner");
      if (!cleanerId) cleanerId = jCleaner;
      else if (String(cleanerId) !== String(jCleaner)) {
        throw new Error("All jobs must be for the same cleaner");
      }
    }

    const now = Date.now();
    const paymentId = await ctx.db.insert("cleanerPayments", {
      companyId: owner.companyId,
      jobId: args.jobIds[0],
      cleanerUserId: cleanerId,
      amountCents: args.totalAmountCents,
      method: "outside_app",
      status: "PAID",
      createdAt: now,
      paidAt: now,
      paidByUserId: args.userId,
    });

    for (const jobId of args.jobIds) {
      await ctx.db.insert("cleanerPaymentJobs", { cleanerPaymentId: paymentId, jobId });
      await ctx.db.patch(jobId, { cleanerPaymentId: paymentId });
    }

    return paymentId;
  },
});
