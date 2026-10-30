import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { recordEvent } from "../../assessmentContinuity";
import { TELEMETRY_LIMITS } from "../assessmentTelemetry";

const modules = import.meta.glob("../../**/*.ts");
const capability = "a".repeat(64);
const session = (n: number) => n.toString(16).padStart(32, "0");
const create = async (t: ReturnType<typeof convexTest>, secret = capability) => ({
  ...await t.mutation(api.assessments.start, { capability: secret, browserKey: "b".repeat(64), responseLanguage: "en", firstResponse: { questionKey: "business.team_size", answerValue: "solo" } }),
  capability: secret,
});
const resume = (attemptId: any, n = 0) => ({
  attemptId, capability, eventKey: "assessment_resumed" as const,
  deduplicationKey: `${attemptId}:assessment_resumed:${session(n)}`,
  language: "en" as const, metadata: { sessionId: session(n) },
});
afterEach(() => vi.useRealTimers());

describe("public assessment telemetry", () => {
  it("preserves legacy progress/resume/CTA keys and first-write reporting semantics", async () => {
    const t = convexTest(schema, modules), s = await create(t);
    const events = [resume(s.attemptId), {
      ...resume(s.attemptId), eventKey: "assessment_progress" as const,
      deduplicationKey: `${s.attemptId}:assessment_progress:${session(0)}:business.team_size`,
      metadata: { sessionId: session(0), sectionKey: "business", questionKey: "business.team_size" },
    }, { ...resume(s.attemptId), eventKey: "scrub_support_cta_clicked" as const,
      deduplicationKey: `${s.attemptId}:scrub_support_cta_clicked`, metadata: undefined }];
    for (const event of events) expect(await t.mutation(api.assessmentContinuity.recordEvent, event)).toEqual({ recorded: true });
    const before = await t.run((ctx) => ctx.db.query("assessmentEvents").collect());
    const counters = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    for (const event of events) expect(await t.mutation(api.assessmentContinuity.recordEvent, { ...event, language: "es" })).toEqual({ recorded: false });
    expect(await t.run((ctx) => ctx.db.query("assessmentEvents").collect())).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(counters);
  });

  it("detects duplicates with one indexed lookup and no attempt/snapshot read or write", async () => {
    const unique = vi.fn().mockResolvedValue({ _id: "event" });
    const db = { query: vi.fn(() => ({ withIndex: vi.fn(() => ({ unique })) })), get: vi.fn(), patch: vi.fn(), insert: vi.fn() };
    expect(await (recordEvent as any)._handler({ db }, resume("attempt"))).toEqual({ recorded: false });
    expect(db.query).toHaveBeenCalledExactlyOnceWith("assessmentEvents");
    expect(db.get).not.toHaveBeenCalled();
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("coalesces concurrent identical requests into one row and one budget charge", async () => {
    const t = convexTest(schema, modules), s = await create(t);
    const results = await Promise.all(Array.from({ length: 12 }, () => t.mutation(api.assessmentContinuity.recordEvent, resume(s.attemptId))));
    expect(results.filter((r) => r.recorded)).toHaveLength(1);
    const counters = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(counters.find((r) => r.key === `assessment:telemetry:${s.attemptId}`)?.count).toBe(1);
    expect(counters.find((r) => r.key === "assessment:event:global")?.count).toBe(1);
  });

  it("requires capabilities for every supported event, without charging invalid calls", async () => {
    const t = convexTest(schema, modules), s = await create(t);
    const before = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    for (const eventKey of ["assessment_resumed", "assessment_progress", "scrub_support_cta_clicked"] as const) {
      const event = eventKey === "scrub_support_cta_clicked"
        ? { ...resume(s.attemptId), eventKey, deduplicationKey: `${s.attemptId}:${eventKey}` }
        : eventKey === "assessment_progress"
          ? { ...resume(s.attemptId), eventKey, deduplicationKey: `${s.attemptId}:${eventKey}:${session(0)}:business.team_size`, metadata: { sessionId: session(0), questionKey: "business.team_size", sectionKey: "business" } }
          : resume(s.attemptId);
      for (const secret of [undefined, "bad", "c".repeat(64)]) {
        expect(await t.mutation(api.assessmentContinuity.recordEvent, { ...event, capability: secret })).toEqual({ recorded: false });
      }
      expect(await t.mutation(api.assessmentContinuity.recordEvent, { ...event, attemptId: undefined })).toEqual({ recorded: false });
    }
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(before);
    expect((await t.run((ctx) => ctx.db.query("assessmentEvents").collect())).filter((r) => r.eventKey !== "assessment_started")).toHaveLength(0);
  });

  it("rejects unsupported public milestones and unknown metadata at the validator", async () => {
    const t = convexTest(schema, modules), s = await create(t);
    for (const eventKey of ["assessment_started", "assessment_completed", "report_generated", "report_viewed", "assessment_viewed", "made_up"]) {
      await expect(t.mutation(api.assessmentContinuity.recordEvent, { ...resume(s.attemptId), eventKey } as any)).rejects.toThrow();
    }
    await expect(t.mutation(api.assessmentContinuity.recordEvent, { ...resume(s.attemptId), metadata: { email: "private@example.test" } } as any)).rejects.toThrow();
  });

  it("rejects malformed, excessive, mismatched and cross-attempt payloads without writes", async () => {
    const t = convexTest(schema, modules), a = await create(t), b = await create(t, "c".repeat(64));
    const base = resume(a.attemptId);
    const before = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    const invalid = [
      { deduplicationKey: "" }, { deduplicationKey: "x".repeat(161) },
      { deduplicationKey: `${a.attemptId}:assessment_completed` },
      { deduplicationKey: resume(b.attemptId).deduplicationKey },
      { metadata: undefined }, { metadata: { sessionId: "bad" } },
      { metadata: { sessionId: session(1) } },
      ...["maturityKey", "confidenceKey", "branchType", "scoreBand", "sectionKey", "questionKey"].map((field) => ({ metadata: { ...base.metadata, [field]: "x".repeat(121) } })),
      ...[NaN, Infinity, -1, 1.5, 1_000_001].map((definitionVersion) => ({ metadata: { ...base.metadata, definitionVersion } })),
      { metadata: { ...base.metadata, sectionKey: "" } },
      { metadata: { ...base.metadata, questionKey: "<script>" } },
      { metadata: { ...base.metadata, maturityKey: "é".repeat(1000) } },
    ];
    for (const change of invalid) expect(await t.mutation(api.assessmentContinuity.recordEvent, { ...base, ...change })).toEqual({ recorded: false });
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(before);
  });

  it("shares a bounded attempt budget across rotating sessions, isolates other attempts, and reuses its row", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    const t = convexTest(schema, modules), a = await create(t), b = await create(t, "c".repeat(64));
    for (let n = 0; n < TELEMETRY_LIMITS.attempt.limit; n++) expect(await t.mutation(api.assessmentContinuity.recordEvent, resume(a.attemptId, n))).toEqual({ recorded: true });
    const before = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    for (let n = 120; n < 125; n++) expect(await t.mutation(api.assessmentContinuity.recordEvent, resume(a.attemptId, n))).toEqual({ recorded: false });
    // Duplicates still cost no budget, including at saturation.
    expect(await t.mutation(api.assessmentContinuity.recordEvent, resume(a.attemptId))).toEqual({ recorded: false });
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(before);
    // Knowing another attempt's ID cannot spend its budget with our capability.
    expect(await t.mutation(api.assessmentContinuity.recordEvent, resume(b.attemptId))).toEqual({ recorded: false });
    expect(await t.mutation(api.assessmentContinuity.recordEvent, { ...resume(b.attemptId), capability: b.capability })).toEqual({ recorded: true });
    const original = before.find((r) => r.key === `assessment:telemetry:${a.attemptId}`)!;
    vi.advanceTimersByTime(TELEMETRY_LIMITS.attempt.windowMs);
    expect(await t.mutation(api.assessmentContinuity.recordEvent, resume(a.attemptId, 200))).toEqual({ recorded: true });
    const reset = await t.run((ctx) => ctx.db.get(original._id));
    expect(reset?.count).toBe(1);
    expect((await t.run((ctx) => ctx.db.query("rateLimits").collect())).filter((r) => r.key.startsWith("assessment:telemetry:"))).toHaveLength(2);
  });

  it("stops concurrent admissions at the attempt limit", async () => {
    const t = convexTest(schema, modules), s = await create(t);
    await t.run((ctx) => ctx.db.insert("rateLimits", { key: `assessment:telemetry:${s.attemptId}`, count: TELEMETRY_LIMITS.attempt.limit - 1, windowStartMs: Date.now() }));
    const results = await Promise.all(Array.from({ length: 8 }, (_, n) => t.mutation(api.assessmentContinuity.recordEvent, resume(s.attemptId, n))));
    expect(results.filter((r) => r.recorded)).toHaveLength(1);
  });

  it("does not create budget rows or telemetry for a nonexistent attempt", async () => {
    const t = convexTest(schema, modules), s = await create(t);
    await t.run((ctx) => ctx.db.delete(s.attemptId));
    const before = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(await t.mutation(api.assessmentContinuity.recordEvent, resume(s.attemptId))).toEqual({ recorded: false });
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(before);
  });

  it("admits only one concurrent new event at the global boundary and resets the existing row", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    const t = convexTest(schema, modules), s = await create(t);
    const rowId = await t.run((ctx) => ctx.db.insert("rateLimits", { key: "assessment:event:global", count: TELEMETRY_LIMITS.global.limit - 1, windowStartMs: Date.now() }));
    const results = await Promise.all(Array.from({ length: 8 }, (_, n) => t.mutation(api.assessmentContinuity.recordEvent, resume(s.attemptId, n))));
    expect(results.filter((r) => r.recorded)).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(rowId)))?.count).toBe(TELEMETRY_LIMITS.global.limit);
    vi.advanceTimersByTime(TELEMETRY_LIMITS.global.windowMs);
    expect(await t.mutation(api.assessmentContinuity.recordEvent, resume(s.attemptId, 100))).toEqual({ recorded: true });
    expect((await t.run((ctx) => ctx.db.get(rowId)))?.count).toBe(1);
  });

  it("rejects saturated budgets before loading snapshots, with no writes", async () => {
    for (const saturated of ["attempt", "global"] as const) {
      const first = vi.fn().mockResolvedValueOnce(saturated === "attempt" ? { count: 120, windowStartMs: Date.now() } : null).mockResolvedValue({ count: 500, windowStartMs: Date.now() });
      const db = { query: vi.fn((table: string) => ({ withIndex: vi.fn(() => table === "assessmentEvents" ? { unique: vi.fn().mockResolvedValue(null) } : { first }) })), get: vi.fn(), patch: vi.fn(), insert: vi.fn() };
      expect(await (recordEvent as any)._handler({ db }, resume("attempt"))).toEqual({ recorded: false });
      expect(db.get).not.toHaveBeenCalled(); expect(db.patch).not.toHaveBeenCalled(); expect(db.insert).not.toHaveBeenCalled();
    }
  });

  it("keeps the global guard, without invalid requests or duplicates exhausting it", async () => {
    const t = convexTest(schema, modules), s = await create(t);
    await t.mutation(api.assessmentContinuity.recordEvent, resume(s.attemptId));
    await t.run(async (ctx) => {
      const row = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", "assessment:event:global")).unique();
      await ctx.db.patch(row!._id, { count: TELEMETRY_LIMITS.global.limit - 1 });
    });
    expect(await t.mutation(api.assessmentContinuity.recordEvent, { ...resume(s.attemptId, 1), capability: "c".repeat(64) })).toEqual({ recorded: false });
    expect(await t.mutation(api.assessmentContinuity.recordEvent, resume(s.attemptId))).toEqual({ recorded: false });
    expect(await t.mutation(api.assessmentContinuity.recordEvent, resume(s.attemptId, 1))).toEqual({ recorded: true });
    const before = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(await t.mutation(api.assessmentContinuity.recordEvent, resume(s.attemptId, 2))).toEqual({ recorded: false });
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(before);
  });
});
