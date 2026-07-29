import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireSuperadminSession } from "../lib/sessionAuth";
import { aggregateAssessmentAnalytics } from "../lib/assessmentAnalytics";

const SCAN_CAP = 10_000;
const RECENT_LIMIT = 100;

type Localized = { en: string; es: string };
type Area = { sectionKey: string; title: Localized };

function areaFromReport(payload: any, kind: "strongest" | "priority"): Area | undefined {
  const diagnosisArea = kind === "strongest"
    ? payload?.executiveDiagnosis?.strongestArea
    : payload?.executiveDiagnosis?.priorityArea;
  if (diagnosisArea?.sectionKey && diagnosisArea?.title) {
    return { sectionKey: diagnosisArea.sectionKey, title: diagnosisArea.title };
  }
  const scorecard = Array.isArray(payload?.scorecard) ? payload.scorecard : [];
  const sorted = [...scorecard].sort((a, b) =>
    kind === "strongest"
      ? (b.score ?? 0) - (a.score ?? 0) || String(a.sectionKey).localeCompare(String(b.sectionKey))
      : (a.score ?? 0) - (b.score ?? 0) || String(a.sectionKey).localeCompare(String(b.sectionKey))
  );
  const area = sorted[0];
  return area?.sectionKey && area?.title
    ? { sectionKey: area.sectionKey, title: area.title }
    : undefined;
}

function nowPriorities(payload: any): Area[] {
  const items = Array.isArray(payload?.stages?.now) ? payload.stages.now : [];
  return items
    .filter((item: any) => item?.sectionKey && item?.title)
    .slice(0, 2)
    .map((item: any) => ({ sectionKey: item.sectionKey, title: item.title }));
}

function prospectSummary(prospect?: Doc<"assessmentProspects">) {
  if (!prospect) return null;
  return {
    firstName: prospect.firstName,
    businessName: prospect.businessName,
    email: prospect.normalizedEmail,
    preferredLanguage: prospect.preferredLanguage,
    marketingConsent: prospect.marketingConsent,
    scrubInterest: prospect.scrubInterest,
    deliveryStatus: prospect.deliveryStatus,
  };
}

function resultSummary(attempt: Doc<"assessmentAttempts">, prospect?: Doc<"assessmentProspects">) {
  const completion = attempt.completionSnapshot!;
  const report = attempt.reportSnapshot?.payload;
  const roadmap = attempt.roadmapSnapshot?.payload;
  return {
    attemptId: attempt._id,
    completedAt: completion.completedAt,
    language: attempt.responseLanguage,
    branchType: completion.branchContext.soloOperator ? "solo" as const : "team" as const,
    teamSize: completion.branchContext.teamSize,
    operationsScore: completion.operationsScore,
    maturityKey: completion.maturityKey,
    confidenceKey: completion.confidenceKey,
    strongestArea: areaFromReport(report, "strongest"),
    priorityArea: areaFromReport(report, "priority"),
    nowPriorities: nowPriorities(roadmap),
    contact: prospectSummary(prospect),
  };
}

function topAreas(values: Array<Area | undefined>) {
  const counts = new Map<string, { area: Area; count: number }>();
  for (const area of values) {
    if (!area) continue;
    const existing = counts.get(area.sectionKey);
    counts.set(area.sectionKey, { area, count: (existing?.count ?? 0) + 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.area.sectionKey.localeCompare(b.area.sectionKey))
    .slice(0, 5)
    .map(({ area, count }) => ({ ...area, count }));
}

async function prospectMap(ctx: any) {
  const prospects = await ctx.db.query("assessmentProspects").take(SCAN_CAP);
  return new Map<string, Doc<"assessmentProspects">>(
    prospects.map((prospect: Doc<"assessmentProspects">) => [String(prospect.attemptId), prospect])
  );
}

export const getAssessmentResults = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);

    const [allAttempts, recentCompleted, allEvents, prospectsByAttempt] = await Promise.all([
      ctx.db.query("assessmentAttempts").take(SCAN_CAP),
      ctx.db
        .query("assessmentAttempts")
        .withIndex("by_status_lastActivityAt", (q) => q.eq("status", "completed"))
        .order("desc")
        .take(RECENT_LIMIT),
      ctx.db.query("assessmentEvents").take(SCAN_CAP),
      prospectMap(ctx),
    ]);

    const activeAttempts = allAttempts.filter((attempt) => !attempt.deletedAt && !attempt.anonymizedAt);
    const completed = activeAttempts.filter((attempt) => attempt.status === "completed" && attempt.completionSnapshot);
    const completedScores = completed.map((attempt) => attempt.completionSnapshot!.operationsScore);
    const captured = completed.filter((attempt) => prospectsByAttempt.has(String(attempt._id)));
    const interested = captured.filter((attempt) => prospectsByAttempt.get(String(attempt._id))?.scrubInterest === "interested");
    const highConfidence = completed.filter((attempt) => attempt.completionSnapshot!.confidenceKey === "high");

    const completedSummaries = completed.map((attempt) =>
      resultSummary(attempt, prospectsByAttempt.get(String(attempt._id)))
    );
    const recent = recentCompleted
      .filter((attempt) => !attempt.deletedAt && !attempt.anonymizedAt && attempt.completionSnapshot)
      .map((attempt) => resultSummary(attempt, prospectsByAttempt.get(String(attempt._id))));

    return {
      generatedAt: Date.now(),
      scanCapped: allAttempts.length >= SCAN_CAP || allEvents.length >= SCAN_CAP,
      analytics: aggregateAssessmentAnalytics(activeAttempts, allEvents),
      stats: {
        starts: activeAttempts.length,
        completions: completed.length,
        completionRate: activeAttempts.length ? Math.round(completed.length * 1000 / activeAttempts.length) / 10 : 0,
        averageScore: completedScores.length ? Math.round(completedScores.reduce((sum, score) => sum + score, 0) * 10 / completedScores.length) / 10 : null,
        highConfidenceRate: completed.length ? Math.round(highConfidence.length * 1000 / completed.length) / 10 : 0,
        contactCaptures: captured.length,
        contactCaptureRate: completed.length ? Math.round(captured.length * 1000 / completed.length) / 10 : 0,
        scrubInterest: interested.length,
        soloCompletions: completed.filter((attempt) => attempt.completionSnapshot!.branchContext.soloOperator).length,
        teamCompletions: completed.filter((attempt) => !attempt.completionSnapshot!.branchContext.soloOperator).length,
        englishCompletions: completed.filter((attempt) => attempt.responseLanguage === "en").length,
        spanishCompletions: completed.filter((attempt) => attempt.responseLanguage === "es").length,
      },
      commonPriorityAreas: topAreas(completedSummaries.map((result) => result.priorityArea)),
      commonStrongestAreas: topAreas(completedSummaries.map((result) => result.strongestArea)),
      recent,
    };
  },
});

export const getAssessmentResultDetail = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    attemptId: v.id("assessmentAttempts"),
  },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const attempt = await ctx.db.get(args.attemptId);
    if (
      !attempt ||
      attempt.status !== "completed" ||
      attempt.deletedAt ||
      attempt.anonymizedAt ||
      !attempt.completionSnapshot ||
      !attempt.reportSnapshot ||
      !attempt.roadmapSnapshot
    ) {
      return null;
    }
    const prospect = await ctx.db
      .query("assessmentProspects")
      .withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id))
      .unique();
    return {
      summary: resultSummary(attempt, prospect ?? undefined),
      report: attempt.reportSnapshot.payload,
      roadmap: attempt.roadmapSnapshot.payload,
    };
  },
});
