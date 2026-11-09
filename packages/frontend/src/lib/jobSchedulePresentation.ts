type Window = { scheduledDate: string; startTime?: string; durationMinutes: number };
/** Local wall-clock fields must never be shifted through the browser's timezone. */
export function formatScheduleWindow(window: Window, language: string, timeUnknown: string, minutes: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(window.scheduledDate) || !Number.isFinite(Date.parse(window.scheduledDate + "T00:00:00Z")) ||
      (window.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.startTime)) ||
      !Number.isSafeInteger(window.durationMinutes) || window.durationMinutes <= 0) return timeUnknown;
  const formatter = new Intl.DateTimeFormat(language.startsWith("es") ? "es" : "en", { dateStyle: "medium", timeZone: "UTC" });
  const date = formatter.format(new Date(window.scheduledDate + "T00:00:00Z"));
  if (!window.startTime) return `${date} · ${timeUnknown} · ${window.durationMinutes} ${minutes}`;
  const end = new Date(window.scheduledDate + "T" + window.startTime + ":00Z");
  end.setUTCMinutes(end.getUTCMinutes() + window.durationMinutes);
  if (!Number.isFinite(end.getTime())) return timeUnknown;
  const endDate = formatter.format(end);
  return `${date} · ${window.startTime}–${endDate !== date ? endDate + " " : ""}${end.toISOString().slice(11, 16)} · ${window.durationMinutes} ${minutes}`;
}
