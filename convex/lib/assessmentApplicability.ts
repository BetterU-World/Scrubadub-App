export type ApplicabilityAnswer = string | string[];
export type ApplicabilityAnswers = Record<string, ApplicabilityAnswer>;
export type ApplicabilityQuestion = {
  applicability?: {
    questionKey: string;
    operator: "equals" | "not_equals" | "includes";
    value: string;
  };
};

/** Canonical evaluator shared by Convex and the public assessment client. */
export function isQuestionApplicable(
  question: ApplicabilityQuestion,
  answers: ApplicabilityAnswers,
): boolean {
  const rule = question.applicability;
  if (!rule) return true;
  const answer = answers[rule.questionKey];
  if (answer === undefined) return false;
  if (rule.operator === "includes")
    return Array.isArray(answer) && answer.includes(rule.value);
  const equals = !Array.isArray(answer) && answer === rule.value;
  return rule.operator === "equals" ? equals : !equals;
}

export function retainApplicableAnswers<
  T extends ApplicabilityQuestion & { key: string },
>(
  questions: readonly T[],
  candidate: ApplicabilityAnswers,
): ApplicabilityAnswers {
  const retained: ApplicabilityAnswers = {};
  for (const question of questions) {
    const answer = candidate[question.key];
    if (answer !== undefined && isQuestionApplicable(question, retained))
      retained[question.key] = answer;
  }
  return retained;
}
