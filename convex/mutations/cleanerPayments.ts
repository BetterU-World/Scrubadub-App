import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole } from "../lib/auth";
import { checkRateLimit } from "../lib/rateLimit";

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

    // Check not already paid — primary pointer + index cross-check
    if (job.cleanerPaymentId) {
      const existing = await ctx.db.get(job.cleanerPaymentId);
      if (existing && existing.status === "PAID") {
        throw new Error("This job already has a completed payment");
      }
      if (existing && existing.status === "OPEN") {
        if (existing.amountCents != null && existing.method != null) {
          throw new Error("A payment checkout is already in progress for this job");
        }
        // Auto-created record — set amount and reuse it
        await ctx.db.patch(existing._id, {
          amountCents: args.amountCents,
          method: "in_app",
          paidByUserId: args.userId,
        });
        return existing._id;
      }
    }
    // Cross-check via index (catches payments not linked via job pointer)
    const existingByIndex = await ctx.db
      .query("cleanerPayments")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .filter((q) => q.eq(q.field("status"), "PAID"))
      .first();
    if (existingByIndex) {
      throw new Error("This job already has a completed payment");
    }
    // Cross-check via batch join table
    const batchLink = await ctx.db
      .query("cleanerPaymentJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (batchLink) {
      const linkedPayment = await ctx.db.get(batchLink.cleanerPaymentId);
      if (linkedPayment && linkedPayment.status === "PAID") {
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
    // Rate limit: 10 mark-paid-outside per 60s per user
    await checkRateLimit(ctx, {
      key: `u:${args.userId}:markCleanerPaidOutside`,
      limit: 10,
      windowMs: 60_000,
    });

    const owner = await assertOwnerRole(ctx, args.userId);

    if (args.amountCents < 100) {
      throw new Error("Minimum payment is $1.00");
    }

    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== owner.companyId) {
      throw new Error("Job not found or does not belong to your company");
    }

    // Check not already paid — primary pointer + index cross-check
    if (job.cleanerPaymentId) {
      const existing = await ctx.db.get(job.cleanerPaymentId);
      if (existing && existing.status === "PAID") {
        throw new Error("This job already has a completed payment");
      }
      // Reuse existing OPEN record (auto-created or stale)
      if (existing && existing.status === "OPEN") {
        const now = Date.now();
        await ctx.db.patch(existing._id, {
          amountCents: args.amountCents,
          method: "outside_app",
          status: "PAID",
          paidAt: now,
          paidByUserId: args.userId,
        });
        return existing._id;
      }
    }
    // Cross-check via index (catches payments not linked via job pointer)
    const existingByIndex = await ctx.db
      .query("cleanerPayments")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .filter((q) => q.eq(q.field("status"), "PAID"))
      .first();
    if (existingByIndex) {
      throw new Error("This job already has a completed payment");
    }
    // Cross-check via batch join table
    const batchLink = await ctx.db
      .query("cleanerPaymentJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (batchLink) {
      const linkedPayment = await ctx.db.get(batchLink.cleanerPaymentId);
      if (linkedPayment && linkedPayment.status === "PAID") {
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
    // Rate limit: 2 batch pay creations per 60s per user
    await checkRateLimit(ctx, {
      key: `u:${args.userId}:createCleanerPaymentBatch`,
      limit: 2,
      windowMs: 60_000,
    });

    const owner = await assertOwnerRole(ctx, args.userId);

    if (args.jobIds.length === 0) throw new Error("No jobs selected");
    if (args.totalAmountCents < 100) throw new Error("Minimum payment is $1.00");

    // Validate all jobs belong to company, same cleaner, unpaid
    let cleanerId: any = null;
    const toCancel: Array<any> = [];
    const jobAmounts: Array<{ jobId: typeof args.jobIds[0]; amountCents: number }> = [];
    for (const jobId of args.jobIds) {
      const job = await ctx.db.get(jobId);
      if (!job || job.companyId !== owner.companyId) {
        throw new Error("Job not found or does not belong to your company");
      }
      if (job.cleanerPaymentId) {
        const existing = await ctx.db.get(job.cleanerPaymentId);
        if (existing && existing.status === "PAID") {
          throw new Error("One or more jobs already have a completed payment");
        }
        // Cancel existing OPEN records (auto-created) so we can batch
        if (existing && existing.status === "OPEN") {
          toCancel.push(existing._id);
        }
      }
      // Cross-check via index (catches payments not linked via job pointer)
      const paidByIndex = await ctx.db
        .query("cleanerPayments")
        .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
        .filter((q) => q.eq(q.field("status"), "PAID"))
        .first();
      if (paidByIndex) {
        throw new Error("One or more jobs already have a completed payment");
      }
      // Also check via cleanerPaymentJobs join table
      const batchLink = await ctx.db
        .query("cleanerPaymentJobs")
        .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
        .first();
      if (batchLink) {
        const linkedPayment = await ctx.db.get(batchLink.cleanerPaymentId);
        if (linkedPayment && linkedPayment.status === "PAID") {
          throw new Error("One or more jobs already have a completed payment");
        }
      }
      const jCleaner = job.cleanerIds[0];
      if (!jCleaner) throw new Error("One or more jobs has no assigned cleaner");
      if (!cleanerId) cleanerId = jCleaner;
      else if (String(cleanerId) !== String(jCleaner)) {
        throw new Error("All jobs in a batch must be for the same cleaner");
      }
      // Track per-job amount from planned pay
      jobAmounts.push({ jobId, amountCents: job.plannedCleanerPayCents ?? 0 });
    }
    // Cancel auto-created individual records before creating batch
    for (const id of toCancel) {
      await ctx.db.patch(id, { status: "CANCELED" });
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

    // Create join entries with per-job amounts + link each job
    for (const { jobId, amountCents } of jobAmounts) {
      await ctx.db.insert("cleanerPaymentJobs", {
        cleanerPaymentId: paymentId,
        jobId,
        amountCents: amountCents > 0 ? amountCents : undefined,
      });
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
    // Rate limit: 10 mark-paid-outside per 60s per user
    await checkRateLimit(ctx, {
      key: `u:${args.userId}:markCleanerBatchPaidOutside`,
      limit: 10,
      windowMs: 60_000,
    });

    const owner = await assertOwnerRole(ctx, args.userId);

    if (args.jobIds.length === 0) throw new Error("No jobs selected");
    if (args.totalAmountCents < 100) throw new Error("Minimum payment is $1.00");

    let cleanerId: any = null;
    const toCancel: Array<any> = [];
    const jobAmounts: Array<{ jobId: typeof args.jobIds[0]; amountCents: number }> = [];
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
        if (existing && existing.status === "OPEN") {
          toCancel.push(existing._id);
        }
      }
      // Cross-check via index (catches payments not linked via job pointer)
      const paidByIndex = await ctx.db
        .query("cleanerPayments")
        .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
        .filter((q) => q.eq(q.field("status"), "PAID"))
        .first();
      if (paidByIndex) {
        throw new Error("One or more jobs already paid");
      }
      // Also check via cleanerPaymentJobs join table
      const batchLink = await ctx.db
        .query("cleanerPaymentJobs")
        .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
        .first();
      if (batchLink) {
        const linkedPayment = await ctx.db.get(batchLink.cleanerPaymentId);
        if (linkedPayment && linkedPayment.status === "PAID") {
          throw new Error("One or more jobs already paid");
        }
      }
      const jCleaner = job.cleanerIds[0];
      if (!jCleaner) throw new Error("One or more jobs has no assigned cleaner");
      if (!cleanerId) cleanerId = jCleaner;
      else if (String(cleanerId) !== String(jCleaner)) {
        throw new Error("All jobs must be for the same cleaner");
      }
      // Track per-job amount from planned pay
      jobAmounts.push({ jobId, amountCents: job.plannedCleanerPayCents ?? 0 });
    }
    for (const id of toCancel) {
      await ctx.db.patch(id, { status: "CANCELED" });
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

    // Create join entries with per-job amounts + link each job
    for (const { jobId, amountCents } of jobAmounts) {
      await ctx.db.insert("cleanerPaymentJobs", {
        cleanerPaymentId: paymentId,
        jobId,
        amountCents: amountCents > 0 ? amountCents : undefined,
      });
      await ctx.db.patch(jobId, { cleanerPaymentId: paymentId });
    }

    return paymentId;
  },
});

/**
 * Update the amountCents on an OPEN cleaner payment (owner-gated).
 * Used from the CleanerPayments page to set/edit amounts on auto-created records.
 */
export const updateCleanerPaymentAmount = mutation({
  args: {
    userId: v.id("users"),
    cleanerPaymentId: v.id("cleanerPayments"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    if (args.amountCents < 100) {
      throw new Error("Minimum payment is $1.00");
    }

    const payment = await ctx.db.get(args.cleanerPaymentId);
    if (!payment) throw new Error("Payment not found");
    if (payment.companyId !== owner.companyId) throw new Error("Not your company");
    if (payment.status !== "OPEN") throw new Error("Can only edit amount on OPEN payments");

    await ctx.db.patch(args.cleanerPaymentId, { amountCents: args.amountCents });
  },
});
