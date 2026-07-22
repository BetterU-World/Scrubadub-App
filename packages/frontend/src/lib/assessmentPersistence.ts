export const ASSESSMENT_PROGRESS_KEY = "scrub_operations_assessment_v1";
export const ASSESSMENT_BROWSER_KEY = "scrub_assessment_browser_key";

export interface LocalAssessmentProgress {
  attemptId?: string;
  capability?: string;
  answers: Record<string, string | string[]>;
  currentQuestionKey?: string;
  language: "en" | "es";
  lastActivityAt: number;
}

export function randomHex(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function getBrowserKey(storage: Storage = localStorage): string {
  const existing = storage.getItem(ASSESSMENT_BROWSER_KEY);
  if (existing && /^[a-f0-9]{64}$/i.test(existing)) return existing;
  const created = randomHex();
  storage.setItem(ASSESSMENT_BROWSER_KEY, created);
  return created;
}

export function loadProgress(storage: Storage = localStorage): LocalAssessmentProgress | null {
  try {
    const raw = storage.getItem(ASSESSMENT_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalAssessmentProgress>;
    if (!parsed.answers || typeof parsed.answers !== "object" || (parsed.language !== "en" && parsed.language !== "es")) return null;
    return { answers: parsed.answers, language: parsed.language, attemptId: parsed.attemptId, capability: parsed.capability, currentQuestionKey: parsed.currentQuestionKey, lastActivityAt: Number(parsed.lastActivityAt) || 0 };
  } catch {
    return null;
  }
}

export function saveProgress(progress: LocalAssessmentProgress, storage: Storage = localStorage): void {
  try { storage.setItem(ASSESSMENT_PROGRESS_KEY, JSON.stringify(progress)); } catch { /* local persistence unavailable */ }
}

export function clearProgress(storage: Storage = localStorage): void {
  try { storage.removeItem(ASSESSMENT_PROGRESS_KEY); } catch { /* local persistence unavailable */ }
}
