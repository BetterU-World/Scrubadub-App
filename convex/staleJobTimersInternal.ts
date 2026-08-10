import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const MINIMUM_STALE_AGE_MS = 24 * 60 * 60 * 1000;
const SCAN_LIMIT = 2_000;

function isStaleOpenTimer(
  job: {
    status: string;
    startedAt?: number;
    completedAt?: number;
    cancelledAt?: number;
    timerStoppedAt?: number;
  },
  cutoffBefore: number,
) {
  return job.status === "in_progress" &&
    job.startedAt !== undefined &&
    job.startedAt < cutoffBefore &&
    job.completedAt === undefined &&
    job.cancelledAt === undefined &&
    job.timerStoppedAt === undefined;
}

function assertSafeCutoff(cutoffBefore: number) {
  if (!Number.isFinite(cutoffBefore) || cutoffBefore > Date.now() - MINIMUM_STALE_AGE_MS) {
    throw new Error("Stale timer cutoff must be at least 24 hours old");
  }
}

/** Read-only production preview. Supply an intentionally old timestamp cutoff. */
export const preview = internalQuery({
  args: { companyId: v.id("companies"), cutoffBefore: v.number() },
  handler: async (ctx, args) => {
    assertSafeCutoff(args.cutoffBefore);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_status", (q) =>
        q.eq("companyId", args.companyId).eq("status", "in_progress"))
      .take(SCAN_LIMIT);
    const candidates = jobs.filter((job) => isStaleOpenTimer(job, args.cutoffBefore));
    return await Promise.all(candidates.map(async (job) => {
      const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
      return {
        jobId: job._id,
        companyId: job.companyId,
        propertyName: property?.name ?? job.propertySnapshot?.name ?? null,
        scheduledDate: job.scheduledDate,
        status: job.status,
        startedAt: job.startedAt!,
        currentPauseStartedAt: job.currentPauseStartedAt ?? null,
        pauseCount: job.pauseHistory?.length ?? 0,
      };
    }));
  },
});

/**
 * One-time, explicitly confirmed cleanup. Every ID is revalidated against the
 * same cutoff, making retries idempotent and preserving ambiguous/current work.
 */
export const closeConfirmed = internalMutation({
  args: {
    cutoffBefore: v.number(),
    companyId: v.id("companies"),
    jobIds: v.array(v.id("jobs")),
  },
  handler: async (ctx, args) => {
    assertSafeCutoff(args.cutoffBefore);
    const closedAt = Date.now();
    const closed = [];
    const skipped = [];
    for (const jobId of [...new Set(args.jobIds)]) {
      const job = await ctx.db.get(jobId);
      if (!job || job.companyId !== args.companyId || !isStaleOpenTimer(job, args.cutoffBefore)) {
        skipped.push(jobId);
        continue;
      }

      let pauseHistory = job.pauseHistory;
      if (job.currentPauseStartedAt !== undefined) {
        pauseHistory = [...(job.pauseHistory ?? [])];
        const openIndex = pauseHistory.findIndex((pause) => pause.resumedAt === undefined);
        if (openIndex >= 0) {
          const pause = pauseHistory[openIndex];
          pauseHistory[openIndex] = {
            ...pause,
            resumedAt: closedAt,
            durationMs: Math.max(0, closedAt - pause.pausedAt),
          };
        }
      }

      await ctx.db.patch(jobId, {
        timerStoppedAt: closedAt,
        currentPauseStartedAt: undefined,
        pauseHistory,
      });
      closed.push(jobId);
    }
    return { closedAt, closed, skipped };
  },
});
