export const COMMERCIAL_FUTURE_JOB_TERMINAL_STATUSES = new Set([
  "approved",
  "cancelled",
  "denied",
]);

export function currentDateForTimezone(timezone: string | undefined, now = Date.now()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isFutureActiveCommercialJob(job: { scheduledDate: string; status: string }, today: string) {
  return job.scheduledDate >= today && !COMMERCIAL_FUTURE_JOB_TERMINAL_STATUSES.has(job.status);
}
