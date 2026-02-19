import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess } from "../lib/auth";

export const list = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await assertCompanyAccess(ctx, args.userId, args.companyId);
    if (user.role !== "owner") throw new Error("Owner access required");

    const logs = await ctx.db
      .query("auditLog")
      .withIndex("by_companyId_timestamp", (q) =>
        q.eq("companyId", args.companyId)
      )
      .order("desc")
      .take(args.limit ?? 100);

    return Promise.all(
      logs.map(async (log) => {
        const u = await ctx.db.get(log.userId);
        return {
          ...log,
          userName: u?.name ?? "Unknown",
        };
      })
    );
  },
});
