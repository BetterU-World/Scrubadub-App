import { query } from "../_generated/server";
import { v } from "convex/values";

export const listByCompany = query({
  args: {
    companyId: v.id("companies"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("redFlags")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});
