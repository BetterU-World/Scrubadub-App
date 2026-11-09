import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { formatScheduleWindow } from "../../lib/jobSchedulePresentation";
const state = vi.hoisted(() => ({ language: "en", notifications: [] as any[] }));
vi.mock("convex/react", () => ({ useQuery: () => state.notifications, useMutation: () => vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { _id: "worker", role: "cleaner" } }), getStaffSessionToken: () => "session" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: state.language }, t: (key: string, args?: any) => {
  const copy = state.language === "es" ? es : en;
  const value = key.split(".").reduce((obj: any, part) => obj?.[part], copy) ?? key;
  return typeof value === "string" ? value.replace("{{timezone}}", args?.timezone ?? "") : key;
} }) }));
vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/ui/LoadingSpinner", () => ({ PageLoader: () => null }));
vi.mock("@/components/ui/EmptyState", () => ({ EmptyState: () => null }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => createElement("a", { href, className }, children) }));
import { NotificationsPage } from "./NotificationsPage";
beforeEach(() => { state.language = "en"; state.notifications = [{ _id: "n", _creationTime: 1, read: false, type: "job_schedule_changed", title: "backend fallback", message: "backend body", relatedJobId: "job-1", scheduleLabel: "Authorized property", scheduleChange: { revision: 1, timezone: "America/New_York", before: { scheduledDate: "2030-01-02", startTime: "23:00", durationMinutes: 120 }, after: { scheduledDate: "2030-01-03", startTime: "09:00", durationMinutes: 90 } } }]; });
describe("worker schedule change presentation", () => {
  it.each(["en", "es"])("renders %s localized old/new schedule, timezone and mobile worker route", language => {
    state.language = language; const copy = language === "es" ? es : en;
    const html = renderToStaticMarkup(createElement(NotificationsPage));
    expect(html).toContain(copy.scheduleChange.title); expect(html).toContain(copy.scheduleChange.previous); expect(html).toContain(copy.scheduleChange.updated);
    expect(html).toContain("Authorized property"); expect(html).toContain("America/New_York");
    expect(html).toContain("09:00–10:30"); expect(html).toContain('href="/jobs/job-1"');
    expect(html).toContain("touch-target"); expect(html).toContain("flex-wrap"); expect(html).toContain("break-words");
    expect(html).not.toContain("backend fallback"); expect(html).not.toContain("backend body");
  });
  it("handles date-only work, overnight duration and browser timezone equivalence", () => {
    const window = { scheduledDate: "2030-01-02", startTime: "23:00", durationMinutes: 120 };
    const expected = formatScheduleWindow(window, "en", "No start", "min");
    for (const timezone of ["Pacific/Honolulu", "Asia/Tokyo", "UTC"]) { vi.stubEnv("TZ", timezone); expect(formatScheduleWindow(window, "en", "No start", "min")).toBe(expected); }
    vi.unstubAllEnvs(); expect(expected).toContain("23:00–Jan 3, 2030 01:00");
    expect(formatScheduleWindow({ ...window, startTime: undefined }, "es", "Sin hora", "min")).toContain("Sin hora");
    expect(formatScheduleWindow({ ...window, scheduledDate: "bad" }, "en", "Unavailable", "min")).toBe("Unavailable");
  });
  it("does not reconstruct filtered job details or navigation", () => {
    state.notifications = [];
    const html = renderToStaticMarkup(createElement(NotificationsPage)); expect(html).not.toContain("Authorized property"); expect(html).not.toContain("/jobs/job-1");
  });
  it("keeps EN/ES keys in parity", () => { expect(Object.keys(en.scheduleChange).sort()).toEqual(Object.keys(es.scheduleChange).sort()); });
});
