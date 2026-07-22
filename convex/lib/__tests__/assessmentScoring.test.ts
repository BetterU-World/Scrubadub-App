import { describe, expect, it } from "vitest";
import { INITIAL_ASSESSMENT_DEFINITION, isApplicable, type AnswerMap } from "../assessmentDefinition";
import { MATURITY_THRESHOLDS, maturityForScore, scoreAssessment } from "../assessmentScoring";

function answersAt(position: "first" | "last", teamSize = "5_10"): AnswerMap {
  const answers: AnswerMap = { "business.team_size": teamSize };
  for (const question of INITIAL_ASSESSMENT_DEFINITION.questions) {
    if (!isApplicable(question, answers) || !question.options?.length) continue;
    const scoredOptions = question.scoring
      ? question.options.filter((option) => question.scoring!.optionValues[option.value] !== null)
          .sort((a, b) => (question.scoring!.optionValues[a.value] ?? 0) - (question.scoring!.optionValues[b.value] ?? 0))
      : question.options;
    answers[question.key] = scoredOptions[position === "first" ? 0 : scoredOptions.length - 1].value;
  }
  answers["business.team_size"] = teamSize;
  return answers;
}

describe("operations assessment scoring", () => {
  it("is deterministic and reaches the expected endpoints", () => {
    const weak = scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, answersAt("first"));
    const repeated = scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, answersAt("first"));
    const strong = scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, answersAt("last"));
    expect(repeated).toEqual(weak);
    expect(weak.operationsScore).toBe(0);
    expect(strong.operationsScore).toBe(100);
  });

  it("excludes solo Team Communication and renormalizes applicable weights", () => {
    const team = scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, answersAt("last"));
    const solo = scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, answersAt("last", "solo"));
    expect(team.applicableSectionIds).toContain("team");
    expect(solo.applicableSectionIds).not.toContain("team");
    expect(solo.operationsScore).toBe(100);
  });

  it("ignores hidden, profile, and reflection responses", () => {
    const answers = answersAt("last", "solo");
    const baseline = scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, answers);
    const changed = scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, {
      ...answers,
      "business.primary_model": "commercial",
      "growth.primary_objective": "more_clients",
      "perspective.pride": "Different prose",
      "team.confirmation": "rarely_clear",
    });
    expect(changed.operationsScore).toBe(baseline.operationsScore);
  });

  it("uses explicit reverse-direction values and treats uncertainty as confidence evidence", () => {
    const fragmented = answersAt("last");
    fragmented["growth.fragmentation"] = "mostly_messages_paper";
    const consolidated = { ...fragmented, "growth.fragmentation": "one_system" };
    const uncertain = { ...fragmented, "growth.fragmentation": "uncertain" };
    expect(scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, consolidated).operationsScore)
      .toBeGreaterThan(scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, fragmented).operationsScore);
    const result = scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, uncertain);
    expect(result.confidence).toBe("moderate");
    expect(result.confidenceMetadata.reasonKeys).toContain("uncertain_responses");
  });

  it("classifies high, moderate, and limited confidence deterministically", () => {
    expect(scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, answersAt("last")).confidence).toBe("high");
    const moderate = answersAt("last");
    moderate["growth.fragmentation"] = "uncertain";
    expect(scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, moderate).confidence).toBe("moderate");
    expect(scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, { "business.team_size": "solo", "business.growth_stage": "growing" }).confidence).toBe("limited");
    const contradictory = answersAt("first");
    contradictory["business.growth_stage"] = "optimizing";
    expect(scoreAssessment(INITIAL_ASSESSMENT_DEFINITION, contradictory).confidenceMetadata.reasonKeys).toContain("contradictory_pattern");
  });

  it("maps every integer score to exactly one maturity stage", () => {
    expect(MATURITY_THRESHOLDS).toHaveLength(5);
    for (let score = 0; score <= 100; score++) {
      expect(MATURITY_THRESHOLDS.filter((stage) => score >= stage.min && score <= stage.max)).toHaveLength(1);
      expect(maturityForScore(score)).toBeTruthy();
    }
  });
});
