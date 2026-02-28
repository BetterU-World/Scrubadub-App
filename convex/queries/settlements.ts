import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole } from "../lib/auth";

/**
 * List settlements for the current owner's company.
 * Returns both "owing" (from) and "owed" (to) settlements.
 */
export const listMySettlements = query({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("open"), v.literal("paid")),
    role: v.optional(
      v.union(v.literal("owing"), v.literal("owed"), v.literal("all"))
    ),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);
    const companyId = owner.companyId;
    const role = args.role ?? "all";

    const results: Array<{
      _id: any;
      fromCompanyId: any;
      toCompanyId: any;
      originalJobId: any;
      viewableJobId: any;
      amountCents: number;
      currency: string;
      status: string;
      createdAt: number;
      updatedAt: number;
      paidAt?: number;
      paidMethod?: string;
      note?: string;
      counterpartyName: string;
      direction: "owing" | "owed";
      jobLabel: string;
    }> = [];

    // Settlements where we owe
    if (role === "all" || role === "owing") {
      const fromSettlements = await ctx.db
        .query("companySettlements")
        .withIndex("by_fromCompany_status", (q) =>
          q.eq("fromCompanyId", companyId).eq("status", args.status)
        )
        .collect();

      for (const s of fromSettlements) {
        const toCompany = await ctx.db.get(s.toCompanyId);
        const job = await ctx.db.get(s.originalJobId);
        const property = job?.propertyId
          ? await ctx.db.get(job.propertyId)
          : null;
        results.push({
          _id: s._id,
          fromCompanyId: s.fromCompanyId,
          toCompanyId: s.toCompanyId,
          originalJobId: s.originalJobId,
          viewableJobId: s.originalJobId,
          amountCents: s.amountCents,
          currency: s.currency,
          status: s.status,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          paidAt: s.paidAt,
          paidMethod: s.paidMethod,
          note: s.note,
          counterpartyName: toCompany?.name ?? "Unknown",
          direction: "owing",
          jobLabel: property?.name ?? job?.propertySnapshot?.name ?? job?.scheduledDate ?? "Job",
        });
      }
    }

    // Settlements where we are owed
    if (role === "all" || role === "owed") {
      const toSettlements = await ctx.db
        .query("companySettlements")
        .withIndex("by_toCompany_status", (q) =>
          q.eq("toCompanyId", companyId).eq("status", args.status)
        )
        .collect();

      for (const s of toSettlements) {
        const fromCompany = await ctx.db.get(s.fromCompanyId);
        const job = await ctx.db.get(s.originalJobId);
        const property = job?.propertyId
          ? await ctx.db.get(job.propertyId)
          : null;
        // Resolve the copied job ID so Owner2 can link to their own copy
        const sharedJob = s.sharedJobId
          ? await ctx.db.get(s.sharedJobId)
          : null;
        const viewableJobId = sharedJob?.copiedJobId ?? s.originalJobId;
        results.push({
          _id: s._id,
          fromCompanyId: s.fromCompanyId,
          toCompanyId: s.toCompanyId,
          originalJobId: s.originalJobId,
          viewableJobId,
          amountCents: s.amountCents,
          currency: s.currency,
          status: s.status,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          paidAt: s.paidAt,
          paidMethod: s.paidMethod,
          note: s.note,
          counterpartyName: fromCompany?.name ?? "Unknown",
          direction: "owed",
          jobLabel: property?.name ?? job?.propertySnapshot?.name ?? job?.scheduledDate ?? "Job",
        });
      }
    }

    // Sort by createdAt descending
    results.sort((a, b) => b.createdAt - a.createdAt);
    return results;
  },
});

/**
 * Get settlement for a specific job (used in JobDetailPage).
 */
export const getSettlementForJob = query({
  args: {
    userId: v.id("users"),
    originalJobId: v.id("jobs"),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    const settlement = await ctx.db
      .query("companySettlements")
      .withIndex("by_originalJobId", (q) =>
        q.eq("originalJobId", args.originalJobId)
      )
      .filter((q) => q.eq(q.field("fromCompanyId"), owner.companyId))
      .first();

    if (!settlement) return null;

    const toCompany = await ctx.db.get(settlement.toCompanyId);
    return {
      ...settlement,
      toCompanyName: toCompany?.name ?? "Unknown",
    };
  },
});
