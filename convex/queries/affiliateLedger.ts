import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

export const getMyLedger = query({
  args: {
    userId: v.id("users"),
    periodType: v.optional(
      v.union(v.literal("monthly"), v.literal("weekly"))
    ),
    status: v.optional(
      v.union(v.literal("open"), v.literal("locked"), v.literal("paid"))
    ),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const limit = args.limit ?? 50;

    let entries = await ctx.db
      .query("affiliateLedger")
      .withIndex("by_referrerUserId", (q) =>
        q.eq("referrerUserId", user._id)
      )
      .order("desc")
      .collect();

    // Apply optional filters in memory (page sizes are small)
    if (args.periodType) {
      entries = entries.filter((e) => e.periodType === args.periodType);
    }
    if (args.status) {
      entries = entries.filter((e) => e.status === args.status);
    }

    // Manual cursor-based pagination using periodStart
    if (args.cursor !== undefined) {
      entries = entries.filter((e) => e.periodStart < args.cursor!);
    }

    const page = entries.slice(0, limit);
    const nextCursor =
      page.length === limit ? page[page.length - 1].periodStart : undefined;

    return { rows: page, nextCursor };
  },
});
