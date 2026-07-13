import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessionAuth";
import { withPerfLog } from "../lib/perfLog";

export const list = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    sessionToken: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await withPerfLog(ctx, "auditLog:list", async () => {
      const user = await requireOwnerSession(ctx, args.sessionToken, args.userId);
      if (user.companyId !== args.companyId) throw new Error("Access denied");

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
    });
  },
});
