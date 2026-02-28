import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole } from "../lib/auth";

/**
 * Create or update a settlement for a shared job (idempotent per originalJobId + from/to).
 */
export const upsertSettlementForSharedJob = mutation({
  args: {
    userId: v.id("users"),
    originalJobId: v.id("jobs"),
    toCompanyId: v.id("companies"),
    amountCents: v.number(),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);
    const fromCompanyId = owner.companyId;

    // Verify the job belongs to this owner's company
    const job = await ctx.db.get(args.originalJobId);
    if (!job || job.companyId !== fromCompanyId) {
      throw new Error("Job not found or does not belong to your company");
    }

    // Lightweight validation: verify a sharedJob record exists for this pair
    const sharedJob = await ctx.db
      .query("sharedJobs")
      .withIndex("by_originalJobId", (q) => q.eq("originalJobId", args.originalJobId))
      .filter((q) =>
        q.and(
          q.eq(q.field("fromCompanyId"), fromCompanyId),
          q.eq(q.field("toCompanyId"), args.toCompanyId)
        )
      )
      .first();

    if (!sharedJob) {
      throw new Error("No shared job record found for this job and partner");
    }

    // Check for existing settlement (idempotent upsert)
    const existing = await ctx.db
      .query("companySettlements")
      .withIndex("by_originalJobId", (q) => q.eq("originalJobId", args.originalJobId))
      .filter((q) =>
        q.and(
          q.eq(q.field("fromCompanyId"), fromCompanyId),
          q.eq(q.field("toCompanyId"), args.toCompanyId)
        )
      )
      .first();

    const now = Date.now();
    const currency = args.currency ?? "usd";

    if (existing) {
      if (existing.status === "paid") {
        throw new Error("Settlement is already paid");
      }
      await ctx.db.patch(existing._id, {
        amountCents: args.amountCents,
        currency,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("companySettlements", {
      fromCompanyId,
      toCompanyId: args.toCompanyId,
      originalJobId: args.originalJobId,
      sharedJobId: sharedJob._id,
      amountCents: args.amountCents,
      currency,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Mark a settlement as paid.
 */
export const markSettlementPaid = mutation({
  args: {
    userId: v.id("users"),
    settlementId: v.id("companySettlements"),
    paidMethod: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) throw new Error("Settlement not found");

    // Only the owing company can mark paid
    if (settlement.fromCompanyId !== owner.companyId) {
      throw new Error("Only the owing company can mark a settlement as paid");
    }

    if (settlement.status === "paid") {
      throw new Error("Settlement is already paid");
    }

    const now = Date.now();
    await ctx.db.patch(args.settlementId, {
      status: "paid",
      paidAt: now,
      updatedAt: now,
      paidMethod: args.paidMethod,
      note: args.note,
    });

    return args.settlementId;
  },
});
