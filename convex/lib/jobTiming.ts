export const MAX_JOB_PAUSE_CYCLES = 100;
export const MAX_PAUSE_NOTE_LENGTH = 200;

export const PAUSE_REASONS = [
  "break",
  "waiting_for_access",
  "supplies",
  "client_interruption",
  "travel_between_service_areas",
  "equipment_issue",
  "other",
] as const;

export type PauseReason = (typeof PAUSE_REASONS)[number];

export type PauseRecord = {
  pausedAt: number;
  resumedAt?: number;
  durationMs?: number;
};

export type JobTiming = {
  startedAt?: number;
  completedAt?: number;
  currentPauseStartedAt?: number;
  pauseHistory?: PauseRecord[];
};

export function getJobTiming(job: JobTiming, now = Date.now()) {
  if (job.startedAt === undefined) {
    return { elapsedMs: 0, totalPausedMs: 0, activeMs: 0, currentPauseMs: 0 };
  }

  const end = job.completedAt ?? now;
  const elapsedMs = Math.max(0, end - job.startedAt);
  const totalPausedMs = (job.pauseHistory ?? []).reduce((total, pause) => {
    const duration = pause.durationMs ??
      (pause.resumedAt !== undefined ? Math.max(0, pause.resumedAt - pause.pausedAt) : Math.max(0, end - pause.pausedAt));
    return total + duration;
  }, 0);
  const currentPauseMs = job.currentPauseStartedAt === undefined
    ? 0
    : Math.max(0, end - job.currentPauseStartedAt);

  return {
    elapsedMs,
    totalPausedMs,
    activeMs: Math.max(0, elapsedMs - totalPausedMs),
    currentPauseMs,
  };
}

export function normalizePauseNote(reason: PauseReason, note?: string) {
  const normalized = note?.trim();
  if (normalized && normalized.length > MAX_PAUSE_NOTE_LENGTH) {
    throw new Error(`Pause note must be ${MAX_PAUSE_NOTE_LENGTH} characters or fewer`);
  }
  if (reason === "other" && !normalized) throw new Error("A note is required for Other");
  return normalized || undefined;
}
