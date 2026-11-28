import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CalendarSyncTab } from "./CalendarSyncTab";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: mocks.useQuery, useMutation: () => vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ getStaffSessionToken: () => "test-session" }));
vi.mock("@/components/ui/FeedbackProvider", () => ({ useSimpleFeedbackState: () => ["", vi.fn()] }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.parse("2026-10-27T12:00:00Z")); mocks.useQuery.mockReset(); });
afterEach(() => vi.useRealTimers());

function render(connection: Record<string, unknown>, reservations: any[] = [], connected = true) {
  mocks.useQuery.mockReturnValueOnce(connected ? [{ _id: "connection", platform: "other", enabled: true, lastSyncStatus: "empty", lastCheckedAt: Date.now(), consecutiveErrors: 0, ...connection }] : [])
    .mockReturnValueOnce(reservations).mockReturnValueOnce(null);
  return renderToStaticMarkup(createElement(CalendarSyncTab, { propertyId: "property", companyId: "company", userId: "owner", propertyName: "Rental" } as any));
}

describe("empty calendar check presentation", () => {
  it("hides credentials even from a legacy response and sanitizes legacy diagnostics", () => {
    const markup = render({ icalUrl: "https://secret.example.com/private-token?key=secret-query", lastSyncError: "Failed https://secret.example.com/private-token?key=secret-query body-secret" });
    expect(markup).toContain("Private feed URL saved (hidden)");
    expect(markup).toContain("Replace URL");
    expect(markup).not.toContain("private-token"); expect(markup).not.toContain("secret-query"); expect(markup).not.toContain("body-secret");
  });
  it("distinguishes a healthy empty check from authoritative reconciliation", () => {
    const markup = render({ lastSyncAt: Date.now() - 2 * 60 * 60_000 });
    expect(markup).toContain("no events returned");
    expect(markup).toContain("Reservations and jobs were kept unchanged");
    expect(markup).toContain("Automatic checks will continue");
    expect(markup).toContain("Last authoritative reconciliation:");
    expect(markup).toContain("2h ago");
    expect(markup).not.toContain("Sync error");
    expect(markup).not.toContain("Last synced");
  });

  it("does not invent an authoritative success for a never-reconciled connection", () => {
    const markup = render({});
    expect(markup).toContain("No authoritative reconciliation has completed yet");
    expect(markup).not.toContain("Waiting for first sync");
    expect(markup).not.toContain("Sync error");
  });

  it("does not promise polling after an owner disables the connection", () => {
    const markup = render({ enabled: false });
    expect(markup).toContain("Sync is disabled");
    expect(markup).not.toContain("Automatic checks will continue");
  });
});

describe("missing reservation review presentation", () => {
  const missing = () => ({ _id: "reservation", connectionId: "connection", status: "active", checkIn: "2026-10-26", checkOut: "2026-10-27", lastSeenAt: Date.now() - 60 * 60_000,
    summary: "Missing stay", linkedJobId: "linked-job", missing: { episodeId: "episode", firstMissingAt: Date.now() - 30 * 60_000, lastMissingAt: Date.now(), observations: 2 } });

  it("explains absence without claiming cancellation and identifies property, feed and linked job", () => {
    const markup = render({ label: "Primary feed" }, [missing()]);
    expect(markup).toContain("Property: Rental"); expect(markup).toContain("Primary feed (other)");
    expect(markup).toContain("10/26/2026"); expect(markup).toContain("10/27/2026");
    expect(markup).toContain("Not confirmed canceled"); expect(markup).toContain("Last seen:");
    expect(markup).toContain("First missing:"); expect(markup).toContain("Absent from 2 valid nonempty syncs");
    expect(markup).toContain("Acknowledge missing reservation"); expect(markup).toContain('href="/jobs/linked-job"');
    expect(markup).not.toContain(">Cancelled<");
  });

  it("keeps acknowledgement distinct from resolution", () => {
    const res = missing();
    const markup = render({}, [{ ...res, missing: { ...res.missing, acknowledgedAt: Date.now() } }]);
    expect(markup).toContain("Still missing; future observations will continue to be counted");
    expect(markup).not.toContain("Acknowledge missing reservation"); expect(markup).not.toContain(">Cancelled<");
  });

  it("prioritizes an unresolved missing episode ahead of ordinary imports", () => {
    const ordinary = Array.from({ length: 6 }, (_, i) => ({ ...missing(), _id: `normal-${i}`, missing: undefined, summary: `Ordinary ${i}` }));
    const markup = render({}, [...ordinary, missing()]);
    expect(markup).toContain("Missing stay"); expect(markup).toContain("Acknowledge missing reservation");
    expect(markup).not.toContain("Ordinary 5");
  });

  it("keeps retained missing reservations reviewable after feed removal", () => {
    const markup = render({}, [missing()], false);
    expect(markup).toContain("Removed feed"); expect(markup).toContain("Acknowledge missing reservation");
  });

  it("distinguishes explicit provider cancellation from legacy cancellation", () => {
    const res = { ...missing(), missing: undefined, status: "cancelled" };
    const markup = render({}, [{ ...res, cancellationEvidence: { observedAt: Date.now() } }]);
    expect(markup).toContain("Provider explicitly canceled this reservation"); expect(markup).toContain("Linked jobs are unchanged");
    expect(markup).not.toContain("Acknowledge missing reservation");
    const legacy = render({}, [res]);
    expect(legacy).not.toContain("Provider explicitly canceled");
  });
});
