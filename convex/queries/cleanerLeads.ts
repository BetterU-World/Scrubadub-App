import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner } from "../lib/helpers";

/**
 * List cleaner leads for the caller's company, newest first.
 * Auth-gated: caller must be an owner.
 */
export const getCompanyCleanerLeads = query({
  args: {
    userId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("reviewed"),
        v.literal("contacted"),
        v.literal("archived")
      )
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    if (args.status) {
      return await ctx.db
        .query("cleanerLeads")
        .withIndex("by_companyId_status_createdAt", (q) =>
          q.eq("companyId", owner.companyId).eq("status", args.status!)
        )
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("cleanerLeads")
      .withIndex("by_companyId_createdAt", (q) =>
        q.eq("companyId", owner.companyId)
      )
      .order("desc")
      .collect();
  },
});

/**
 * Get a single cleaner lead by ID.
 * Auth-gated: caller must be an owner in the lead's company.
 */
export const getCleanerLeadById = query({
  args: {
    id: v.id("cleanerLeads"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const lead = await ctx.db.get(args.id);
    if (!lead) return null;

    if (lead.companyId !== owner.companyId) {
      throw new Error("Access denied");
    }

    return lead;
  },
});
