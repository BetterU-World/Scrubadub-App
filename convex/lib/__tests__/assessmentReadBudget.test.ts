import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { recover, generateReport, generateRoadmap } from "../../assessments";
import { ASSESSMENT_READ_BUDGET } from "../assessmentReadBudget";
import { INITIAL_ASSESSMENT_DEFINITION, isApplicable } from "../assessmentDefinition";

const modules = import.meta.glob("../../**/*.ts");
const key = (attemptId: string) => `assessment:read:${attemptId}`;
const capability = "a".repeat(64);
const create = async (t: ReturnType<typeof convexTest>, secret = capability) => ({
  ...await t.mutation(api.assessments.start, { capability: secret, browserKey: "b".repeat(64), responseLanguage: "en", firstResponse: { questionKey: "business.team_size", answerValue: "solo" } }), capability: secret,
});
afterEach(() => vi.useRealTimers());

describe("assessment pre-read protection", () => {
  it.each([recover, generateReport, generateRoadmap])("rejects a saturated old-client request before any attempt/definition/response read or write", async (endpoint) => {
    const first = vi.fn().mockResolvedValue({ count: ASSESSMENT_READ_BUDGET.limit, windowStartMs: Date.now() });
    const db = { query: vi.fn(() => ({ withIndex: vi.fn(() => ({ first })) })), get: vi.fn(), patch: vi.fn(), insert: vi.fn() };
    await expect((endpoint as any)._handler({ db }, { attemptId: "attempt", capability })).rejects.toThrow("rate limit");
    expect(db.query).toHaveBeenCalledExactlyOnceWith("rateLimits");
    expect(db.get).not.toHaveBeenCalled();
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("shares a finite budget across recovery and cached snapshots, with no writes after exhaustion", async () => {
    const t = convexTest(schema, modules);
    const args = await create(t);
    const answers: Record<string, string> = { "business.team_size": "solo" };
    for (const question of INITIAL_ASSESSMENT_DEFINITION.questions) {
      if (!question.required || question.key === "business.team_size" || !isApplicable(question, answers)) continue;
      const answerValue = question.options![0].value; answers[question.key] = answerValue;
      await t.mutation(api.assessments.saveResponse, { ...args, responseLanguage: "en", response: { questionKey: question.key, answerValue } });
    }
    await t.mutation(api.assessments.complete, args);
    const report = await t.mutation(api.assessments.generateReport, args);
    const roadmap = await t.mutation(api.assessments.generateRoadmap, args);
    const endpoints = [api.assessments.recover, api.assessments.generateReport, api.assessments.generateRoadmap];
    for (let index = 2; index < ASSESSMENT_READ_BUDGET.limit; index++) await t.mutation(endpoints[index % 3], args);
    const before = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    for (let index = 0; index < 20; index++) for (const endpoint of endpoints) await expect(t.mutation(endpoint, args)).rejects.toThrow("rate limit");
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toEqual(before);
    const attempt = await t.run((ctx) => ctx.db.get(args.attemptId));
    expect(attempt?.reportSnapshot).toEqual(report);
    expect(attempt?.roadmapSnapshot).toEqual(roadmap);
    // Completion remains idempotent and outside the read bucket.
    expect(await t.mutation(api.assessments.complete, args)).toEqual(attempt?.completionSnapshot);
  });

  it("isolates attempts, reuses one row after reset, and does not charge invalid capabilities", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const t = convexTest(schema, modules);
    const first = await create(t);
    const second = await create(t, "c".repeat(64));
    expect(await t.mutation(api.assessments.recover, { ...first, capability: "d".repeat(64) })).toBeNull();
    expect((await t.run((ctx) => ctx.db.query("rateLimits").collect())).some((row) => row.key === key(first.attemptId))).toBe(false);
    for (let index = 0; index < ASSESSMENT_READ_BUDGET.limit; index++) await t.mutation(api.assessments.recover, first);
    await expect(t.mutation(api.assessments.recover, first)).rejects.toThrow("rate limit");
    expect(await t.mutation(api.assessments.recover, second)).not.toBeNull();
    const row = await t.run((ctx) => ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key(first.attemptId))).unique());
    vi.advanceTimersByTime(ASSESSMENT_READ_BUDGET.windowMs);
    expect(await t.mutation(api.assessments.recover, first)).not.toBeNull();
    const reset = await t.run((ctx) => ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key(first.attemptId))).unique());
    expect(reset?._id).toBe(row?._id);
    expect(reset?.count).toBe(1);
  });

  it("does not create protection records for nonexistent attempts", async () => {
    const t = convexTest(schema, modules);
    const args = await create(t);
    await t.run((ctx) => ctx.db.delete(args.attemptId));
    expect(await t.mutation(api.assessments.recover, args)).toBeNull();
    await expect(t.mutation(api.assessments.generateReport, args)).rejects.toThrow("unavailable");
    expect((await t.run((ctx) => ctx.db.query("rateLimits").collect())).some((row) => row.key === key(args.attemptId))).toBe(false);
  });
});
