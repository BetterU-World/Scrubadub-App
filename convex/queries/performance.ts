import { query } from "../_generated/server";
import { getJobTiming } from "../lib/jobTiming";
import { v } from "convex/values";
import { requireStaffCompany } from "../lib/sessionAuth";
import { withPerfLog } from "../lib/perfLog";
import { getActiveTeamIdsForUser } from "../lib/teams";

const COMPANY_QUERY_CAP = 5_000;

function emptyWorkerSummary() {
  return {
    jobsCompleted: 0,
    jobsAwaitingReview: 0,
    jobsRequiringRework: 0,
    activeJobs: 0,
    lastJobCompleted: null,
    averageCleanerScore: null,
    averageInspectionScore: null,
    redFlagCount: 0,
    recentJobs: [],
  };
}

export const getCleanerStats = query({
  args: {
    cleanerId: v.id("users"),
    companyId: v.id("companies"),
    userId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);

    // Verify the cleaner belongs to the same company
    const cleaner = await ctx.db.get(args.cleanerId);
    if (!cleaner || cleaner.companyId !== args.companyId) {
      throw new Error("Access denied");
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const allJobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) =>
        q.eq("companyId", args.companyId)
      )
      .take(COMPANY_QUERY_CAP);

    const approvedJobs = allJobs.filter(
      (j) => j.status === "approved" && j.cleanerIds.includes(args.cleanerId)
    );

    const jobsCompletedThisWeek = approvedJobs.filter(
      (j) => j.completedAt && j.completedAt >= sevenDaysAgo
    ).length;

    const jobsCompletedThisMonth = approvedJobs.filter(
      (j) => j.completedAt && j.completedAt >= thirtyDaysAgo
    ).length;

    const totalJobsCompleted = approvedJobs.length;

    const forms = await ctx.db
      .query("forms")
      .withIndex("by_cleanerId", (q) => q.eq("cleanerId", args.cleanerId))
      .collect();

    const scoredForms = forms.filter(
      (f) =>
        (f.status === "submitted" || f.status === "approved") &&
        f.cleanerScore !== undefined &&
        f.cleanerScore !== null
    );
    const averageScore =
      scoredForms.length > 0
        ? Math.round(
            (scoredForms.reduce((sum, f) => sum + (f.cleanerScore ?? 0), 0) /
              scoredForms.length) *
              10
          ) / 10
        : 0;

    // Batch red flag lookup instead of N+1 per-job queries
    const allCleanerJobs = allJobs.filter((j) =>
      j.cleanerIds.includes(args.cleanerId)
    );
    const allCleanerJobIds = new Set(allCleanerJobs.map((j) => j._id));

    const companyRedFlags = await ctx.db
      .query("redFlags")
      .withIndex("by_companyId_status", (q) =>
        q.eq("companyId", args.companyId)
      )
      .take(COMPANY_QUERY_CAP);
    const redFlagsReported = companyRedFlags.filter((f) =>
      allCleanerJobIds.has(f.jobId)
    ).length;

    const sortedApproved = approvedJobs
      .filter((j) => j.completedAt)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

    let currentStreak = 0;
    for (const job of sortedApproved) {
      if (job.reworkCount === 0) {
        currentStreak++;
      } else {
        break;
      }
    }

    return {
      jobsCompletedThisWeek,
      jobsCompletedThisMonth,
      totalJobsCompleted,
      averageScore,
      redFlagsReported,
      currentStreak,
    };
  },
});

export const getLeaderboard = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await withPerfLog(ctx, "performance:leaderboard", async () => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);

    const allUsers = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();

    const activeCleaners = allUsers.filter(
      (u) => u.role === "cleaner" && u.status === "active"
    );

    const allJobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) =>
        q.eq("companyId", args.companyId)
      )
      .take(COMPANY_QUERY_CAP);

    const approvedJobs = allJobs.filter((j) => j.status === "approved");

    // Batch: fetch all red flags for this company once (fixes N+1)
    const allRedFlags = await ctx.db
      .query("redFlags")
      .withIndex("by_companyId_status", (q) =>
        q.eq("companyId", args.companyId)
      )
      .take(COMPANY_QUERY_CAP);

    const leaderboard = await Promise.all(
      activeCleaners.map(async (cleaner) => {
        const cleanerApprovedJobs = approvedJobs.filter((j) =>
          j.cleanerIds.includes(cleaner._id)
        );

        const totalJobs = cleanerApprovedJobs.length;

        const timedJobs = cleanerApprovedJobs.filter(
          (j) => j.startedAt && j.completedAt
        );
        const averageTimeMinutes =
          timedJobs.length > 0
            ? Math.round(
                timedJobs.reduce(
                  (sum, j) =>
                    sum + (getJobTiming(j, j.completedAt!).activeMs / (1000 * 60)),
                  0
                ) / timedJobs.length
              )
            : 0;

        const forms = await ctx.db
          .query("forms")
          .withIndex("by_cleanerId", (q) => q.eq("cleanerId", cleaner._id))
          .collect();

        const scoredForms = forms.filter(
          (f) =>
            (f.status === "submitted" || f.status === "approved") &&
            f.cleanerScore !== undefined &&
            f.cleanerScore !== null
        );
        const averageScore =
          scoredForms.length > 0
            ? Math.round(
                (scoredForms.reduce(
                  (sum, f) => sum + (f.cleanerScore ?? 0),
                  0
                ) /
                  scoredForms.length) *
                  10
              ) / 10
            : 0;

        // Use pre-fetched red flags instead of N+1
        const cleanerJobIds = new Set(cleanerApprovedJobs.map((j) => j._id));
        const redFlagCount = allRedFlags.filter((f) =>
          cleanerJobIds.has(f.jobId)
        ).length;

        const allCleanerJobs = allJobs.filter(
          (j) =>
            j.cleanerIds.includes(cleaner._id) && j.status !== "cancelled"
        );
        const firstTryApproved = cleanerApprovedJobs.filter(
          (j) => j.reworkCount === 0
        ).length;
        const consistencyScore =
          allCleanerJobs.length > 0
            ? Math.round((firstTryApproved / allCleanerJobs.length) * 100)
            : 0;

        return {
          cleanerId: cleaner._id,
          cleanerName: cleaner.name,
          totalJobs,
          averageScore,
          averageTimeMinutes,
          redFlagCount,
          consistencyScore,
        };
      })
    );

    return leaderboard.sort((a, b) => b.averageScore - a.averageScore);
    });
  },
});

export const getWorkerSummary = query({
  args: {
    workerUserId: v.id("users"),
    companyId: v.id("companies"),
    userId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await withPerfLog(ctx, "performance:workerSummary", async () => {
      await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);

      const worker = await ctx.db.get(args.workerUserId);
      if (!worker || worker.companyId !== args.companyId) {
        return emptyWorkerSummary();
      }

      const allJobs = await ctx.db
        .query("jobs")
        .withIndex("by_companyId_scheduledDate", (q) =>
          q.eq("companyId", args.companyId)
        )
        .take(COMPANY_QUERY_CAP);

      const activeTeamIds = await getActiveTeamIdsForUser(ctx, args.workerUserId, args.companyId);
      const assignedJobs = allJobs.filter(
        (job) =>
          job.status !== "cancelled" &&
          (job.cleanerIds.includes(args.workerUserId) ||
            job.assignedManagerId === args.workerUserId ||
            (job.assignedTeamId && activeTeamIds.has(job.assignedTeamId)))
      );
      const assignedJobIds = new Set(assignedJobs.map((job) => job._id));

      const jobsCompleted = assignedJobs.filter((job) => job.status === "approved");
      const jobsAwaitingReview = assignedJobs.filter((job) => job.status === "submitted");
      const jobsRequiringRework = assignedJobs.filter((job) => job.status === "rework_requested");
      const activeJobs = assignedJobs.filter((job) =>
        job.status === "scheduled" ||
        job.status === "confirmed" ||
        job.status === "in_progress"
      );
      const lastJobCompleted = jobsCompleted
        .filter((job) => job.completedAt)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0] ?? null;

      const forms = await ctx.db
        .query("forms")
        .withIndex("by_cleanerId", (q) => q.eq("cleanerId", args.workerUserId))
        .collect();
      const scoredForms = forms.filter(
        (form) =>
          (form.status === "submitted" || form.status === "approved") &&
          form.cleanerScore !== undefined &&
          form.cleanerScore !== null
      );
      const averageCleanerScore = scoredForms.length > 0
        ? Math.round(
            (scoredForms.reduce((sum, form) => sum + (form.cleanerScore ?? 0), 0) /
              scoredForms.length) *
              10
          ) / 10
        : null;

      const inspections = await ctx.db
        .query("managerInspections")
        .withIndex("by_companyId_createdAt", (q) => q.eq("companyId", args.companyId))
        .take(COMPANY_QUERY_CAP);
      const workerInspections = inspections.filter(
        (inspection) =>
          inspection.managerId === args.workerUserId ||
          assignedJobIds.has(inspection.jobId)
      );
      const averageInspectionScore = workerInspections.length > 0
        ? Math.round(
            (workerInspections.reduce((sum, inspection) => sum + inspection.readinessScore, 0) /
              workerInspections.length) *
              10
          ) / 10
        : null;

      const companyRedFlags = await ctx.db
        .query("redFlags")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", args.companyId)
        )
        .take(COMPANY_QUERY_CAP);
      const redFlagCount = companyRedFlags.filter((flag) => assignedJobIds.has(flag.jobId)).length;

      const propertyIds = [...new Set(assignedJobs.map((job) => job.propertyId).filter(Boolean))];
      const properties = await Promise.all(propertyIds.map((id) => ctx.db.get(id!)));
      const propertyMap = new Map<string, NonNullable<(typeof properties)[number]>>();
      for (const property of properties) {
        if (property) propertyMap.set(property._id, property);
      }

      const recentJobs = [...assignedJobs]
        .sort((a, b) => {
          const latestA = Math.max(a.completedAt ?? 0, a.startedAt ?? 0, a._creationTime);
          const latestB = Math.max(b.completedAt ?? 0, b.startedAt ?? 0, b._creationTime);
          return latestB - latestA;
        })
        .slice(0, 5)
        .map((job) => ({
          _id: job._id,
          propertyName: job.propertyId
            ? propertyMap.get(job.propertyId)?.name ?? job.propertySnapshot?.name ?? "Unknown"
            : job.propertySnapshot?.name ?? "Unknown",
          scheduledDate: job.scheduledDate,
          status: job.status,
          completedAt: job.completedAt,
          reworkCount: job.reworkCount,
        }));

      return {
        jobsCompleted: jobsCompleted.length,
        jobsAwaitingReview: jobsAwaitingReview.length,
        jobsRequiringRework: jobsRequiringRework.length,
        activeJobs: activeJobs.length,
        lastJobCompleted: lastJobCompleted
          ? {
              _id: lastJobCompleted._id,
              scheduledDate: lastJobCompleted.scheduledDate,
              completedAt: lastJobCompleted.completedAt,
              propertyName: lastJobCompleted.propertyId
                ? propertyMap.get(lastJobCompleted.propertyId)?.name ??
                  lastJobCompleted.propertySnapshot?.name ??
                  "Unknown"
                : lastJobCompleted.propertySnapshot?.name ?? "Unknown",
            }
          : null,
        averageCleanerScore,
        averageInspectionScore,
        redFlagCount,
        recentJobs,
      };
    });
  },
});
