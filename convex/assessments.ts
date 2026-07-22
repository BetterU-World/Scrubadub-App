import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { checkRateLimit } from "./lib/rateLimit";
import { hashTokenForLookup } from "./lib/tokenHash";
import {
  ASSESSMENT_KEY,
  INITIAL_ASSESSMENT_DEFINITION,
  QUALITATIVE_MAX_LENGTH,
  UNFINISHED_ATTEMPT_TTL_MS,
  isApplicable,
  sanitizeQualitativeText,
  type AnswerMap,
  type AssessmentQuestion,
} from "./lib/assessmentDefinition";
import { scoreAssessment } from "./lib/assessmentScoring";
import { REPORT_VERSION, generateReportSnapshot } from "./lib/assessmentReport";
import { ROADMAP_VERSION, generateRoadmapSnapshot } from "./lib/assessmentRoadmap";
import { ASSESSMENT_LIMITS, sameNormalizedResponse } from "./lib/assessmentRateLimits";

const languageValidator = v.union(v.literal("en"), v.literal("es"));
const responseInputValidator = v.object({
  questionKey: v.string(),
  answerValue: v.optional(v.string()),
  answerValues: v.optional(v.array(v.string())),
  qualitativeText: v.optional(v.string()),
});

function requireSafeToken(token: string, label: string) {
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error(`Invalid ${label}`);
}

async function ensureDefinition(ctx: any): Promise<Doc<"assessmentDefinitions">> {
  const existing = await ctx.db
    .query("assessmentDefinitions")
    .withIndex("by_key_version", (q: any) =>
      q.eq("key", ASSESSMENT_KEY).eq("definitionVersion", INITIAL_ASSESSMENT_DEFINITION.definitionVersion)
    )
    .unique();
  if (existing) return existing;
  const now = Date.now();
  const manifest = JSON.parse(JSON.stringify(INITIAL_ASSESSMENT_DEFINITION));
  const id = await ctx.db.insert("assessmentDefinitions", {
    ...manifest,
    createdAt: now,
    createdBy: "system:initial-definition",
    publishedAt: now,
  });
  return (await ctx.db.get(id))!;
}

function questionFor(definition: Doc<"assessmentDefinitions">, key: string): AssessmentQuestion {
  const question = definition.questions.find((candidate) => candidate.key === key);
  if (!question) throw new Error("Question is not part of this assessment definition");
  return question as AssessmentQuestion;
}

function normalizeResponse(question: AssessmentQuestion, input: {
  answerValue?: string;
  answerValues?: string[];
  qualitativeText?: string;
}) {
  if (question.kind === "text") {
    if (input.answerValue !== undefined || input.answerValues !== undefined) throw new Error("Invalid qualitative response");
    const raw = input.qualitativeText ?? "";
    if (raw.length > (question.maxLength ?? QUALITATIVE_MAX_LENGTH)) throw new Error("Response is too long");
    const qualitativeText = sanitizeQualitativeText(raw, question.maxLength);
    return { responseKind: "qualitative" as const, qualitativeText: qualitativeText || undefined };
  }
  const allowed = new Set((question.options ?? []).map((item) => item.value));
  if (question.kind === "single") {
    if (!input.answerValue || input.answerValues !== undefined || input.qualitativeText !== undefined || !allowed.has(input.answerValue)) {
      throw new Error("Invalid answer option");
    }
    return { responseKind: "single" as const, answerValue: input.answerValue };
  }
  const values = [...new Set(input.answerValues ?? [])];
  if (!values.length || input.answerValue !== undefined || input.qualitativeText !== undefined || values.some((value) => !allowed.has(value))) {
    throw new Error("Invalid answer options");
  }
  if (question.maxSelections && values.length > question.maxSelections) throw new Error("Too many answer options");
  return { responseKind: "multi" as const, answerValues: values };
}

async function requireAttempt(ctx: any, attemptId: Id<"assessmentAttempts">, capability: string) {
  requireSafeToken(capability, "assessment capability");
  const attempt = await ctx.db.get(attemptId);
  if (!attempt || attempt.capabilityHash !== await hashTokenForLookup(capability) || attempt.status === "deleted") {
    throw new Error("Assessment is unavailable");
  }
  if (attempt.status === "in_progress" && attempt.expiresAt <= Date.now()) throw new Error("Assessment has expired");
  return attempt as Doc<"assessmentAttempts">;
}

async function answerMap(ctx: any, attemptId: Id<"assessmentAttempts">): Promise<AnswerMap> {
  const rows = await ctx.db.query("assessmentResponses").withIndex("by_attemptId", (q: any) => q.eq("attemptId", attemptId)).collect();
  return Object.fromEntries(rows.flatMap((row: Doc<"assessmentResponses">) => {
    if (row.responseKind === "single" && row.answerValue) return [[row.questionKey, row.answerValue]];
    if (row.responseKind === "multi" && row.answerValues) return [[row.questionKey, row.answerValues]];
    if (row.responseKind === "qualitative" && row.qualitativeText) return [[row.questionKey, row.qualitativeText]];
    return [];
  }));
}

async function cleanupAndCounts(ctx: any, attempt: Doc<"assessmentAttempts">, definition: Doc<"assessmentDefinitions">) {
  const rows = await ctx.db.query("assessmentResponses").withIndex("by_attemptId", (q: any) => q.eq("attemptId", attempt._id)).collect();
  const answers = await answerMap(ctx, attempt._id);
  const applicableKeys = new Set(definition.questions.filter((question) => isApplicable(question as AssessmentQuestion, answers)).map((question) => question.key));
  for (const row of rows) {
    if (!applicableKeys.has(row.questionKey)) {
      await ctx.db.delete(row._id);
      delete answers[row.questionKey];
    }
  }
  const applicable = definition.questions.filter((question) => isApplicable(question as AssessmentQuestion, answers));
  const answered = new Set(Object.keys(answers));
  return {
    requiredApplicableCount: applicable.filter((question) => question.required).length,
    requiredAnsweredCount: applicable.filter((question) => question.required && answered.has(question.key)).length,
    optionalAnsweredCount: applicable.filter((question) => !question.required && answered.has(question.key)).length,
  };
}

async function recordMilestone(ctx: any, attempt: Doc<"assessmentAttempts">, eventKey: string, metadata: any = {}) {
  const deduplicationKey = `${attempt._id}:${eventKey}`;
  const existing = await ctx.db.query("assessmentEvents").withIndex("by_deduplicationKey", (q: any) => q.eq("deduplicationKey", deduplicationKey)).unique();
  if (!existing) await ctx.db.insert("assessmentEvents", { attemptId: attempt._id, eventKey, deduplicationKey, language: attempt.responseLanguage, metadata, createdAt: Date.now() });
}

export const prepare = mutation({
  args: {},
  handler: async (ctx) => ensureDefinition(ctx),
});

export const getPublishedDefinition = query({
  args: {},
  handler: async (ctx) => ctx.db
    .query("assessmentDefinitions")
    .withIndex("by_key_status", (q) => q.eq("key", ASSESSMENT_KEY).eq("status", "published"))
    .first(),
});

export const start = mutation({
  args: {
    capability: v.string(),
    browserKey: v.string(),
    responseLanguage: languageValidator,
    priorResponses: v.optional(v.array(responseInputValidator)),
    firstResponse: responseInputValidator,
  },
  handler: async (ctx, args) => {
    requireSafeToken(args.capability, "assessment capability");
    requireSafeToken(args.browserKey, "browser key");
    const definition = await ensureDefinition(ctx);
    const answers: AnswerMap = {};
    const normalizedResponses: Array<{ question: AssessmentQuestion; normalized: ReturnType<typeof normalizeResponse> }> = [];
    const seen = new Set<string>();
    for (const input of [...(args.priorResponses ?? []), args.firstResponse]) {
      if (seen.has(input.questionKey)) throw new Error("Duplicate initial response");
      seen.add(input.questionKey);
      const question = questionFor(definition, input.questionKey);
      if (!isApplicable(question, answers)) throw new Error("Question is not applicable");
      const normalized = normalizeResponse(question, input);
      normalizedResponses.push({ question, normalized });
      if (normalized.answerValue) answers[question.key] = normalized.answerValue;
      else if (normalized.answerValues?.length) answers[question.key] = normalized.answerValues;
      else if (normalized.qualitativeText) answers[question.key] = normalized.qualitativeText;
    }
    if (!normalizedResponses.some(({ question, normalized }) => !question.qualitative && (normalized.answerValue || normalized.answerValues?.length))) throw new Error("A substantive first answer is required");
    const browserKeyHash = await hashTokenForLookup(args.browserKey);
    const capabilityHash = await hashTokenForLookup(args.capability);
    const duplicate = await ctx.db.query("assessmentAttempts").withIndex("by_capabilityHash", (q) => q.eq("capabilityHash", capabilityHash)).unique();
    if (duplicate) return { attemptId: duplicate._id };
    await checkRateLimit(ctx, { key: `assessment:creation:${browserKeyHash}`, ...ASSESSMENT_LIMITS.creation });
    const now = Date.now();
    const attemptId = await ctx.db.insert("assessmentAttempts", {
      definitionId: definition._id,
      definitionVersion: definition.definitionVersion,
      benchmarkCompatibilityKey: definition.benchmarkCompatibilityKey,
      status: "in_progress",
      audience: "public",
      responseLanguage: args.responseLanguage,
      capabilityHash,
      browserKeyHash,
      startedAt: now,
      lastActivityAt: now,
      expiresAt: now + UNFINISHED_ATTEMPT_TTL_MS,
      requiredApplicableCount: 0,
      requiredAnsweredCount: normalizedResponses.filter(({ question }) => question.required).length,
      optionalAnsweredCount: 0,
    });
    for (const { question, normalized } of normalizedResponses) if (normalized.answerValue || normalized.answerValues?.length || normalized.qualitativeText) await ctx.db.insert("assessmentResponses", { attemptId, questionKey: question.key, sectionKey: question.sectionKey, categoryKey: question.categoryKey, ...normalized, answeredAt: now, updatedAt: now });
    const counts = await cleanupAndCounts(ctx, (await ctx.db.get(attemptId))!, definition);
    await ctx.db.patch(attemptId, counts);
    await recordMilestone(ctx, (await ctx.db.get(attemptId))!, "assessment_started", { definitionVersion: definition.definitionVersion, branchType: answers["business.team_size"] === "solo" ? "solo" : answers["business.team_size"] ? "team" : undefined });
    return { attemptId };
  },
});

export const load = query({
  args: { attemptId: v.id("assessmentAttempts"), capability: v.string() },
  handler: async (ctx, args) => {
    const attempt = await requireAttempt(ctx, args.attemptId, args.capability);
    const definition = await ctx.db.get(attempt.definitionId);
    if (!definition) throw new Error("Assessment definition is unavailable");
    const responses = await ctx.db.query("assessmentResponses").withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id)).collect();
    return { attempt, definition, responses };
  },
});

export const recover = mutation({
  args: { attemptId: v.id("assessmentAttempts"), capability: v.string() },
  handler: async (ctx, args) => {
    try {
      const attempt = await requireAttempt(ctx, args.attemptId, args.capability);
      if (attempt.status !== "in_progress" && attempt.status !== "completed") return null;
      const definition = await ctx.db.get(attempt.definitionId);
      if (!definition) return null;
      if (attempt.status === "in_progress" && !definition.scoringVersion) return null;
      const responses = await ctx.db.query("assessmentResponses").withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id)).collect();
      return { attempt, definition, responses };
    } catch {
      return null;
    }
  },
});

export const saveResponse = mutation({
  args: { attemptId: v.id("assessmentAttempts"), capability: v.string(), responseLanguage: languageValidator, response: responseInputValidator },
  handler: async (ctx, args) => {
    const attempt = await requireAttempt(ctx, args.attemptId, args.capability);
    if (attempt.status !== "in_progress") throw new Error("Completed assessments cannot be changed");
    const definition = await ctx.db.get(attempt.definitionId);
    if (!definition || definition.definitionVersion !== attempt.definitionVersion) throw new Error("Assessment definition is unavailable");
    const question = questionFor(definition, args.response.questionKey);
    const currentAnswers = await answerMap(ctx, attempt._id);
    if (!isApplicable(question, currentAnswers)) throw new Error("Question is not applicable");
    const normalized = normalizeResponse(question, args.response);
    const existing = await ctx.db.query("assessmentResponses").withIndex("by_attemptId_questionKey", (q) => q.eq("attemptId", attempt._id).eq("questionKey", question.key)).unique();
    if (sameNormalizedResponse(existing, normalized)) return cleanupAndCounts(ctx, attempt, definition);
    await checkRateLimit(ctx, { key: `assessment:response-write:${attempt._id}`, ...ASSESSMENT_LIMITS.responseWrite });
    const now = Date.now();
    if (question.kind === "text" && !normalized.qualitativeText) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      await ctx.db.replace(existing._id, { attemptId: attempt._id, questionKey: question.key, sectionKey: question.sectionKey, categoryKey: question.categoryKey, ...normalized, answeredAt: existing.answeredAt, updatedAt: now });
    } else {
      await ctx.db.insert("assessmentResponses", { attemptId: attempt._id, questionKey: question.key, sectionKey: question.sectionKey, categoryKey: question.categoryKey, ...normalized, answeredAt: now, updatedAt: now });
    }
    const counts = await cleanupAndCounts(ctx, attempt, definition);
    await ctx.db.patch(attempt._id, { ...counts, responseLanguage: args.responseLanguage, lastActivityAt: now, expiresAt: now + UNFINISHED_ATTEMPT_TTL_MS });
    return counts;
  },
});

export const complete = mutation({
  args: { attemptId: v.id("assessmentAttempts"), capability: v.string() },
  handler: async (ctx, args) => {
    const attempt = await requireAttempt(ctx, args.attemptId, args.capability);
    if (attempt.status === "completed") {
      if (!attempt.completionSnapshot) throw new Error("Assessment result is unavailable");
      return attempt.completionSnapshot;
    }
    await checkRateLimit(ctx, { key: `assessment:completion:${attempt._id}`, ...ASSESSMENT_LIMITS.completion });
    const definition = await ctx.db.get(attempt.definitionId);
    if (!definition || definition.definitionVersion !== attempt.definitionVersion) throw new Error("Assessment definition is unavailable");
    const counts = await cleanupAndCounts(ctx, attempt, definition);
    if (counts.requiredAnsweredCount !== counts.requiredApplicableCount) throw new Error("Complete all required questions before finishing");
    const answers = await answerMap(ctx, attempt._id);
    for (const question of definition.questions as AssessmentQuestion[]) {
      const answer = answers[question.key];
      if (answer === undefined || !isApplicable(question, answers)) continue;
      if (question.kind === "single" && (typeof answer !== "string" || !question.options?.some((option) => option.value === answer))) {
        throw new Error("One or more responses must be reviewed before finishing");
      }
    }
    const scoring = scoreAssessment(definition as any, answers);
    const now = Date.now();
    const completionSnapshot = {
      definitionId: definition._id,
      definitionVersion: definition.definitionVersion,
      scoringVersion: definition.scoringVersion!,
      benchmarkCompatibilityKey: definition.benchmarkCompatibilityKey,
      completedAt: now,
      operationsScore: scoring.operationsScore,
      maturityKey: scoring.maturityKey,
      confidenceKey: scoring.confidence,
      confidenceMetadata: scoring.confidenceMetadata,
      sectionResults: scoring.sectionResults,
      applicableSectionIds: scoring.applicableSectionIds,
      applicableQuestionCount: scoring.applicableQuestionCount,
      answeredScoredQuestionCount: scoring.answeredScoredQuestionCount,
      evidenceIds: scoring.evidenceIds,
      branchContext: { teamSize: typeof answers["business.team_size"] === "string" ? answers["business.team_size"] : undefined, soloOperator: answers["business.team_size"] === "solo" },
    };
    await ctx.db.patch(attempt._id, {
      ...counts,
      status: "completed",
      completedAt: now,
      lastActivityAt: now,
      scoringVersion: definition.scoringVersion,
      confidenceResult: {
        level: scoring.confidence,
        coverageScore: scoring.confidenceMetadata.coverageScore,
        reasonKeys: scoring.confidenceMetadata.reasonKeys,
        categoryCoverage: scoring.confidenceMetadata.categoryCoverage,
      },
      completionSnapshot,
    });
    await recordMilestone(ctx, (await ctx.db.get(attempt._id))!, "assessment_completed", { definitionVersion: definition.definitionVersion, scoringVersion: definition.scoringVersion, maturityKey: scoring.maturityKey, confidenceKey: scoring.confidence, branchType: completionSnapshot.branchContext.soloOperator ? "solo" : "team", scoreBand: scoring.operationsScore < 40 ? "0_39" : scoring.operationsScore < 60 ? "40_59" : scoring.operationsScore < 75 ? "60_74" : scoring.operationsScore < 90 ? "75_89" : "90_100" });
    return completionSnapshot;
  },
});

export const generateReport = mutation({
  args: { attemptId: v.id("assessmentAttempts"), capability: v.string() },
  handler: async (ctx, args) => {
    const attempt = await requireAttempt(ctx, args.attemptId, args.capability);
    if (attempt.status !== "completed" || !attempt.completionSnapshot) throw new Error("Complete the assessment before viewing the report");
    if (attempt.reportSnapshot) return attempt.reportSnapshot;
    await checkRateLimit(ctx, { key: `assessment:report:${attempt._id}`, ...ASSESSMENT_LIMITS.reportGeneration });
    const definition = await ctx.db.get(attempt.definitionId);
    if (!definition || definition.definitionVersion !== attempt.completionSnapshot.definitionVersion) throw new Error("Assessment report is unavailable");
    await ctx.db.query("assessmentResponses").withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id)).collect();
    const generatedAt = Date.now();
    const reportSnapshot = {
      scoringVersion: attempt.completionSnapshot.scoringVersion,
      reportContentVersion: REPORT_VERSION,
      generatedAt,
      payload: generateReportSnapshot(attempt.completionSnapshot, generatedAt),
    };
    await ctx.db.patch(attempt._id, { reportContentVersion: REPORT_VERSION, reportSnapshot });
    await recordMilestone(ctx, attempt, "report_generated", { reportVersion: REPORT_VERSION, scoringVersion: attempt.scoringVersion });
    return reportSnapshot;
  },
});

export const generateRoadmap = mutation({
  args: { attemptId: v.id("assessmentAttempts"), capability: v.string() },
  handler: async (ctx, args) => {
    const attempt = await requireAttempt(ctx, args.attemptId, args.capability);
    if (attempt.status !== "completed" || !attempt.completionSnapshot || !attempt.reportSnapshot) throw new Error("Complete the assessment report before viewing the roadmap");
    if (attempt.roadmapSnapshot) return attempt.roadmapSnapshot;
    await checkRateLimit(ctx, { key: `assessment:roadmap:${attempt._id}`, ...ASSESSMENT_LIMITS.roadmapGeneration });
    const generatedAt = Date.now();
    const roadmapSnapshot = { roadmapVersion: ROADMAP_VERSION, generatedAt, payload: generateRoadmapSnapshot(attempt.reportSnapshot.payload, generatedAt) };
    await ctx.db.patch(attempt._id, { roadmapSnapshot });
    await recordMilestone(ctx, attempt, "roadmap_generated", { roadmapVersion: ROADMAP_VERSION, reportVersion: attempt.reportContentVersion });
    return roadmapSnapshot;
  },
});

export const abandon = mutation({
  args: { attemptId: v.id("assessmentAttempts"), capability: v.string() },
  handler: async (ctx, args) => {
    const attempt = await requireAttempt(ctx, args.attemptId, args.capability);
    if (attempt.status === "in_progress") await ctx.db.patch(attempt._id, { status: "abandoned", lastActivityAt: Date.now() });
    return { abandoned: true };
  },
});
