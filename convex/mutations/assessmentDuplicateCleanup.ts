import { mutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { requireSuperadminSession } from "../lib/sessionAuth";

const CONFIRMATION = "DELETE_DUPLICATE_ASSESSMENTS";
const SCAN_CAP = 10_000;
const modeValidator = v.union(v.literal("dry_run"), v.literal("confirmed"));

type AttemptId = Id<"assessmentAttempts">;
type AttemptEvidence = {
  attempt: Doc<"assessmentAttempts">;
  responses: Doc<"assessmentResponses">[];
  events: Doc<"assessmentEvents">[];
  prospects: Doc<"assessmentProspects">[];
  tokens: Doc<"assessmentReportTokens">[];
};

const sortedIds = (ids: AttemptId[]) => ids.map(String).sort();
const sameIdSets = (left: AttemptId[], right: AttemptId[]) => {
  const a = sortedIds(left);
  const b = sortedIds(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
};

function funnel(attempts: Doc<"assessmentAttempts">[]) {
  const active = attempts.filter((attempt) => attempt.status !== "deleted");
  return {
    starts: active.length,
    completed: active.filter((attempt) => attempt.status === "completed").length,
    inProgress: active.filter((attempt) => attempt.status === "in_progress").length,
    abandoned: active.filter((attempt) => attempt.status === "abandoned").length,
  };
}

function rateLimitKeys(attempt: Doc<"assessmentAttempts">, includeCapability: boolean) {
  const id = String(attempt._id);
  const keys = [
    `assessment:response-write:${id}`,
    `assessment:completion:${id}`,
    `assessment:report:${id}`,
    `assessment:roadmap:${id}`,
  ];
  if (includeCapability) keys.push(`assessment:delivery:${attempt.capabilityHash}`);
  return keys;
}

async function authenticateWithoutSessionTouch(ctx: any, sessionToken: string, userId: Id<"users">) {
  // A dry run promises zero writes. The existing session helper only touches a
  // session when the context exposes db.patch, so hide that capability while
  // retaining the exact same verification and founder allowlist checks.
  const readOnlyDb = new Proxy(ctx.db, {
    has(target, property) {
      if (property === "patch") return false;
      return property in target;
    },
  });
  await requireSuperadminSession({ ...ctx, db: readOnlyDb } as any, sessionToken, userId);
}

async function collectEvidence(ctx: any) {
  const attempts: Doc<"assessmentAttempts">[] = await ctx.db.query("assessmentAttempts").take(SCAN_CAP);
  const evidence: AttemptEvidence[] = [];
  let childScanCapped = false;
  for (const attempt of attempts) {
    const [responses, events, prospects, tokens] = await Promise.all([
      ctx.db.query("assessmentResponses").withIndex("by_attemptId", (q: any) => q.eq("attemptId", attempt._id)).take(SCAN_CAP),
      ctx.db.query("assessmentEvents").withIndex("by_attemptId", (q: any) => q.eq("attemptId", attempt._id)).take(SCAN_CAP),
      ctx.db.query("assessmentProspects").withIndex("by_attemptId", (q: any) => q.eq("attemptId", attempt._id)).take(SCAN_CAP),
      ctx.db.query("assessmentReportTokens").withIndex("by_attemptId", (q: any) => q.eq("attemptId", attempt._id)).take(SCAN_CAP),
    ]);
    if ([responses, events, prospects, tokens].some((rows) => rows.length >= SCAN_CAP)) childScanCapped = true;
    evidence.push({ attempt, responses, events, prospects, tokens });
  }
  return { attempts, evidence, scanCapped: attempts.length >= SCAN_CAP || childScanCapped };
}

async function classify(ctx: any, reviewedSurvivor?: AttemptId) {
  const { attempts, evidence, scanCapped } = await collectEvidence(ctx);
  const browserGroupSizes = new Map<string, number>();
  const capabilityGroupSizes = new Map<string, number>();
  for (const attempt of attempts) {
    browserGroupSizes.set(attempt.browserKeyHash, (browserGroupSizes.get(attempt.browserKeyHash) ?? 0) + 1);
    capabilityGroupSizes.set(attempt.capabilityHash, (capabilityGroupSizes.get(attempt.capabilityHash) ?? 0) + 1);
  }

  const evaluated = evidence.map(({ attempt, responses, events, prospects, tokens }) => {
    const distinctResponseCount = new Set(responses.map((row) => row.questionKey)).size;
    const responseModified = responses.some((row) => row.updatedAt > row.answeredAt);
    const progressEventCount = events.filter((event) => event.eventKey === "assessment_progress").length;
    const resumeEventCount = events.filter((event) => event.eventKey === "assessment_resumed").length;
    const nonBaselineEventCount = events.filter((event) => !["assessment_started", "assessment_progress", "assessment_resumed"].includes(event.eventKey)).length;
    const hasResultVersionEvidence = Boolean(attempt.scoringVersion || attempt.reportContentVersion || attempt.confidenceResult);
    const protectedReasons = [
      attempt.status === "completed" ? "completed_status" : null,
      attempt.completedAt ? "completion_timestamp" : null,
      attempt.completionSnapshot ? "completion_snapshot" : null,
      attempt.reportSnapshot ? "report_snapshot" : null,
      attempt.roadmapSnapshot ? "roadmap_snapshot" : null,
      prospects.length ? "contact_capture" : null,
      tokens.length ? "report_token" : null,
      hasResultVersionEvidence ? "result_version_evidence" : null,
    ].filter((reason): reason is string => Boolean(reason));
    const protectedEvidence = protectedReasons.length > 0;
    const meaningful = protectedEvidence || distinctResponseCount > 1 || responseModified || progressEventCount > 0 || resumeEventCount > 0 || (attempt.status === "in_progress" && attempt.lastActivityAt > attempt.startedAt);
    return {
      attempt,
      responses,
      events,
      prospects,
      tokens,
      distinctResponseCount,
      responseModified,
      progressEventCount,
      resumeEventCount,
      nonBaselineEventCount,
      protectedReasons,
      protectedEvidence,
      meaningful,
    };
  });

  const meaningfulInProgress = evaluated.filter((row) => row.attempt.status === "in_progress" && row.meaningful && !row.protectedEvidence);
  const reviewed = reviewedSurvivor ? meaningfulInProgress.find((row) => row.attempt._id === reviewedSurvivor) : undefined;
  const automaticSurvivor = !reviewedSurvivor && meaningfulInProgress.length === 1 ? meaningfulInProgress[0] : undefined;
  const survivor = reviewed ?? automaticSurvivor;
  const blockingReasons: string[] = [];
  if (scanCapped) blockingReasons.push("Assessment cleanup scan reached its safety cap");
  if (reviewedSurvivor && !reviewed) blockingReasons.push("Reviewed survivor is missing, protected, or not a meaningful in-progress candidate");
  if (!reviewedSurvivor && meaningfulInProgress.length > 1) blockingReasons.push("Multiple meaningful in-progress candidates require a reviewed survivor");
  if (!reviewedSurvivor && meaningfulInProgress.length === 0) blockingReasons.push("No legitimate meaningful in-progress assessment could be identified");
  for (const row of evaluated) {
    if (row.attempt.status === "abandoned" && row.meaningful) {
      blockingReasons.push(`Meaningful abandoned assessment requires manual review: ${row.attempt._id}`);
    }
  }

  const proposed = evaluated.filter((row) => {
    if (row.protectedEvidence || row.attempt._id === survivor?.attempt._id) return false;
    if (row.attempt.status === "abandoned") return !row.meaningful && row.distinctResponseCount <= 1 && row.nonBaselineEventCount === 0;
    if (row.attempt.status !== "in_progress") return false;
    if (reviewedSurvivor && row.meaningful) return true;
    return !row.meaningful && row.distinctResponseCount <= 1 && row.nonBaselineEventCount === 0;
  });
  if (proposed.some((row) => row.protectedEvidence)) blockingReasons.push("A proposed deletion contains protected evidence");

  const proposedIds = proposed.map((row) => row.attempt._id);
  const proposedSet = new Set(proposedIds.map(String));
  const capabilityFullyDeleted = (hash: string) => evaluated
    .filter((row) => row.attempt.capabilityHash === hash)
    .every((row) => proposedSet.has(String(row.attempt._id)));
  const rateLimitsByAttempt = new Map<string, Doc<"rateLimits">[]>();
  for (const row of evaluated) {
    const records: Doc<"rateLimits">[] = [];
    for (const key of rateLimitKeys(row.attempt, capabilityFullyDeleted(row.attempt.capabilityHash))) {
      records.push(...await ctx.db.query("rateLimits").withIndex("by_key", (q: any) => q.eq("key", key)).collect());
    }
    rateLimitsByAttempt.set(String(row.attempt._id), records);
  }

  const rows = evaluated.map((row) => {
    const isProposed = proposedSet.has(String(row.attempt._id));
    const isSurvivor = row.attempt._id === survivor?.attempt._id;
    let classification = "preserve_other";
    let reason = "Status is outside the one-time cleanup scope";
    if (row.protectedEvidence) {
      classification = "preserve_protected";
      reason = `Protected evidence: ${row.protectedReasons.join(", ")}`;
    } else if (isSurvivor) {
      classification = "preserve_legitimate_in_progress";
      reason = reviewedSurvivor ? "Explicitly reviewed meaningful in-progress survivor" : "Only meaningful in-progress survivor";
    } else if (isProposed) {
      classification = "delete_duplicate";
      reason = row.meaningful ? "Explicit survivor selection identifies this historical in-progress record as duplicate" : row.attempt.status === "abandoned" ? "Baseline-only abandoned duplicate" : "Baseline-only in-progress duplicate";
    } else if (row.meaningful) {
      classification = "preserve_meaningful";
      reason = "Meaningful progress requires preservation or manual review";
    }
    return {
      attemptId: row.attempt._id,
      status: row.attempt.status,
      creationTime: row.attempt._creationTime,
      startedAt: row.attempt.startedAt,
      lastActivityAt: row.attempt.lastActivityAt,
      distinctResponseCount: row.distinctResponseCount,
      storedProgress: {
        requiredAnsweredCount: row.attempt.requiredAnsweredCount ?? null,
        requiredApplicableCount: row.attempt.requiredApplicableCount ?? null,
        optionalAnsweredCount: row.attempt.optionalAnsweredCount ?? null,
      },
      responseModified: row.responseModified,
      progressEventCount: row.progressEventCount,
      resumeEventCount: row.resumeEventCount,
      hasProspect: row.prospects.length > 0,
      hasEmail: row.prospects.some((prospect) => Boolean(prospect.normalizedEmail)),
      hasCompletionSnapshot: Boolean(row.attempt.completionSnapshot),
      hasReportSnapshot: Boolean(row.attempt.reportSnapshot),
      hasRoadmapSnapshot: Boolean(row.attempt.roadmapSnapshot),
      hasReportToken: row.tokens.length > 0,
      browserGroupSize: browserGroupSizes.get(row.attempt.browserKeyHash) ?? 1,
      capabilityGroupSize: capabilityGroupSizes.get(row.attempt.capabilityHash) ?? 1,
      dependents: {
        responses: row.responses.length,
        events: row.events.length,
        prospects: row.prospects.length,
        reportTokens: row.tokens.length,
        rateLimits: rateLimitsByAttempt.get(String(row.attempt._id))?.length ?? 0,
      },
      classification,
      reason,
    };
  });
  const projectedAttempts = attempts.filter((attempt) => !proposedSet.has(String(attempt._id)));
  const projectedRateLimitIds = new Set(proposed.flatMap((row) =>
    (rateLimitsByAttempt.get(String(row.attempt._id)) ?? []).map((rateLimit) => String(rateLimit._id))
  ));
  const projectedDeletionCounts = proposed.reduce((counts, row) => ({
    assessmentAttempts: counts.assessmentAttempts + 1,
    assessmentResponses: counts.assessmentResponses + row.responses.length,
    assessmentEvents: counts.assessmentEvents + row.events.length,
    assessmentProspects: counts.assessmentProspects + row.prospects.length,
    assessmentReportTokens: counts.assessmentReportTokens + row.tokens.length,
    rateLimits: projectedRateLimitIds.size,
  }), { assessmentAttempts: 0, assessmentResponses: 0, assessmentEvents: 0, assessmentProspects: 0, assessmentReportTokens: 0, rateLimits: 0 });

  return {
    attempts,
    evaluated,
    rateLimitsByAttempt,
    report: {
      totalAssessmentRecords: attempts.length,
      blocked: blockingReasons.length > 0,
      blockingReasons,
      meaningfulInProgressCandidateIds: meaningfulInProgress.map((row) => row.attempt._id),
      remainingMeaningfulInProgressAttemptId: survivor?.attempt._id ?? null,
      preservedIds: evaluated.filter((row) => !proposedSet.has(String(row.attempt._id))).map((row) => row.attempt._id),
      proposedDeletionIds: proposedIds,
      currentFunnel: funnel(attempts),
      projectedFunnel: funnel(projectedAttempts),
      projectedDeletionCounts,
      attempts: rows,
    },
  };
}

/** Temporary one-time endpoint. Remove after the reviewed production cleanup succeeds. */
export const cleanup = mutation({
  args: {
    mode: modeValidator,
    userId: v.id("users"),
    sessionToken: v.string(),
    preserveInProgressAttemptId: v.optional(v.id("assessmentAttempts")),
    confirm: v.optional(v.string()),
    approvedAttemptIds: v.optional(v.array(v.id("assessmentAttempts"))),
  },
  handler: async (ctx, args) => {
    await authenticateWithoutSessionTouch(ctx, args.sessionToken, args.userId);
    const classification = await classify(ctx, args.preserveInProgressAttemptId);
    if (args.mode === "dry_run") return { mode: "dry_run" as const, ...classification.report };

    if (args.confirm !== CONFIRMATION) throw new Error("Exact cleanup confirmation is required");
    if (classification.report.blocked) throw new Error(`Assessment cleanup is blocked: ${classification.report.blockingReasons.join("; ")}`);
    if (!args.approvedAttemptIds || !sameIdSets(args.approvedAttemptIds, classification.report.proposedDeletionIds)) {
      throw new Error("Approved attempt IDs do not exactly match the current cleanup candidate set");
    }
    const approvedSet = new Set(args.approvedAttemptIds.map(String));
    for (const row of classification.evaluated) {
      if (!approvedSet.has(String(row.attempt._id))) continue;
      if (row.protectedEvidence || row.attempt.status === "completed" || row.attempt.completedAt) {
        throw new Error(`Protected assessment cannot be deleted: ${row.attempt._id}`);
      }
    }

    const deletedCounts = { assessmentAttempts: 0, assessmentResponses: 0, assessmentEvents: 0, assessmentProspects: 0, assessmentReportTokens: 0, rateLimits: 0 };
    const deletedRateLimitIds = new Set<string>();
    for (const row of classification.evaluated) {
      if (!approvedSet.has(String(row.attempt._id))) continue;
      for (const token of row.tokens) { await ctx.db.delete(token._id); deletedCounts.assessmentReportTokens++; }
      for (const prospect of row.prospects) { await ctx.db.delete(prospect._id); deletedCounts.assessmentProspects++; }
      for (const response of row.responses) { await ctx.db.delete(response._id); deletedCounts.assessmentResponses++; }
      for (const event of row.events) { await ctx.db.delete(event._id); deletedCounts.assessmentEvents++; }
      for (const rateLimit of classification.rateLimitsByAttempt.get(String(row.attempt._id)) ?? []) {
        if (deletedRateLimitIds.has(String(rateLimit._id))) continue;
        await ctx.db.delete(rateLimit._id);
        deletedRateLimitIds.add(String(rateLimit._id));
        deletedCounts.rateLimits++;
      }
      await ctx.db.delete(row.attempt._id);
      deletedCounts.assessmentAttempts++;
    }

    const remaining = classification.attempts.filter((attempt) => !approvedSet.has(String(attempt._id)));
    return {
      mode: "confirmed" as const,
      deletedAttemptIds: args.approvedAttemptIds,
      preservedAttemptIds: remaining.map((attempt) => attempt._id),
      deletedCounts,
      finalFunnel: funnel(remaining),
      remainingMeaningfulInProgressAttemptId: classification.report.remainingMeaningfulInProgressAttemptId,
      protectedRecordsDeleted: false,
    };
  },
});
