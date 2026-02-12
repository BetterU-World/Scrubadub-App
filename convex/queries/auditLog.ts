import { query } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    companyId: v.id("companies"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("auditLog")
      .withIndex("by_companyId_timestamp", (q) =>
        q.eq("companyId", args.companyId)
      )
      .order("desc")
      .take(args.limit ?? 100);

    return Promise.all(
      logs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        return {
          ...log,
          userName: user?.name ?? "Unknown",
        };
      })
    );
  },
});
