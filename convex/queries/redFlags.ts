import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess, getSessionUser } from "../lib/auth";

export const listByCompany = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

    let flags;
    if (args.status) {
      flags = await ctx.db
        .query("redFlags")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", args.companyId).eq("status", args.status as any)
        )
        .collect();
    } else {
      flags = await ctx.db
        .query("redFlags")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", args.companyId)
        )
        .collect();
    }

    return Promise.all(
      flags.map(async (flag) => {
        const property = await ctx.db.get(flag.propertyId);
        const job = await ctx.db.get(flag.jobId);
        return {
          ...flag,
          propertyName: property?.name ?? "Unknown",
          jobDate: job?.scheduledDate ?? "Unknown",
        };
      })
    );
  },
});

export const listByJob = query({
  args: { jobId: v.id("jobs"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) return [];
    if (job.companyId !== user.companyId) throw new Error("Access denied");

    return await ctx.db
      .query("redFlags")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});
