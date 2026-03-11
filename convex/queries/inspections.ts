import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser, hasManagerPermission } from "../lib/auth";

/** Get all inspections for a specific job. */
export const getByJob = query({
  args: {
    jobId: v.id("jobs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) return [];
    if (job.companyId !== user.companyId) return [];

    // Manager visibility: must be able to see this job
    if (user.role === "manager" && !hasManagerPermission(user, "canSeeAllJobs")) {
      if (job.assignedManagerId !== user._id) return [];
    }

    // Cleaners/maintenance should not see inspections
    if (user.role === "cleaner" || user.role === "maintenance") return [];

    const inspections = await ctx.db
      .query("managerInspections")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    // Sort newest first
    inspections.sort((a, b) => b.createdAt - a.createdAt);

    // Resolve manager names and photo URLs
    return Promise.all(
      inspections.map(async (ins) => {
        const manager = await ctx.db.get(ins.managerId);
        let photoUrls: string[] = [];
        if (ins.photoStorageIds && ins.photoStorageIds.length > 0) {
          const urls = await Promise.all(
            ins.photoStorageIds.map((id) => ctx.storage.getUrl(id))
          );
          photoUrls = urls.filter((u): u is string => u !== null);
        }
        return {
          ...ins,
          managerName: manager?.name ?? "Unknown",
          photoUrls,
        };
      })
    );
  },
});

/** Lightweight inspection summary for a job (latest inspection info + count). */
export const getSummary = query({
  args: {
    jobId: v.id("jobs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    if (job.companyId !== user.companyId) return null;

    // Cleaners/maintenance should not see inspection summaries
    if (user.role === "cleaner" || user.role === "maintenance") return null;

    // Manager visibility
    if (user.role === "manager" && !hasManagerPermission(user, "canSeeAllJobs")) {
      if (job.assignedManagerId !== user._id) return null;
    }

    const inspections = await ctx.db
      .query("managerInspections")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    if (inspections.length === 0) return null;

    // Sort newest first to get latest
    inspections.sort((a, b) => b.createdAt - a.createdAt);
    const latest = inspections[0];

    return {
      count: inspections.length,
      latestScore: latest.readinessScore,
      latestSeverity: latest.severity,
      latestDate: latest.createdAt,
    };
  },
});
