import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess, getSessionUser } from "../lib/auth";

export const list = query({
  args: { companyId: v.id("companies"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

    return await ctx.db
      .query("properties")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const get = query({
  args: { propertyId: v.id("properties"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property) return null;
    if (property.companyId !== user.companyId) throw new Error("Access denied");
    return property;
  },
});

export const getHistory = query({
  args: { propertyId: v.id("properties"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property) return { timeline: [], totalJobs: 0, totalRedFlags: 0, openRedFlags: 0 };
    if (property.companyId !== user.companyId) throw new Error("Access denied");

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    const redFlags = await ctx.db
      .query("redFlags")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    const timeline: Array<{
      type: "job" | "red_flag";
      date: string;
      timestamp: number;
      data: Record<string, unknown>;
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
        data: { ...job, cleaners: cleaners.filter(Boolean) },
      });
    }

    for (const flag of redFlags) {
      const job = await ctx.db.get(flag.jobId);
      timeline.push({
        type: "red_flag",
        date: job?.scheduledDate ?? "",
        timestamp: flag._creationTime,
        data: { ...flag, jobDate: job?.scheduledDate ?? "Unknown" },
      });
    }

    timeline.sort((a, b) => b.timestamp - a.timestamp);

    return {
      timeline,
      totalJobs: jobs.length,
      totalRedFlags: redFlags.length,
      openRedFlags: redFlags.filter((f) => f.status === "open").length,
    };
  },
});
