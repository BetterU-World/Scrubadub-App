import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess } from "../lib/auth";

export const getCleanerStats = query({
  args: {
    cleanerId: v.id("users"),
    companyId: v.id("companies"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const allJobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) =>
        q.eq("companyId", args.companyId)
      )
      .collect();

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
      .collect();
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
  },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

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
      .collect();

    const approvedJobs = allJobs.filter((j) => j.status === "approved");

    // Batch: fetch all red flags for this company once (fixes N+1)
    const allRedFlags = await ctx.db
      .query("redFlags")
      .withIndex("by_companyId_status", (q) =>
        q.eq("companyId", args.companyId)
      )
      .collect();

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
                    sum + ((j.completedAt! - j.startedAt!) / (1000 * 60)),
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
  },
});
