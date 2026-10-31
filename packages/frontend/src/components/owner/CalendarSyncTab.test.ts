import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CalendarSyncTab } from "./CalendarSyncTab";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: mocks.useQuery, useMutation: () => vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ getStaffSessionToken: () => "test-session" }));
vi.mock("@/components/ui/FeedbackProvider", () => ({ useSimpleFeedbackState: () => ["", vi.fn()] }));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.parse("2026-10-27T12:00:00Z")); mocks.useQuery.mockReset(); });
afterEach(() => vi.useRealTimers());

function render(connection: Record<string, unknown>) {
  mocks.useQuery.mockReturnValueOnce([{ _id: "connection", platform: "other", enabled: true, lastSyncStatus: "empty", lastCheckedAt: Date.now(), consecutiveErrors: 0, ...connection }])
    .mockReturnValueOnce([]).mockReturnValueOnce(null);
  return renderToStaticMarkup(createElement(CalendarSyncTab, { propertyId: "property", companyId: "company", userId: "owner", propertyName: "Rental" } as any));
}

describe("empty calendar check presentation", () => {
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
