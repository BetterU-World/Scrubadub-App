"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireSuperadminSession } from "./lib/sessions";
import { mergeCounts, metricCounts, type Counts } from "./lib/adminHubModel";

/** Explicit on-demand report. Sequential pages bound transaction reads, memory and response size.
 * Timeout is an error, never a partial total. A report is a read interval, not a transactional snapshot.
 */
export const report = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    companyId: v.optional(v.id("companies")),
  },
  returns: v.object({
    counts: metricCounts,
    asOf: v.number(),
    finishedAt: v.number(),
    pages: v.number(),
    observationStart: v.union(v.number(), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    counts: Counts;
    asOf: number;
    finishedAt: number;
    pages: number;
    observationStart: number | null;
  }> => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const asOf = Date.now(),
      counts: Counts = {};
    let pages = 0,
      observationStart: number | null = null;
    for (const table of [
      "companies",
      "users",
      "workerProfiles",
      "clientUsers",
      "clientRelationships",
      "jobs",
    ] as const) {
      let cursor: string | null = null;
      while (true) {
        if (Date.now() - asOf > 8 * 60_000)
          throw new Error(
            "Report exceeded its read budget. No partial totals were returned; narrow to one company.",
          );
        const page: {
          counts: Counts;
          isDone: boolean;
          cursor: string;
          observationStart: number | null;
        } = await ctx.runQuery(internal.adminHubData.scan, {
          ...args,
          table,
          cursor,
          asOf,
        });
        mergeCounts(counts, page.counts);
        pages++;
        observationStart = page.observationStart;
        if (page.isDone) break;
        cursor = page.cursor;
      }
    }
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    return { counts, asOf, finishedAt: Date.now(), pages, observationStart };
  },
});
