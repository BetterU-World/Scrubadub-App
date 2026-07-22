export const ASSESSMENT_LIMITS = {
  creation: { limit: 30, windowMs: 60 * 60 * 1000 },
  responseWrite: { limit: 240, windowMs: 10 * 60 * 1000 },
  completion: { limit: 10, windowMs: 60 * 1000 },
  reportGeneration: { limit: 10, windowMs: 60 * 1000 },
  roadmapGeneration: { limit: 10, windowMs: 60 * 1000 },
} as const;

export function sameNormalizedResponse(
  existing: { responseKind: string; answerValue?: string; answerValues?: string[]; qualitativeText?: string } | null,
  normalized: { responseKind: string; answerValue?: string; answerValues?: string[]; qualitativeText?: string },
): boolean {
  if (!existing || existing.responseKind !== normalized.responseKind) return false;
  if (normalized.responseKind === "single") return existing.answerValue === normalized.answerValue;
  if (normalized.responseKind === "qualitative") return existing.qualitativeText === normalized.qualitativeText;
  return JSON.stringify(existing.answerValues ?? []) === JSON.stringify(normalized.answerValues ?? []);
}
