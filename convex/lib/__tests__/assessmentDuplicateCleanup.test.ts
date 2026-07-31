import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const modules = import.meta.glob("../../**/*.ts");
const cleanupApi = (api as any).mutations.assessmentDuplicateCleanup.cleanup;
const SESSION_TOKEN = "assessment-cleanup-test-session";
const PEPPER = "assessment-cleanup-test-pepper";

async function sessionHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token + PEPPER));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function backend() {
  const t = convexTest(schema, modules);
  const definition = await t.mutation((api as any).assessments.prepare, {});
  const now = Date.now();
  const founder = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "dzbfyse@gmail.com", passwordHash: "test", name: "Founder", role: "affiliate", status: "active" });
    await ctx.db.insert("authSessions", {
      principalType: "staff", userId, tokenHash: await sessionHash(SESSION_TOKEN), version: 1,
      createdAt: now - 60_000, lastUsedAt: now - 60_000, expiresAt: now + 60_000, idleExpiresAt: now + 60_000,
    });
    return userId;
  });
  return { t, definition, founder, now };
}

type TestBackend = Awaited<ReturnType<typeof backend>>;

async function attempt(s: TestBackend, options: {
  status?: "in_progress" | "completed" | "abandoned" | "deleted";
  meaningful?: boolean;
  capability?: string;
  browser?: string;
  completedAt?: number;
  scoringVersion?: number;
  report?: boolean;
  roadmap?: boolean;
} = {}) {
  return s.t.run(async (ctx) => {
    const status = options.status ?? "in_progress";
    return await ctx.db.insert("assessmentAttempts", {
      definitionId: s.definition._id,
      definitionVersion: s.definition.definitionVersion,
      benchmarkCompatibilityKey: s.definition.benchmarkCompatibilityKey,
      status,
      audience: "public",
      responseLanguage: "en",
      capabilityHash: (options.capability ?? Math.random().toString(16).slice(2)).padEnd(64, "a").slice(0, 64),
      browserKeyHash: (options.browser ?? Math.random().toString(16).slice(2)).padEnd(64, "b").slice(0, 64),
      startedAt: s.now,
      lastActivityAt: options.meaningful ? s.now + 1 : s.now,
      completedAt: options.completedAt,
      expiresAt: s.now + 60_000,
      scoringVersion: options.scoringVersion,
      reportSnapshot: options.report ? { scoringVersion: 1, reportContentVersion: 1, generatedAt: s.now, payload: {} } : undefined,
      roadmapSnapshot: options.roadmap ? { roadmapVersion: 1, generatedAt: s.now, payload: {} } : undefined,
      requiredAnsweredCount: 1,
      requiredApplicableCount: 10,
      optionalAnsweredCount: 0,
    });
  });
}

async function response(s: TestBackend, attemptId: Id<"assessmentAttempts">, questionKey = "business.primary_model", modified = false) {
  return s.t.run((ctx) => ctx.db.insert("assessmentResponses", {
    attemptId, questionKey, sectionKey: "business", categoryKey: "business", responseKind: "single",
    answerValue: "mixed", answeredAt: s.now, updatedAt: modified ? s.now + 1 : s.now,
  }));
}

async function event(s: TestBackend, attemptId: Id<"assessmentAttempts">, eventKey = "assessment_started") {
  return s.t.run((ctx) => ctx.db.insert("assessmentEvents", {
    attemptId, eventKey, deduplicationKey: `${attemptId}:${eventKey}:${Math.random()}`, language: "en", createdAt: s.now,
  }));
}

async function prospect(s: TestBackend, attemptId: Id<"assessmentAttempts">) {
  return s.t.run((ctx) => ctx.db.insert("assessmentProspects", {
    attemptId, normalizedEmail: "protected@example.com", preferredLanguage: "en", deliveryAuthorizedAt: s.now,
    marketingConsent: false, scrubInterest: "unspecified", deliveryStatus: "delivered", reportVersion: 1,
    roadmapVersion: 1, source: "assessment_report", createdAt: s.now, updatedAt: s.now,
  }));
}

const dryRun = (s: TestBackend, preserveInProgressAttemptId?: Id<"assessmentAttempts">, deleteAllUnfinished = false) => s.t.mutation(cleanupApi, {
  mode: "dry_run", userId: s.founder, sessionToken: SESSION_TOKEN, preserveInProgressAttemptId, deleteAllUnfinished,
});

const confirmed = (s: TestBackend, approvedAttemptIds: Id<"assessmentAttempts">[], preserveInProgressAttemptId?: Id<"assessmentAttempts">, confirm = "DELETE_DUPLICATE_ASSESSMENTS", deleteAllUnfinished = false) => s.t.mutation(cleanupApi, {
  mode: "confirmed", userId: s.founder, sessionToken: SESSION_TOKEN, preserveInProgressAttemptId, deleteAllUnfinished, confirm, approvedAttemptIds,
});

async function tableCounts(s: TestBackend) {
  return s.t.run(async (ctx) => ({
    attempts: (await ctx.db.query("assessmentAttempts").collect()).length,
    responses: (await ctx.db.query("assessmentResponses").collect()).length,
    events: (await ctx.db.query("assessmentEvents").collect()).length,
    prospects: (await ctx.db.query("assessmentProspects").collect()).length,
    tokens: (await ctx.db.query("assessmentReportTokens").collect()).length,
    rates: (await ctx.db.query("rateLimits").collect()).length,
    definitions: (await ctx.db.query("assessmentDefinitions").collect()).length,
    sessions: await ctx.db.query("authSessions").collect(),
  }));
}

describe("one-time assessment duplicate cleanup", () => {
  beforeEach(() => { process.env.TOKEN_PEPPER = PEPPER; });

  it("rejects authenticated non-superadmin callers", async () => {
    const s = await backend();
    const ordinaryToken = "ordinary-cleanup-session";
    const ordinary = await s.t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com", passwordHash: "test", name: "Owner", role: "owner", status: "active" });
      await ctx.db.insert("authSessions", {
        principalType: "staff", userId, tokenHash: await sessionHash(ordinaryToken), version: 1,
        createdAt: s.now, lastUsedAt: s.now, expiresAt: s.now + 60_000, idleExpiresAt: s.now + 60_000,
      });
      return userId;
    });
    await expect(s.t.mutation(cleanupApi, {
      mode: "dry_run", userId: ordinary, sessionToken: ordinaryToken,
    })).rejects.toThrow("Super admin session required");
  });

  it("protects completed, result-bearing, prospect-bearing, and token-bearing assessments", async () => {
    const s = await backend();
    const completed = await attempt(s, { status: "completed", completedAt: s.now + 10 });
    const resultBearing = await attempt(s, { scoringVersion: 1, report: true, roadmap: true });
    const withProspect = await attempt(s);
    const prospectId = await prospect(s, withProspect);
    const withToken = await attempt(s);
    await s.t.run((ctx) => ctx.db.insert("assessmentReportTokens", {
      attemptId: withToken, prospectId, tokenHash: "t".repeat(64), scope: "assessment_report_read",
      createdAt: s.now, expiresAt: s.now + 60_000,
    }));
    const survivor = await attempt(s, { meaningful: true });
    await response(s, survivor);
    const duplicate = await attempt(s);
    await response(s, duplicate);

    const report = await dryRun(s);
    expect(report.blocked).toBe(false);
    expect(report.proposedDeletionIds).toEqual([duplicate]);
    for (const id of [completed, resultBearing, withProspect, withToken]) {
      expect(report.attempts.find((row: any) => row.attemptId === id).classification).toBe("preserve_protected");
    }
  });

  it("preserves one meaningful survivor, selects baseline in-progress and abandoned duplicates, and reports evidence", async () => {
    const s = await backend();
    const survivor = await attempt(s, { meaningful: true, browser: "shared" });
    await response(s, survivor);
    await response(s, survivor, "business.team_size");
    await event(s, survivor, "assessment_progress");
    const duplicate = await attempt(s, { browser: "shared" });
    await response(s, duplicate);
    await event(s, duplicate);
    const abandoned = await attempt(s, { status: "abandoned", browser: "shared" });
    await response(s, abandoned);

    const report = await dryRun(s);
    expect(report.blocked).toBe(false);
    expect(report.remainingMeaningfulInProgressAttemptId).toBe(survivor);
    expect(new Set(report.proposedDeletionIds)).toEqual(new Set([duplicate, abandoned]));
    expect(report.attempts.find((row: any) => row.attemptId === survivor)).toMatchObject({
      distinctResponseCount: 2, progressEventCount: 1, browserGroupSize: 3,
      classification: "preserve_legitimate_in_progress",
    });
  });

  it("blocks multiple or missing meaningful survivors and respects an explicitly reviewed survivor", async () => {
    const multiple = await backend();
    const first = await attempt(multiple, { meaningful: true });
    const second = await attempt(multiple, { meaningful: true });
    const duplicate = await attempt(multiple);
    expect((await dryRun(multiple)).blocked).toBe(true);
    const reviewed = await dryRun(multiple, first);
    expect(reviewed.blocked).toBe(false);
    expect(reviewed.remainingMeaningfulInProgressAttemptId).toBe(first);
    expect(new Set(reviewed.proposedDeletionIds)).toEqual(new Set([second, duplicate]));

    const missing = await backend();
    await response(missing, await attempt(missing));
    expect((await dryRun(missing)).blockingReasons).toContain("No legitimate meaningful in-progress assessment could be identified");
    expect((await dryRun(missing, duplicate)).blocked).toBe(true);
  });

  it("blocks meaningful abandoned assessments", async () => {
    const s = await backend();
    await attempt(s, { meaningful: true });
    const abandoned = await attempt(s, { status: "abandoned" });
    await response(s, abandoned);
    await response(s, abandoned, "business.team_size");
    const report = await dryRun(s);
    expect(report.blocked).toBe(true);
    expect(report.blockingReasons.join(" ")).toContain(String(abandoned));
    expect(report.proposedDeletionIds).not.toContain(abandoned);
  });

  it("deletes every unfinished assessment only under the explicit delete-all policy", async () => {
    const s = await backend();
    const completed = await Promise.all([1, 2, 3].map((offset) => attempt(s, { status: "completed", completedAt: s.now + offset })));
    const meaningful = await attempt(s, { meaningful: true });
    await response(s, meaningful);
    await response(s, meaningful, "business.team_size");
    const withContact = await attempt(s);
    await response(s, withContact);
    await prospect(s, withContact);
    const abandoned = await attempt(s, { status: "abandoned" });
    await response(s, abandoned);
    await response(s, abandoned, "business.team_size");

    const conservative = await dryRun(s);
    expect(conservative.proposedDeletionIds).not.toContain(meaningful);
    expect(conservative.proposedDeletionIds).not.toContain(withContact);
    expect(conservative.blocked).toBe(true);

    const reviewed = await dryRun(s, undefined, true);
    expect(reviewed.blocked).toBe(false);
    expect(reviewed.deleteAllUnfinished).toBe(true);
    expect(new Set(reviewed.proposedDeletionIds)).toEqual(new Set([meaningful, withContact, abandoned]));
    expect(reviewed.attempts.find((row: any) => row.attemptId === withContact)).toMatchObject({ hasProspect: true, hasEmail: true, classification: "delete_duplicate" });
    expect(reviewed.projectedFunnel).toEqual({ starts: 3, completed: 3, inProgress: 0, abandoned: 0 });

    const beforeMismatch = await tableCounts(s);
    await expect(confirmed(s, reviewed.proposedDeletionIds, undefined, "DELETE_DUPLICATE_ASSESSMENTS", false)).rejects.toThrow();
    expect(await tableCounts(s)).toEqual(beforeMismatch);

    const result = await confirmed(s, reviewed.proposedDeletionIds, undefined, "DELETE_DUPLICATE_ASSESSMENTS", true);
    expect(result.deleteAllUnfinished).toBe(true);
    expect(result.finalFunnel).toEqual({ starts: 3, completed: 3, inProgress: 0, abandoned: 0 });
    expect(new Set(result.preservedAttemptIds)).toEqual(new Set(completed));
  });

  it("keeps completed and result-bearing attempts absolutely protected in delete-all mode", async () => {
    const s = await backend();
    const completed = await attempt(s, { status: "completed", completedAt: s.now + 1 });
    const resultBearing = await attempt(s, { scoringVersion: 1, report: true, roadmap: true });
    const unfinished = await attempt(s, { meaningful: true });
    await response(s, unfinished);
    await response(s, unfinished, "business.team_size");

    const report = await dryRun(s, undefined, true);
    expect(report.blocked).toBe(false);
    expect(report.proposedDeletionIds).toEqual([unfinished]);
    expect(report.preservedIds).toEqual(expect.arrayContaining([completed, resultBearing]));
    expect(report.attempts.find((row: any) => row.attemptId === resultBearing).reason).toContain("Absolute completion protection");
  });

  it("makes dry runs and rejected confirmations write nothing", async () => {
    const s = await backend();
    await attempt(s, { meaningful: true });
    const duplicate = await attempt(s);
    await response(s, duplicate);
    const before = await tableCounts(s);
    const report = await dryRun(s);
    expect(await tableCounts(s)).toEqual(before);
    await expect(s.t.mutation(cleanupApi, {
      mode: "confirmed", userId: s.founder, sessionToken: SESSION_TOKEN,
      approvedAttemptIds: report.proposedDeletionIds,
    })).rejects.toThrow("Exact cleanup confirmation");
    await expect(confirmed(s, report.proposedDeletionIds, undefined, "wrong")).rejects.toThrow("Exact cleanup confirmation");
    await expect(confirmed(s, [], undefined)).rejects.toThrow("exactly match");
    await expect(confirmed(s, [...report.proposedDeletionIds, report.preservedIds[0]], undefined)).rejects.toThrow("exactly match");
    expect(await tableCounts(s)).toEqual(before);
  });

  it("rejects missing IDs and classification changes between review and execution", async () => {
    const missing = await backend();
    await attempt(missing, { meaningful: true });
    const one = await attempt(missing);
    const two = await attempt(missing);
    const reviewed = await dryRun(missing);
    await expect(confirmed(missing, [one])).rejects.toThrow("exactly match");
    expect(reviewed.proposedDeletionIds).toEqual([one, two]);

    await prospect(missing, two);
    await expect(confirmed(missing, reviewed.proposedDeletionIds)).rejects.toThrow("exactly match");
    expect(await missing.t.run((ctx) => ctx.db.get(two))).not.toBeNull();
  });

  it("atomically removes only duplicate children and exact rate limits, then derives the final funnel", async () => {
    const s = await backend();
    const completed = await Promise.all([1, 2, 3].map((offset) => attempt(s, { status: "completed", completedAt: s.now + offset })));
    const survivor = await attempt(s, { meaningful: true, capability: "survivor" });
    await response(s, survivor);
    await event(s, survivor, "assessment_progress");
    const duplicate = await attempt(s, { capability: "duplicate", browser: "shared-browser" });
    await response(s, duplicate);
    await event(s, duplicate);
    const abandoned = await attempt(s, { status: "abandoned", capability: "abandoned", browser: "shared-browser" });
    await response(s, abandoned);

    await s.t.run(async (ctx) => {
      for (const key of [
        `assessment:response-write:${duplicate}`, `assessment:completion:${duplicate}`,
        `assessment:delivery:${"duplicate".padEnd(64, "a")}`,
        `assessment:response-write:${survivor}`, "assessment:event:global",
        `assessment:creation:${"shared-browser".padEnd(64, "b")}`, "unrelated:key",
      ]) await ctx.db.insert("rateLimits", { key, windowStartMs: s.now, count: 1 });
    });
    const report = await dryRun(s);
    expect(report.currentFunnel).toEqual({ starts: 6, completed: 3, inProgress: 2, abandoned: 1 });
    expect(report.projectedFunnel).toEqual({ starts: 4, completed: 3, inProgress: 1, abandoned: 0 });
    const result = await confirmed(s, report.proposedDeletionIds);
    expect(result.finalFunnel).toEqual({ starts: 4, completed: 3, inProgress: 1, abandoned: 0 });
    expect(result.protectedRecordsDeleted).toBe(false);
    expect(result.deletedCounts).toMatchObject({ assessmentAttempts: 2, assessmentResponses: 2, assessmentEvents: 1, rateLimits: 3 });

    const remaining = await s.t.run(async (ctx) => ({
      attempts: await ctx.db.query("assessmentAttempts").collect(),
      responses: await ctx.db.query("assessmentResponses").collect(),
      events: await ctx.db.query("assessmentEvents").collect(),
      rates: await ctx.db.query("rateLimits").collect(),
      definitions: await ctx.db.query("assessmentDefinitions").collect(),
    }));
    expect(new Set(remaining.attempts.map((row) => row._id))).toEqual(new Set([...completed, survivor]));
    expect(remaining.responses.every((row) => row.attemptId === survivor)).toBe(true);
    expect(remaining.events.every((row) => row.attemptId === survivor)).toBe(true);
    expect(remaining.definitions).toHaveLength(1);
    expect(new Set(remaining.rates.map((row) => row.key))).toEqual(new Set([
      `assessment:response-write:${survivor}`, "assessment:event:global",
      `assessment:creation:${"shared-browser".padEnd(64, "b")}`, "unrelated:key",
    ]));
  });
});
