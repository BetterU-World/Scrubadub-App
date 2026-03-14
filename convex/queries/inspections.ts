import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess, getSessionUser, hasManagerPermission } from "../lib/auth";

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

/** Get inspection-sourced red flags (severity != "none") for a company — used by Red Flags dashboard. */
export const getInspectionRedFlags = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

    const inspections = await ctx.db
      .query("managerInspections")
      .withIndex("by_companyId_createdAt", (q) => q.eq("companyId", args.companyId))
      .collect();

    // Filter to only those with actual red flags
    const flagged = inspections.filter((ins) => ins.severity !== "none");

    // Inspection flags are synthetic and always "open" — only show for "open" or unfiltered
    if (args.status && args.status !== "open") return [];

    return Promise.all(
      flagged.map(async (ins) => {
        const manager = await ctx.db.get(ins.managerId);
        const job = await ctx.db.get(ins.jobId);
        const property = job?.propertyId ? await ctx.db.get(job.propertyId) : null;
        return {
          _id: ins._id,
          source: "inspection" as const,
          severity: ins.severity,
          category: "inspection" as const,
          note: ins.notes ?? `Inspection red flag: ${ins.severity}`,
          status: "open" as const,
          propertyName: (property as any)?.name ?? "Unknown",
          jobDate: job?.scheduledDate ?? "Unknown",
          managerName: manager?.name ?? "Unknown",
          readinessScore: ins.readinessScore,
          createdAt: ins.createdAt,
          jobId: ins.jobId,
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

    // Only true when owner explicitly reopened (not initial undefined state)
    const cycleOpen = job.inspectionCycleOpen === true;

    if (inspections.length === 0) {
      return {
        count: 0,
        latestScore: null,
        latestSeverity: null,
        latestDate: null,
        inspectionCycleOpen: cycleOpen,
      };
    }

    // Sort newest first to get latest
    inspections.sort((a, b) => b.createdAt - a.createdAt);
    const latest = inspections[0];

    return {
      count: inspections.length,
      latestScore: latest.readinessScore,
      latestSeverity: latest.severity,
      latestDate: latest.createdAt,
      inspectionCycleOpen: cycleOpen,
    };
  },
});
