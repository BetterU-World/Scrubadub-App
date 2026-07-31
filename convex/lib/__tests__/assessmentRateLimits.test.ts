import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { ASSESSMENT_LIMITS } from "../assessmentRateLimits";
import { INITIAL_ASSESSMENT_DEFINITION, isApplicable } from "../assessmentDefinition";

const modules = import.meta.glob("../../**/*.ts");
const assessmentApi = (api as any).assessments;
const continuityApi = (api as any).assessmentContinuity;
const token = (seed: number) => seed.toString(16).padStart(64, "0");
const backend = () => convexTest(schema, modules);

describe("assessment rate-limit policy", () => {
  beforeEach(() => { process.env.TOKEN_PEPPER = "test-pepper"; });

  it("does not charge idempotent start retries or identical answer submissions", async () => {
    const t = backend();
    const args = { capability: token(1), browserKey: token(2), responseLanguage: "en", firstResponse: { questionKey: "business.primary_model", answerValue: "mixed" } };
    const created = await t.mutation(assessmentApi.start, args);
    for (let index = 0; index < 40; index++) expect(await t.mutation(assessmentApi.start, args)).toEqual(created);
    const response = { attemptId: created.attemptId, capability: token(1), responseLanguage: "en", response: { questionKey: "business.team_size", answerValue: "5_10" } };
    await t.mutation(assessmentApi.saveResponse, response);
    for (let index = 0; index < 300; index++) await t.mutation(assessmentApi.saveResponse, response);
    const rows = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(rows.find((row) => row.key.includes("response-write"))?.count).toBe(1);
    expect(rows.find((row) => row.key.includes("creation"))?.count).toBe(1);
  });

  it("keeps one assessment and one start event across creation retries", async () => {
    const t = backend();
    const capability = token(3);
    const args = { capability, browserKey: token(4), responseLanguage: "en" as const, firstResponse: { questionKey: "business.primary_model", answerValue: "mixed" } };
    const created = await t.mutation(assessmentApi.start, args);

    expect(await t.mutation(assessmentApi.start, args)).toEqual(created);
    await t.mutation(assessmentApi.recover, { attemptId: created.attemptId, capability });
    await t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability, responseLanguage: "en", response: { questionKey: "business.team_size", answerValue: "5_10" } });

    const beforeCompletion = await t.run(async (ctx) => ({
      attempts: await ctx.db.query("assessmentAttempts").collect(),
      starts: (await ctx.db.query("assessmentEvents").collect()).filter((event) => event.eventKey === "assessment_started"),
    }));
    expect(beforeCompletion.attempts).toHaveLength(1);
    expect(beforeCompletion.starts).toHaveLength(1);
  });

  it("keeps resume and analytics outside the response-write bucket and isolates attempts", async () => {
    const t = backend();
    for (const seed of [10, 20]) {
      const capability = token(seed);
      const created = await t.mutation(assessmentApi.start, { capability, browserKey: token(seed + 1), responseLanguage: "en", firstResponse: { questionKey: "business.primary_model", answerValue: "mixed" } });
      for (let index = 0; index < 20; index++) await t.mutation(assessmentApi.recover, { attemptId: created.attemptId, capability });
      await t.mutation(continuityApi.recordEvent, { attemptId: created.attemptId, eventKey: "assessment_viewed", deduplicationKey: `test-${seed}`, language: "en" });
      await t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability, responseLanguage: "en", response: { questionKey: "business.team_size", answerValue: "5_10" } });
    }
    const rows = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(rows.filter((row) => row.key.includes("response-write"))).toHaveLength(2);
    expect(rows.filter((row) => row.key.includes("response-write")).every((row) => row.count === 1)).toBe(true);
    expect(rows.find((row) => row.key === "assessment:event:global")?.count).toBe(2);
  });

  it("allows a generous correction budget but rejects an actual response flood", async () => {
    const t = backend();
    const capability = token(100);
    const created = await t.mutation(assessmentApi.start, { capability, browserKey: token(101), responseLanguage: "en", firstResponse: { questionKey: "business.primary_model", answerValue: "mixed" } });
    const values = ["solo", "2_4", "5_10", "11_25", "26_plus"];
    for (let index = 0; index < ASSESSMENT_LIMITS.responseWrite.limit; index++) {
      await t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability, responseLanguage: "en", response: { questionKey: "business.team_size", answerValue: values[index % values.length] } });
    }
    await expect(t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability, responseLanguage: "en", response: { questionKey: "business.team_size", answerValue: "solo" } })).rejects.toThrow("Rate limit");
  });

  it("completes the longest team path with backtracking, branch changes, resume, report, and roadmap", async () => {
    const t = backend();
    const capability = token(500);
    const created = await t.mutation(assessmentApi.start, { capability, browserKey: token(501), responseLanguage: "en", firstResponse: { questionKey: "business.team_size", answerValue: "solo" } });
    for (const teamSize of ["5_10", "solo", "26_plus"]) {
      await t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability, responseLanguage: "en", response: { questionKey: "business.team_size", answerValue: teamSize } });
    }
    const answers: Record<string, string> = { "business.team_size": "26_plus" };
    for (const question of INITIAL_ASSESSMENT_DEFINITION.questions) {
      if (!question.required || question.key === "business.team_size" || !isApplicable(question, answers)) continue;
      const answerValue = question.options![0].value;
      answers[question.key] = answerValue;
      await t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability, responseLanguage: "en", response: { questionKey: question.key, answerValue } });
    }
    for (const key of ["business.primary_model", "scheduling.primary_method"]) {
      const question = INITIAL_ASSESSMENT_DEFINITION.questions.find((item) => item.key === key)!;
      const answerValue = question.options![1].value;
      answers[key] = answerValue;
      await t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability, responseLanguage: "en", response: { questionKey: key, answerValue } });
    }
    expect(await t.mutation(assessmentApi.recover, { attemptId: created.attemptId, capability })).not.toBeNull();
    await t.mutation(assessmentApi.complete, { attemptId: created.attemptId, capability });
    const report = await t.mutation(assessmentApi.generateReport, { attemptId: created.attemptId, capability });
    const roadmap = await t.mutation(assessmentApi.generateRoadmap, { attemptId: created.attemptId, capability });
    expect(report.payload.branchContext.soloOperator).toBe(false);
    expect(roadmap.payload.stages).toBeTruthy();
  });
});
