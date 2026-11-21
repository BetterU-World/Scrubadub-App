"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireSuperadminSession } from "./lib/sessions";
import {
  companyRanking,
  mergeCounts,
  metricCounts,
  type Counts,
} from "./lib/adminHubModel";

type RankedCompany = { id: Id<"companies">; name: string; count: number };
type ScanPage = {
  counts: Counts;
  companies: { id: Id<"companies">; name: string }[];
  isDone: boolean;
  cursor: string;
  observationStart: number | null;
};
// Code-point order is independent of server locale. IDs break equal-name ties.
function compareRank(a: RankedCompany, b: RankedCompany) {
  return (
    b.count - a.count ||
    (a.name < b.name
      ? -1
      : a.name > b.name
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0)
  );
}

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
    topCompanies: v.array(companyRanking),
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
    topCompanies: RankedCompany[];
    asOf: number;
    finishedAt: number;
    pages: number;
    observationStart: number | null;
  }> => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const asOf = Date.now(),
      counts: Counts = {};
    const topCompanies: RankedCompany[] = [];
    let pages = 0,
      observationStart: number | null = null;
    async function readPage(
      table:
        | "companies"
        | "users"
        | "workerProfiles"
        | "clientUsers"
        | "clientRelationships"
        | "jobs",
      cursor: string | null,
      companyId = args.companyId,
    ): Promise<{
      counts: Counts;
      companies: { id: Id<"companies">; name: string }[];
      isDone: boolean;
      cursor: string;
      observationStart: number | null;
    }> {
      if (Date.now() - asOf > 8 * 60_000)
        throw new Error(
          "Report exceeded its read budget. No partial totals were returned; narrow to one company.",
        );
      const result: ScanPage = await ctx.runQuery(internal.adminHubData.scan, {
        ...args,
        companyId,
        table,
        cursor,
        asOf,
      });
      pages++;
      return result;
    }
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
        const page = await readPage(table, cursor);
        mergeCounts(counts, page.counts);
        // Complete each indexed company job scan before comparing its total.
        // Memory stays bounded to one source page and ten ranked companies.
        if (table === "companies" && !args.companyId) {
          for (const company of page.companies) {
            let jobCursor: string | null = null,
              count = 0;
            while (true) {
              const jobs = await readPage("jobs", jobCursor, company.id);
              count += jobs.counts.canonicalJobs ?? 0;
              if (jobs.isDone) break;
              jobCursor = jobs.cursor;
            }
            if (count > 0) {
              topCompanies.push({ ...company, count });
              topCompanies.sort(compareRank);
              if (topCompanies.length > 10) topCompanies.pop();
            }
          }
        }
        observationStart = page.observationStart;
        if (page.isDone) break;
        cursor = page.cursor;
      }
    }
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    return {
      counts,
      topCompanies,
      asOf,
      finishedAt: Date.now(),
      pages,
      observationStart,
    };
  },
});
