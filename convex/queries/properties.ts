import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    return await ctx.db
      .query("properties")
      .withIndex("by_companyId", (q) => q.eq("companyId", user.companyId))
      .collect();
  },
});

export const get = query({
  args: { sessionToken: v.string(), propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const property = await ctx.db.get(args.propertyId);
    if (!property) return null;
    if (property.companyId !== user.companyId) throw new Error("Not your company");
    return property;
  },
});

export const getHistory = query({
  args: { sessionToken: v.string(), propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== user.companyId) throw new Error("Not your company");

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
          const u = await ctx.db.get(id);
          return u ? { _id: u._id, name: u.name } : null;
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
