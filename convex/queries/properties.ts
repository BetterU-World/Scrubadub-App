import { query } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("properties")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const get = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.propertyId);
  },
});

export const getHistory = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    // Get all jobs for this property
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    // Get all red flags for this property
    const redFlags = await ctx.db
      .query("redFlags")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    // Build timeline entries
    const timeline: Array<{
      type: "job" | "red_flag";
      date: string;
      timestamp: number;
      data: any;
    }> = [];

    for (const job of jobs) {
      const cleaners = await Promise.all(
        job.cleanerIds.map(async (id) => {
          const user = await ctx.db.get(id);
          return user ? { _id: user._id, name: user.name } : null;
        })
      );
      timeline.push({
        type: "job",
        date: job.scheduledDate,
        timestamp: job._creationTime,
        data: {
          ...job,
          cleaners: cleaners.filter(Boolean),
        },
      });
    }

    for (const flag of redFlags) {
      const job = await ctx.db.get(flag.jobId);
      timeline.push({
        type: "red_flag",
        date: job?.scheduledDate ?? "",
        timestamp: flag._creationTime,
        data: {
          ...flag,
          jobDate: job?.scheduledDate ?? "Unknown",
        },
      });
    }

    // Sort by timestamp descending (most recent first)
    timeline.sort((a, b) => b.timestamp - a.timestamp);

    return {
      timeline,
      totalJobs: jobs.length,
      totalRedFlags: redFlags.length,
      openRedFlags: redFlags.filter((f) => f.status === "open").length,
    };
  },
});
