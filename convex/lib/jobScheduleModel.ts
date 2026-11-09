import { v } from "convex/values";

// Jobs store company-local wall time, never ISO/UTC timestamps or offsets.
export const jobScheduleWindow = v.object({ scheduledDate: v.string(), startTime: v.optional(v.string()), durationMinutes: v.number() });
export const jobScheduleChange = v.object({ revision: v.number(), before: jobScheduleWindow, after: jobScheduleWindow, timezone: v.string() });
export type ScheduleWindow = { scheduledDate: string; startTime?: string; durationMinutes: number };
export function scheduleWindow(job: ScheduleWindow): ScheduleWindow {
  return { scheduledDate: job.scheduledDate, startTime: job.startTime || undefined, durationMinutes: job.durationMinutes };
}
export function sameSchedule(a: ScheduleWindow, b: ScheduleWindow) {
  return a.scheduledDate === b.scheduledDate && (a.startTime || undefined) === (b.startTime || undefined) && a.durationMinutes === b.durationMinutes;
}
export function assertSchedule(window: ScheduleWindow) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(window.scheduledDate) ||
      new Date(window.scheduledDate + "T00:00:00Z").toISOString().slice(0, 10) !== window.scheduledDate ||
      (window.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.startTime)) ||
      !Number.isSafeInteger(window.durationMinutes) || window.durationMinutes <= 0) throw new Error("Invalid job schedule");
}
