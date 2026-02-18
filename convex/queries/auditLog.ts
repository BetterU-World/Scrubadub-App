import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner } from "../lib/helpers";

export const list = query({
  args: {
    sessionToken: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.sessionToken);
    const companyId = owner.companyId;

    const logs = await ctx.db
      .query("auditLog")
      .withIndex("by_companyId_timestamp", (q) =>
        q.eq("companyId", companyId)
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
