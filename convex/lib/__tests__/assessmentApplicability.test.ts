import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import {
  INITIAL_ASSESSMENT_DEFINITION,
  isApplicable,
} from "../assessmentDefinition";
import { retainApplicableAnswers } from "../assessmentApplicability";
const modules = import.meta.glob("../../**/*.ts");
const backend = () => convexTest(schema, modules);
const token = (seed: number) => seed.toString(16).padStart(64, "0");
const teamQuestions = INITIAL_ASSESSMENT_DEFINITION.questions.filter(
  (q) => q.sectionKey === "team",
);
describe("assessment applicability consistency", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-pepper";
  });
  it("evaluates every conditional question identically for every team-size branch", () => {
    for (const size of ["solo", "2_4", "5_10", "11_25", "26_plus"]) {
      for (const question of teamQuestions)
        expect(isApplicable(question, { "business.team_size": size })).toBe(
          size !== "solo",
        );
    }
  });
  it("atomically accepts locally restored team context before the first conditional response", async () => {
    let seed = 1;
    for (const size of ["2_4", "5_10", "11_25", "26_plus"]) {
      for (const question of teamQuestions) {
        for (const option of question.options!) {
          const t = backend();
          await expect(
            t.mutation((api as any).assessments.start, {
              capability: token(seed++),
              browserKey: token(seed++),
              responseLanguage: "en",
              priorResponses: [
                { questionKey: "business.team_size", answerValue: size },
              ],
              firstResponse: {
                questionKey: question.key,
                answerValue: option.value,
              },
            }),
          ).resolves.toHaveProperty("attemptId");
        }
      }
    }
  });
  it("preserves server rejection for every manually crafted hidden team response", async () => {
    let seed = 1000;
    for (const question of teamQuestions) {
      const t = backend();
      await expect(
        t.mutation((api as any).assessments.start, {
          capability: token(seed++),
          browserKey: token(seed++),
          responseLanguage: "en",
          priorResponses: [
            { questionKey: "business.team_size", answerValue: "solo" },
          ],
          firstResponse: {
            questionKey: question.key,
            answerValue: question.options![0].value,
          },
        }),
      ).rejects.toThrow("not applicable");
    }
  });
  it("discards hidden optimistic answers immediately while preserving applicable answers", () => {
    const candidate = {
      "business.primary_model": "mixed",
      "business.team_size": "solo",
      "team.confirmation": "always_clear",
      "quality.verification": "spot_checks",
    };
    expect(
      retainApplicableAnswers(
        INITIAL_ASSESSMENT_DEFINITION.questions,
        candidate,
      ),
    ).toEqual({
      "business.primary_model": "mixed",
      "business.team_size": "solo",
      "quality.verification": "spot_checks",
    });
  });
  it("repeated branch changes and definition copies cannot resurrect hidden answers", () => {
    let answers: any = {
      "business.team_size": "5_10",
      "team.confirmation": "always_clear",
    };
    for (const size of ["solo", "2_4", "solo", "26_plus", "solo"]) {
      answers = retainApplicableAnswers(
        [...INITIAL_ASSESSMENT_DEFINITION.questions],
        { ...answers, "business.team_size": size },
      );
      expect("team.confirmation" in answers).toBe(false);
    }
    expect(answers).toEqual({ "business.team_size": "solo" });
  });
});
