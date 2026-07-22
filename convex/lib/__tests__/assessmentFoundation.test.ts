import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { INITIAL_ASSESSMENT_DEFINITION, assertDefinitionMutable, isApplicable, sanitizeQualitativeText, validateDefinition } from "../assessmentDefinition";

const modules = import.meta.glob("../../**/*.ts");
const backend = () => convexTest(schema, modules);
const assessmentApi = (api as any).assessments;
const token = (character: string) => character.repeat(64);

describe("operations assessment foundation", () => {
  beforeEach(() => { process.env.TOKEN_PEPPER = "test-token-pepper"; });

  it("ships one valid immutable published definition with the approved inventory", () => {
    expect(validateDefinition()).toEqual([]);
    expect(INITIAL_ASSESSMENT_DEFINITION.sections.map((section) => section.key)).toEqual([
      "business", "scheduling", "team", "quality", "client", "financial", "growth", "perspective",
    ]);
    expect(INITIAL_ASSESSMENT_DEFINITION.questions).toHaveLength(32);
    expect(INITIAL_ASSESSMENT_DEFINITION.questions.filter((question) => question.qualitative)).toHaveLength(2);
    expect(INITIAL_ASSESSMENT_DEFINITION.questions.filter((question) => question.required)).toHaveLength(30);
    expect(() => assertDefinitionMutable("published")).toThrow("immutable");
    expect(() => assertDefinitionMutable("draft")).not.toThrow();
  });

  it("applies solo branching from the frozen manifest", () => {
    const teamQuestion = INITIAL_ASSESSMENT_DEFINITION.questions.find((question) => question.key === "team.confirmation")!;
    expect(isApplicable(teamQuestion, { "business.team_size": "solo" })).toBe(false);
    expect(isApplicable(teamQuestion, { "business.team_size": "5_10" })).toBe(true);
  });

  it("creates no empty attempt and idempotently creates the initial definition", async () => {
    const t = backend();
    const first = await t.mutation(assessmentApi.prepare, {});
    const second = await t.mutation(assessmentApi.prepare, {});
    expect(first._id).toBe(second._id);
    await expect(t.mutation(assessmentApi.start, {
      capability: token("a"), browserKey: token("b"), responseLanguage: "en",
      firstResponse: { questionKey: "perspective.pride", qualitativeText: "Proud" },
    })).rejects.toThrow("substantive");
    expect(await t.run((ctx) => ctx.db.query("assessmentAttempts").collect())).toHaveLength(0);
  });

  it("validates options, protects capabilities, and upserts one response per question", async () => {
    const t = backend();
    const created = await t.mutation(assessmentApi.start, {
      capability: token("a"), browserKey: token("b"), responseLanguage: "en",
      firstResponse: { questionKey: "business.primary_model", answerValue: "residential" },
    });
    await expect(t.mutation(assessmentApi.saveResponse, {
      attemptId: created.attemptId, capability: token("c"), responseLanguage: "en",
      response: { questionKey: "business.team_size", answerValue: "solo" },
    })).rejects.toThrow("unavailable");
    await expect(t.mutation(assessmentApi.saveResponse, {
      attemptId: created.attemptId, capability: token("a"), responseLanguage: "en",
      response: { questionKey: "business.team_size", answerValue: "invalid" },
    })).rejects.toThrow("Invalid answer option");
    for (const value of ["mixed", "commercial"]) {
      await t.mutation(assessmentApi.saveResponse, {
        attemptId: created.attemptId, capability: token("a"), responseLanguage: "en",
        response: { questionKey: "business.primary_model", answerValue: value },
      });
    }
    const rows = await t.run((ctx) => ctx.db.query("assessmentResponses").withIndex("by_attemptId", (q) => q.eq("attemptId", created.attemptId)).collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].answerValue).toBe("commercial");
  });

  it("removes dependent team answers when the participant changes to solo", async () => {
    const t = backend();
    const created = await t.mutation(assessmentApi.start, { capability: token("d"), browserKey: token("e"), responseLanguage: "en", firstResponse: { questionKey: "business.team_size", answerValue: "5_10" } });
    await t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability: token("d"), responseLanguage: "en", response: { questionKey: "team.confirmation", answerValue: "usually_clear" } });
    await t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability: token("d"), responseLanguage: "en", response: { questionKey: "business.team_size", answerValue: "solo" } });
    const rows = await t.run((ctx) => ctx.db.query("assessmentResponses").withIndex("by_attemptId", (q) => q.eq("attemptId", created.attemptId)).collect());
    expect(rows.map((row) => row.questionKey)).toEqual(["business.team_size"]);
  });

  it("sanitizes and bounds qualitative text", () => {
    expect(sanitizeQualitativeText("  proud\u0000 of my team  ")).toBe("proud of my team");
    expect(sanitizeQualitativeText("x".repeat(2000))).toHaveLength(1500);
  });

  it("requires every applicable required response before completion", async () => {
    const t = backend();
    const created = await t.mutation(assessmentApi.start, { capability: token("f"), browserKey: token("1"), responseLanguage: "es", firstResponse: { questionKey: "business.team_size", answerValue: "solo" } });
    await expect(t.mutation(assessmentApi.complete, { attemptId: created.attemptId, capability: token("f") })).rejects.toThrow("required");
  });

  it("completes a solo assessment while allowing optional reflections to remain skipped", async () => {
    const t = backend();
    const capability = token("8");
    const answers: Record<string, string> = { "business.team_size": "solo" };
    const created = await t.mutation(assessmentApi.start, { capability, browserKey: token("7"), responseLanguage: "en", firstResponse: { questionKey: "business.team_size", answerValue: "solo" } });
    for (const question of INITIAL_ASSESSMENT_DEFINITION.questions) {
      if (!question.required || question.key === "business.team_size" || !isApplicable(question, answers)) continue;
      const answerValue = question.options![0].value;
      answers[question.key] = answerValue;
      await t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability, responseLanguage: "en", response: { questionKey: question.key, answerValue } });
    }
    const firstResult = await t.mutation(assessmentApi.complete, { attemptId: created.attemptId, capability });
    const repeatedResult = await t.mutation(assessmentApi.complete, { attemptId: created.attemptId, capability });
    expect(firstResult).toMatchObject({ definitionVersion: 2, confidenceKey: "high" });
    expect(repeatedResult).toEqual(firstResult);
    await expect(t.mutation(assessmentApi.saveResponse, { attemptId: created.attemptId, capability, responseLanguage: "en", response: { questionKey: "business.primary_model", answerValue: "commercial" } })).rejects.toThrow("cannot be changed");
    const attempt = await t.run((ctx) => ctx.db.get(created.attemptId));
    expect(attempt).toMatchObject({ status: "completed", requiredApplicableCount: 26, requiredAnsweredCount: 26, optionalAnsweredCount: 0 });
    expect(attempt?.completedAt).toBe(firstResult.completedAt);
    await expect(t.mutation(assessmentApi.generateReport, { attemptId: created.attemptId, capability: token("6") })).rejects.toThrow("unavailable");
    const firstReport = await t.mutation(assessmentApi.generateReport, { attemptId: created.attemptId, capability });
    const repeatedReport = await t.mutation(assessmentApi.generateReport, { attemptId: created.attemptId, capability });
    expect(repeatedReport).toEqual(firstReport);
    expect(firstReport.payload.branchContext.soloOperator).toBe(true);
    expect(firstReport.payload.scorecard.map((item: any) => item.sectionKey)).not.toContain("team");
    await t.run(async (ctx) => {
      const definition = await ctx.db.get(attempt!.definitionId);
      await ctx.db.patch(attempt!.definitionId, { definitionVersion: 2, questions: definition!.questions.map((question) => ({ ...question, scoring: question.scoring ? { ...question.scoring, optionValues: Object.fromEntries(Object.keys(question.scoring.optionValues).map((key) => [key, 100])) } : undefined })) });
    });
    expect(await t.mutation(assessmentApi.complete, { attemptId: created.attemptId, capability })).toEqual(firstResult);
  });

  it("rejects completion for expired attempts and invalid capabilities", async () => {
    const t = backend();
    const created = await t.mutation(assessmentApi.start, { capability: token("2"), browserKey: token("3"), responseLanguage: "en", firstResponse: { questionKey: "business.team_size", answerValue: "solo" } });
    await expect(t.mutation(assessmentApi.complete, { attemptId: created.attemptId, capability: token("4") })).rejects.toThrow("unavailable");
    await t.run((ctx) => ctx.db.patch(created.attemptId, { expiresAt: Date.now() - 1 }));
    await expect(t.mutation(assessmentApi.complete, { attemptId: created.attemptId, capability: token("2") })).rejects.toThrow("expired");
    await expect(t.mutation(assessmentApi.generateReport, { attemptId: created.attemptId, capability: token("2") })).rejects.toThrow("expired");
  });

  it("rate limits repeated attempt creation per browser key", async () => {
    const t = backend();
    for (let index = 0; index < 10; index++) {
      await t.mutation(assessmentApi.start, { capability: index.toString(16).padStart(64, "0"), browserKey: token("9"), responseLanguage: "en", firstResponse: { questionKey: "business.primary_model", answerValue: "mixed" } });
    }
    await expect(t.mutation(assessmentApi.start, { capability: "a".repeat(63) + "b", browserKey: token("9"), responseLanguage: "en", firstResponse: { questionKey: "business.primary_model", answerValue: "mixed" } })).rejects.toThrow("Rate limit");
  });
});
