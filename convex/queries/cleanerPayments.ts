import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole } from "../lib/auth";

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
