import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

export const getMyLedger = query({
  args: {
    userId: v.id("users"),
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
