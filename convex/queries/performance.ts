import { query } from "../_generated/server";
import { v } from "convex/values";

export const getCleanerStats = query({
  args: {
    cleanerId: v.id("users"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Get all jobs for this company
    const allJobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) =>
        q.eq("companyId", args.companyId)
      )
      .collect();

    // Filter to approved jobs where this cleaner was assigned
    const approvedJobs = allJobs.filter(
      (j) =>
        j.status === "approved" && j.cleanerIds.includes(args.cleanerId)
    );

    // Jobs completed this week (using completedAt timestamp)
    const jobsCompletedThisWeek = approvedJobs.filter(
      (j) => j.completedAt && j.completedAt >= sevenDaysAgo
    ).length;

    // Jobs completed this month
    const jobsCompletedThisMonth = approvedJobs.filter(
      (j) => j.completedAt && j.completedAt >= thirtyDaysAgo
    ).length;

    // Total jobs completed all time
    const totalJobsCompleted = approvedJobs.length;

    // Get all forms by this cleaner
    const forms = await ctx.db
      .query("forms")
      .withIndex("by_cleanerId", (q) => q.eq("cleanerId", args.cleanerId))
      .collect();

    // Average cleaner score from submitted/approved forms
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

    // Red flags reported: count red flags from jobs this cleaner was on
    const cleanerJobIds = new Set(approvedJobs.map((j) => j._id));
    // Also include non-approved jobs the cleaner submitted forms for
    const allCleanerJobs = allJobs.filter((j) =>
      j.cleanerIds.includes(args.cleanerId)
    );
    const allCleanerJobIds = new Set(allCleanerJobs.map((j) => j._id));

    let redFlagsReported = 0;
    for (const jobId of allCleanerJobIds) {
      const flags = await ctx.db
        .query("redFlags")
        .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
        .collect();
      redFlagsReported += flags.length;
    }

    // Current streak: consecutive approved jobs without rework, from most recent
    // Sort approved jobs by completedAt descending
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
  },
  handler: async (ctx, args) => {
    // Get all active cleaners in the company
    const allUsers = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();

    const activecleaners = allUsers.filter(
      (u) => u.role === "cleaner" && u.status === "active"
    );

    // Get all jobs for this company
    const allJobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) =>
        q.eq("companyId", args.companyId)
      )
      .collect();

    const approvedJobs = allJobs.filter((j) => j.status === "approved");

    // Build leaderboard for each cleaner
    const leaderboard = await Promise.all(
      activecleaners.map(async (cleaner) => {
        // Approved jobs for this cleaner
        const cleanerApprovedJobs = approvedJobs.filter((j) =>
          j.cleanerIds.includes(cleaner._id)
        );

        const totalJobs = cleanerApprovedJobs.length;

        // Average job duration in minutes (completedAt - startedAt)
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

        // Get forms for this cleaner to compute average score
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

        // Red flag count from their jobs
        let redFlagCount = 0;
        const cleanerJobIds = cleanerApprovedJobs.map((j) => j._id);
        for (const jobId of cleanerJobIds) {
          const flags = await ctx.db
            .query("redFlags")
            .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
            .collect();
          redFlagCount += flags.length;
        }

        // Consistency score: percentage of jobs approved on first try (reworkCount === 0)
        // Consider all jobs this cleaner was part of (not just approved)
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

    // Sort by averageScore descending by default
    return leaderboard.sort((a, b) => b.averageScore - a.averageScore);
  },
});
