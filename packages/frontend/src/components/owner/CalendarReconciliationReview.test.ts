// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { CalendarReconciliationReview } from "./CalendarReconciliationReview";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), dates: vi.fn() }));
vi.mock("convex/react", () => ({ useMutation: (ref: any) => getFunctionName(ref).endsWith(":reviewReservationIdentity") ? mocks.identity : mocks.dates }));
let container: HTMLDivElement;
let root: Root;
const row = () => ({ _id: "new", connectionId: "feed", status: "active", eventVersion: "2:version",
  identityReview: { revision: 3, state: "pending", candidateIds: ["old"], reasons: ["overlapping_dates"], incomplete: false } });
const previous = { _id: "old", connectionId: "prior-feed", checkIn: "2026-11-10", checkOut: "2026-11-12", summary: "Original stay", linkedJobId: "job" };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.identity.mockReset(); mocks.dates.mockReset();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render(reservation: any = row(), extra: any = {}) {
  await act(async () => root.render(createElement(CalendarReconciliationReview, {
    reservation, neighbors: [previous], feedRevision: 2, canReview: true, sessionToken: "session", userId: "owner", ...extra,
  } as any)));
}
const button = (label: string) => [...container.querySelectorAll("button")].find(b => b.textContent === label)!;
const distinct = "Confirm this is a separate booking";
const duplicate = "Same booking — suppress additional automation";
describe("owner reconciliation controls", () => {
  it("explains uncertainty and submits the displayed candidate and CAS values without merging", async () => {
    mocks.identity.mockResolvedValue("reviewed"); await render();
    expect(container.textContent).toContain("do not prove");
    expect(container.textContent).toContain("existing cleaning job retained");
    button(duplicate).focus(); expect(document.activeElement).toBe(button(duplicate));
    expect(button(duplicate).type).toBe("button");
    await act(async () => button(duplicate).click());
    expect(mocks.identity).toHaveBeenCalledWith({ sessionToken: "session", userId: "owner", reservationId: "new", expectedEventVersion: "2:version", expectedFeedRevision: 2, expectedRevision: 3, decision: "duplicate", duplicateOf: "old" });
    expect(mocks.dates).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Existing jobs were kept unchanged");
  });
  it("blocks concurrent button clicks and reports stale evidence without claiming resolution", async () => {
    let release!: (value: string) => void;
    mocks.identity.mockReturnValue(new Promise(resolve => { release = resolve; }));
    await render(); await act(async () => button(distinct).click());
    expect(button(distinct).disabled).toBe(true); expect(button(duplicate).disabled).toBe(true);
    await act(async () => button(duplicate).click()); expect(mocks.identity).toHaveBeenCalledTimes(1);
    await act(async () => release("stale")); expect(container.textContent).toContain("Inspect the refreshed candidates");
    expect(container.textContent).not.toContain("Review submitted");
    await render({ ...row(), eventVersion: "2:new-version" });
    expect(container.textContent).not.toContain("Inspect the refreshed candidates");
  });
  it("keeps incomplete scans blocked while allowing safe suppression", async () => {
    const r = row(); r.identityReview.incomplete = true;
    await render(r); expect(button(distinct).disabled).toBe(true); expect(button(duplicate).disabled).toBe(false);
    await act(async () => button(distinct).click()); expect(mocks.identity).not.toHaveBeenCalled();
  });
  it.each([{ canReview: false }, { feedRevision: 3 }, { feedRevision: undefined }])("hides review controls for unavailable authorization/source %j", async extra => {
    await render(row(), extra); expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toContain("Only the owner"); expect(mocks.identity).not.toHaveBeenCalled();
  });
  it("acknowledges dates separately and keeps the manual job discrepancy visible", async () => {
    mocks.dates.mockResolvedValue("acknowledged");
    const r = { ...row(), identityReview: undefined, dateReview: { revision: 7, state: "pending", previousCheckIn: "2026-11-10", previousCheckOut: "2026-11-12", proposedCheckIn: "2026-11-09", proposedCheckOut: "2026-11-15" } };
    await render(r); await act(async () => button("Acknowledge date change; keep job unchanged").click());
    expect(mocks.dates).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 7, expectedEventVersion: "2:version", expectedFeedRevision: 2 }));
    expect(mocks.identity).not.toHaveBeenCalled();
    await render({ ...r, dateReview: { ...r.dateReview, state: "acknowledged" } });
    expect(container.textContent).toContain("job review remains separate");
    expect(container.textContent).toContain("Previous: 2026-11-10 → 2026-11-12");
    expect(container.textContent).toContain("Proposed by feed: 2026-11-09 → 2026-11-15");
    expect(container.querySelector("button")).toBeNull();
  });
  it("does not reflect raw server errors into the page", async () => {
    mocks.identity.mockRejectedValue(new Error("private diagnostic")); await render();
    await act(async () => button(distinct).click());
    expect(container.textContent).toContain("Could not save"); expect(container.textContent).not.toContain("private diagnostic");
  });
});
