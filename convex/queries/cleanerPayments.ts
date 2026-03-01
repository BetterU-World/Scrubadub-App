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
        cleanerName: cleaner?.name ?? "Unknown",
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
