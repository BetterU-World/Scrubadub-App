import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

export const listByCompany = query({
  args: {
    sessionToken: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const companyId = user.companyId;

    let flags;
    if (args.status) {
      flags = await ctx.db
        .query("redFlags")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", companyId).eq("status", args.status as any)
        )
        .collect();
    } else {
      flags = await ctx.db
        .query("redFlags")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", companyId)
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
  args: { sessionToken: v.string(), jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== user.companyId) throw new Error("Not your company");

    return await ctx.db
      .query("redFlags")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});
