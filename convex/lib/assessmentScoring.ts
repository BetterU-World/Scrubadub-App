import { isApplicable, type AnswerMap, type AssessmentQuestion } from "./assessmentDefinition";

export const MATURITY_THRESHOLDS = [
  { key: "establishing_foundations", min: 0, max: 39 },
  { key: "building_consistency", min: 40, max: 59 },
  { key: "operating_reliably", min: 60, max: 74 },
  { key: "ready_to_scale", min: 75, max: 89 },
  { key: "operationally_advanced", min: 90, max: 100 },
] as const;

export type ConfidenceLevel = "high" | "moderate" | "limited";
export type ScoringDefinition = {
  definitionVersion: number;
  scoringVersion?: number;
  benchmarkCompatibilityKey: string;
  sections: Array<{ key: string; scoringWeight?: number }>;
  questions: AssessmentQuestion[];
};

export function maturityForScore(score: number) {
  const stage = MATURITY_THRESHOLDS.find((item) => score >= item.min && score <= item.max);
  if (!stage) throw new Error("Operations Score is outside the supported range");
  return stage.key;
}

/**
 * Each applicable scored question is normalized to 0-100 from explicit definition values.
 * Questions are weighted within a section, then applicable section scores are combined using
 * section weights renormalized to 100. This prevents sections with more questions from
 * dominating and removes hidden branches (including Team Communication for solo operators).
 */
export function scoreAssessment(definition: ScoringDefinition, answers: AnswerMap) {
  if (!definition.scoringVersion) throw new Error("Assessment definition is not scoreable");
  const applicableQuestions = definition.questions.filter((question) => isApplicable(question, answers));
  const scoredQuestions = applicableQuestions.filter((question) => question.scoring);
  const sectionResults = definition.sections.flatMap((section) => {
    const questions = scoredQuestions.filter((question) => question.sectionKey === section.key);
    if (!questions.length || !section.scoringWeight) return [];
    let weightedValue = 0;
    let answeredWeight = 0;
    let uncertainCount = 0;
    const considered: string[] = [];
    const responses: string[] = [];
    const positiveEvidence: string[] = [];
    const opportunityEvidence: string[] = [];
    const roadmapCompatibilityKeys = new Set<string>();
    for (const question of questions) {
      considered.push(question.key);
      const answer = answers[question.key];
      if (typeof answer !== "string") continue;
      responses.push(question.key);
      const config = question.scoring!;
      const value = config.optionValues[answer];
      if (config.uncertainValues?.includes(answer) || value === null) {
        uncertainCount++;
        continue;
      }
      if (value === undefined) throw new Error("Response is not valid for scoring");
      weightedValue += value * config.weight;
      answeredWeight += config.weight;
      if (value >= 75) positiveEvidence.push(question.futureScoreKey ?? question.key);
      if (value <= 40) opportunityEvidence.push(question.futureScoreKey ?? question.key);
      for (const key of question.futureRoadmapDomains ?? []) roadmapCompatibilityKeys.add(key);
    }
    const score = answeredWeight ? Math.round(weightedValue / answeredWeight) : 0;
    return [{
      sectionKey: section.key,
      score,
      applicableWeight: section.scoringWeight,
      questionsConsidered: considered,
      responsesConsidered: responses,
      positiveEvidenceIds: positiveEvidence,
      opportunityEvidenceIds: opportunityEvidence,
      roadmapCompatibilityKeys: [...roadmapCompatibilityKeys].sort(),
      uncertainCount,
    }];
  });
  const totalWeight = sectionResults.reduce((sum, section) => sum + section.applicableWeight, 0);
  const operationsScore = totalWeight
    ? Math.round(sectionResults.reduce((sum, section) => sum + section.score * section.applicableWeight, 0) / totalWeight)
    : 0;
  const applicableQuestionCount = scoredQuestions.length;
  const answeredScoredQuestionCount = scoredQuestions.filter((question) => typeof answers[question.key] === "string").length;
  const scorableAnswerCount = sectionResults.reduce((sum, section) => sum + section.responsesConsidered.length - section.uncertainCount, 0);
  const coverageScore = applicableQuestionCount ? Math.round(scorableAnswerCount * 100 / applicableQuestionCount) : 0;
  const thinSections = sectionResults.filter((section) => section.responsesConsidered.length - section.uncertainCount < Math.min(2, section.questionsConsidered.length)).map((section) => section.sectionKey);
  const uncertainCount = sectionResults.reduce((sum, section) => sum + section.uncertainCount, 0);
  const claimedGrowthStage = answers["business.growth_stage"];
  const contradictoryPatternCount = typeof claimedGrowthStage === "string"
    && ["scaling", "optimizing"].includes(claimedGrowthStage)
    && operationsScore < 60 ? 1 : 0;
  const reasonKeys: string[] = [];
  if (coverageScore < 100) reasonKeys.push("incomplete_scored_coverage");
  if (uncertainCount) reasonKeys.push("uncertain_responses");
  if (thinSections.length) reasonKeys.push("thin_section_evidence");
  if (contradictoryPatternCount) reasonKeys.push("contradictory_pattern");
  const confidence: ConfidenceLevel = coverageScore === 100 && !thinSections.length && !contradictoryPatternCount
    ? "high"
    : coverageScore >= 85 && thinSections.length <= 1 && contradictoryPatternCount <= 1
      ? "moderate"
      : "limited";
  return {
    operationsScore,
    maturityKey: maturityForScore(operationsScore),
    confidence,
    confidenceMetadata: {
      coverageScore,
      reasonKeys,
      categoryCoverage: sectionResults.map((section) => ({
        categoryKey: section.sectionKey,
        coverageScore: section.questionsConsidered.length
          ? Math.round((section.responsesConsidered.length - section.uncertainCount) * 100 / section.questionsConsidered.length)
          : 0,
      })),
      uncertainResponseCount: uncertainCount,
      thinSectionKeys: thinSections,
      contradictoryPatternCount,
    },
    sectionResults: sectionResults.map(({ uncertainCount: _uncertainCount, ...section }) => section),
    applicableSectionIds: sectionResults.map((section) => section.sectionKey),
    applicableQuestionCount,
    answeredScoredQuestionCount,
    evidenceIds: [...new Set(sectionResults.flatMap((section) => [...section.positiveEvidenceIds, ...section.opportunityEvidenceIds]))].sort(),
  };
}
