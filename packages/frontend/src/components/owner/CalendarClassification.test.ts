// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { CalendarSyncTab } from "./CalendarSyncTab";

const mocks = vi.hoisted(() => ({ query: vi.fn(), classify: vi.fn(), acknowledge: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: (...args: any[]) => mocks.query(...args), useMutation: (ref: any) => getFunctionName(ref).endsWith(":confirmEventClassification") ? mocks.classify : mocks.acknowledge }));
vi.mock("@/hooks/useAuth", () => ({ getStaffSessionToken: () => "test-session" }));
vi.mock("@/components/ui/FeedbackProvider", () => ({ useSimpleFeedbackState: () => ["", vi.fn()] }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));

let container: HTMLDivElement;
let root: Root;
const event = () => ({ _id: "reservation", connectionId: "connection", status: "active", summary: "Reserved", checkIn: "2026-10-26", checkOut: "2026-10-27", lastSeenAt: Date.now(), eventVersion: "0:version", eventMetadata: { status: "CONFIRMED" },
  classification: { kind: "needs_review", source: "unverified_ical", reason: "insufficient_verified_evidence", classifiedAt: Date.now(), revision: 1 } });
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.query.mockReset(); mocks.classify.mockReset(); mocks.acknowledge.mockReset();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function render(rows: any[] = [event()]) {
  mocks.query.mockImplementation((ref: any) => getFunctionName(ref).includes("calendarConnections")
    ? [{ _id: "connection", platform: "airbnb", label: "Rental feed", enabled: true, lastSyncStatus: "success", lastSyncAt: Date.now() }]
    : getFunctionName(ref).includes("calendarReservations") ? rows : null);
  await act(async () => root.render(createElement(CalendarSyncTab, { propertyId: "property", companyId: "company", userId: "owner", propertyName: "Rental" } as any)));
}
function button(label: string) { return [...container.querySelectorAll("button")].find(node => node.textContent === label)!; }

describe("owner classification controls", () => {
  it("uses focusable native controls and submits the displayed evidence revision", async () => {
    mocks.classify.mockResolvedValueOnce({ outcome: "created", linkedJobId: "job", manualJobReviewRequired: false });
    await render();
    const guest = button("Confirm guest reservation"); guest.focus();
    expect(document.activeElement).toBe(guest); expect(guest.type).toBe("button");
    expect(guest.classList.contains("min-h-11")).toBe(true);
    expect(guest.parentElement!.classList.contains("flex-wrap")).toBe(true);
    expect(container.textContent).toContain("Unverified iCal evidence");
    expect(container.textContent).toContain("Needs classification — no automatic job");
    await act(async () => guest.click());
    expect(mocks.classify).toHaveBeenCalledWith(expect.objectContaining({ sessionToken: "test-session", reservationId: "reservation", kind: "guest_reservation", expectedEventVersion: "0:version", expectedRevision: 1, expectedFeedRevision: 0 }));
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("An unassigned cleaning job was created");
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    await render([{ ...event(), eventVersion: "0:changed-version" }]);
    expect(container.textContent).not.toContain("Guest confirmed.");
  });

  it("prevents duplicate clicks while a decision is pending", async () => {
    let release!: (result: any) => void;
    mocks.classify.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    await render();
    await act(async () => button("Confirm guest reservation").click());
    expect(button("Confirm guest reservation").disabled).toBe(true);
    expect(button("Confirm non-guest block").disabled).toBe(true);
    await act(async () => button("Confirm guest reservation").click());
    expect(mocks.classify).toHaveBeenCalledTimes(1);
    await act(async () => release({ outcome: "not_eligible", skipReason: "automation_rules_disabled", manualJobReviewRequired: false }));
    expect(container.textContent).toContain("No new job: automation rules disabled");
  });

  it("reports a stale decision error without claiming confirmation", async () => {
    mocks.classify.mockRejectedValueOnce(new Error("Event or review state changed. Refresh and review again."));
    await render(); await act(async () => button("Confirm guest reservation").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("changed");
    expect(container.textContent).not.toContain("Guest confirmed.");
    expect(button("Confirm guest reservation").disabled).toBe(false);
  });

  it("warns that classifying a linked job as non-guest requires separate operational review", async () => {
    mocks.classify.mockResolvedValueOnce({ outcome: "already_linked", manualJobReviewRequired: true });
    await render([{ ...event(), linkedJobId: "job" }]);
    await act(async () => button("Confirm non-guest block").click());
    expect(container.textContent).toContain("Existing job retained; review that job separately");
    expect(container.querySelector('a[href="/jobs/job"]')).not.toBeNull();
  });

  it("keeps classification separate from missing acknowledgement", async () => {
    mocks.acknowledge.mockResolvedValueOnce("acknowledged");
    await render([{ ...event(), missing: { episodeId: "missing", observations: 2, firstMissingAt: Date.now(), lastMissingAt: Date.now() } }]);
    await act(async () => button("Acknowledge missing reservation").click());
    expect(mocks.classify).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Needs classification — no automatic job");
  });

  it("shows all unresolved attention items, including classification and operational flags", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ ...event(), _id: `event-${i}`, summary: `Review ${i}` }));
    rows.push({ ...event(), _id: "date-conflict", summary: "Changed job dates", classification: undefined as any, dateConflict: true } as any);
    rows.push({ ...event(), _id: "block-job", summary: "Block with existing work", classification: { kind: "non_guest_block", source: "owner" }, linkedJobId: "existing-job" } as any);
    await render(rows);
    for (let i = 0; i < 8; i++) expect(container.textContent).toContain(`Review ${i}`);
    expect(container.textContent).toContain("Changed job dates");
    expect(container.textContent).toContain("Block with existing work");
    expect(container.textContent).toContain("It was not canceled or deleted. Review that job separately");
    expect(container.querySelector(".sm\\:flex-row")).not.toBeNull();
  });

  it("retains previous owner evidence while requiring renewed review", async () => {
    const row = event();
    await render([{ ...row, classification: { ...row.classification, reason: "material_event_changed", ownerDecision: { kind: "guest_reservation", actorId: "owner", confirmedAt: Date.now() } } }]);
    expect(container.textContent).toContain("Previous owner decision: guest reservation");
    expect(container.textContent).toContain("Renewed owner review is required");
  });

  it("requires a current feed observation before classifying legacy data", async () => {
    await render([{ ...event(), classification: undefined, eventVersion: undefined }]);
    expect(container.textContent).toContain("Legacy import — classification unconfirmed");
    expect(container.textContent).toContain("Sync this feed before confirming classification");
    expect(button("Confirm guest reservation")).toBeUndefined();
  });

  it.each(["identity", "dates"])("holds guest confirmation while %s review is pending", async kind => {
    await render([{ ...event(), ...(kind === "identity"
      ? { identityReview: { state: "pending", revision: 1, candidateIds: [], reasons: [], incomplete: false } }
      : { dateReview: { state: "pending", previousCheckIn: "2026-10-25", previousCheckOut: "2026-10-26", proposedCheckIn: "2026-10-26", proposedCheckOut: "2026-10-27" } }) }]);
    expect(button("Confirm guest reservation").disabled).toBe(true);
    expect(button("Confirm non-guest block").disabled).toBe(false);
    await act(async () => button("Confirm guest reservation").click()); expect(mocks.classify).not.toHaveBeenCalled();
  });
});
