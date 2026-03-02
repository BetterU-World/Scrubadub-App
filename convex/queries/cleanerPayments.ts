import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole, getSessionUser } from "../lib/auth";

/**
 * Get cleaner payment record for a specific job (used in JobDetailPage).
 * Returns the payment record + cleaner's name and stripeConnectAccountId.
 */
export const getCleanerPaymentForJob = query({
  args: {
    userId: v.id("users"),
    jobId: v.id("jobs"),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== owner.companyId) return null;

    // Get assigned cleaner info
    const cleanerId = job.cleanerIds[0];
    if (!cleanerId) return null;

    const cleaner = await ctx.db.get(cleanerId);

    // Look up existing payment
    const payment = await ctx.db
      .query("cleanerPayments")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    return {
      payment: payment ?? null,
      cleanerName: cleaner?.name ?? "Unknown",
      cleanerUserId: cleanerId,
      cleanerStripeAccountId: cleaner?.stripeConnectAccountId ?? null,
    };
  },
});

/**
 * Internal query: fetch cleaner payment + cleaner data for the checkout action.
 */
export const getCleanerPaymentForCheckout = internalQuery({
  args: { cleanerPaymentId: v.id("cleanerPayments") },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.cleanerPaymentId);
    if (!payment) return null;

    const cleaner = await ctx.db.get(payment.cleanerUserId);
    if (!cleaner) return null;

    const job = await ctx.db.get(payment.jobId);
    const property = job?.propertyId ? await ctx.db.get(job.propertyId) : null;
    const jobLabel =
      property?.name ??
      (job as any)?.propertySnapshot?.name ??
      job?.scheduledDate ??
      "Job";

    return {
      _id: payment._id,
      companyId: payment.companyId,
      jobId: payment.jobId,
      cleanerUserId: payment.cleanerUserId,
      amountCents: payment.amountCents,
      status: payment.status,
      cleanerName: cleaner.name,
      cleanerStripeAccountId: cleaner.stripeConnectAccountId ?? null,
      jobLabel,
    };
  },
});

/**
 * List cleaner payments for the owner's company (owner view).
 * Optionally filter by status.
 */
export const listCleanerPaymentsForCompany = query({
  args: {
    userId: v.id("users"),
    status: v.optional(v.union(v.literal("OPEN"), v.literal("PAID"))),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    const payments = await ctx.db
      .query("cleanerPayments")
      .withIndex("by_companyId", (q) => q.eq("companyId", owner.companyId))
      .collect();

    const filtered = args.status
      ? payments.filter((p) => p.status === args.status)
      : payments;

    // Enrich with cleaner name + job label
    const results = [];
    for (const p of filtered) {
      const cleaner = await ctx.db.get(p.cleanerUserId);
      const job = await ctx.db.get(p.jobId);
      const property = job?.propertyId ? await ctx.db.get(job.propertyId) : null;
      const jobLabel =
        property?.name ??
        (job as any)?.propertySnapshot?.name ??
        job?.scheduledDate ??
        "Job";
      results.push({
        _id: p._id,
        jobId: p.jobId,
        cleanerUserId: p.cleanerUserId,
        cleanerName: cleaner?.name ?? "Unknown",
        cleanerStripeAccountId: cleaner?.stripeConnectAccountId ?? null,
        amountCents: p.amountCents,
        method: p.method,
        status: p.status,
        createdAt: p.createdAt,
        paidAt: p.paidAt,
        jobLabel,
      });
    }

    // Sort by createdAt descending
    results.sort((a, b) => b.createdAt - a.createdAt);
    return results;
  },
});

/**
 * List the calling cleaner's own payments (cleaner view).
 */
export const listMyCleanerPayments = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    const payments = await ctx.db
      .query("cleanerPayments")
      .withIndex("by_cleanerUserId", (q) => q.eq("cleanerUserId", user._id))
      .collect();

    const results = [];
    for (const p of payments) {
      const job = await ctx.db.get(p.jobId);
      const property = job?.propertyId ? await ctx.db.get(job.propertyId) : null;
      const jobLabel =
        property?.name ??
        (job as any)?.propertySnapshot?.name ??
        job?.scheduledDate ??
        "Job";
      results.push({
        _id: p._id,
        jobId: p.jobId,
        amountCents: p.amountCents,
        method: p.method,
        status: p.status,
        createdAt: p.createdAt,
        paidAt: p.paidAt,
        jobLabel,
      });
    }

    results.sort((a, b) => b.createdAt - a.createdAt);
    return results;
  },
});

/**
 * List unpaid jobs for a company (owner view, for OPEN tab).
 * Sources from jobs table — shows items even before a cleanerPayments record exists.
 */
export const listUnpaidJobsForCompany = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_status", (q) => q.eq("companyId", owner.companyId))
      .collect();

    const results = [];
    for (const job of jobs) {
      // Skip cancelled/denied or unassigned jobs
      if (job.status === "cancelled" || job.status === "denied") continue;
      if (job.cleanerIds.length === 0) continue;

      // Skip already-paid jobs
      if (job.cleanerPaymentId) {
        const payment = await ctx.db.get(job.cleanerPaymentId);
        if (payment && payment.status === "PAID") continue;
      }

      const cleaner = await ctx.db.get(job.cleanerIds[0]);
      const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
      const propName =
        property?.name ??
        (job as any).propertySnapshot?.name ??
        "Job";

      results.push({
        _id: job._id,
        jobId: job._id,
        status: job.status,
        cleanerUserId: job.cleanerIds[0],
        cleanerName: cleaner?.name ?? "Unknown",
        cleanerStripeAccountId: cleaner?.stripeConnectAccountId ?? null,
        jobLabel: `${propName} — ${job.scheduledDate}`,
        plannedPayCents: job.plannedCleanerPayCents ?? null,
        scheduledDate: job.scheduledDate,
        isEligible: ["submitted", "approved"].includes(job.status),
      });
    }

    results.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
    return results;
  },
});

/**
 * List all jobs for a cleaner with their payment status (cleaner view).
 * Combines job data with cleanerPayment records.
 */
export const listCleanerJobsWithPaymentStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_status", (q) => q.eq("companyId", user.companyId))
      .collect();

    const results = [];
    for (const job of jobs) {
      if (!job.cleanerIds.includes(args.userId)) continue;
      if (job.status === "cancelled" || job.status === "denied") continue;

      // Look up payment record if exists
      let payment = null;
      if (job.cleanerPaymentId) {
        payment = await ctx.db.get(job.cleanerPaymentId);
      }

      const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
      const propName =
        property?.name ??
        (job as any).propertySnapshot?.name ??
        "Job";

      results.push({
        _id: job._id,
        jobId: job._id,
        jobLabel: `${propName} — ${job.scheduledDate}`,
        scheduledDate: job.scheduledDate,
        status: job.status,
        plannedPayCents: job.plannedCleanerPayCents ?? null,
        paymentStatus: payment?.status ?? null,
        amountCents: payment?.amountCents ?? null,
        method: payment?.method ?? null,
        paidAt: payment?.paidAt ?? null,
      });
    }

    // Paid last, then by date descending
    results.sort((a, b) => {
      if (a.paymentStatus === "PAID" && b.paymentStatus !== "PAID") return 1;
      if (a.paymentStatus !== "PAID" && b.paymentStatus === "PAID") return -1;
      return b.scheduledDate.localeCompare(a.scheduledDate);
    });
    return results;
  },
});
