// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { assignmentPayload } from "@/lib/jobAssignment";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), success: vi.fn(), mutations: new Map<string, ReturnType<typeof vi.fn>>(), queries: vi.fn() }));
let actor: any, existing: any, params: { id?: string }, language: "en" | "es", teamDetails: any;
const workers = [{ _id: "a", name: "Alex", email: "alex@test.dev" }, { _id: "b", name: "Jordan", email: "jordan@test.dev" }];
const team = { _id: "team", name: "Team Alpha", active: true };
const maintenance = [{ _id: "m", name: "Morgan" }];
let availability: any[];
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: actor, sessionToken: "verified" }), getStaffSessionToken: () => "verified" }));
vi.mock("@/components/ui/FeedbackProvider", () => ({ useFeedback: () => ({ success: mocks.success }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key.split(".").reduce((value: any, part) => value?.[part], language === "es" ? es : en) ?? key }) }));
vi.mock("wouter", () => ({ useParams: () => params, useLocation: () => ["/jobs/job/edit", mocks.navigate], Link: ({ children, href, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("convex/react", () => ({
  useQuery: (ref: any, args: any) => {
    const name = getFunctionName(ref); mocks.queries(name, args);
    if (args === "skip") return undefined;
    switch (name) {
      case "queries/jobs:get": return existing;
      case "queries/jobs:list":
      case "queries/jobs:getForManager":
      case "queries/jobs:getCalendarJobs": return [existing];
      case "queries/walkthroughs:listCalendarWalkthroughs": return [];
      case "queries/employees:getCleaners": return workers;
      case "queries/properties:list": return [{ _id: "property", name: "Location", address: "1 Main", active: true }];
      case "queries/employees:getJobAssignees": return workers;
      case "queries/employees:getMaintenanceWorkers": return maintenance;
      case "queries/employees:getManagers": return [];
      case "queries/teams:listActiveForAssignment": return [team];
      case "queries/teams:get": return teamDetails;
      case "queries/companies:getCompanyProfile": return {};
      case "queries/partners:listConnections": return [];
      case "queries/availability:listCleanersWithAvailability": return availability;
      default: throw Error(`Unexpected query ${name}`);
    }
  },
  useMutation: (ref: any) => {
    const name = getFunctionName(ref);
    if (!mocks.mutations.has(name)) mocks.mutations.set(name, vi.fn().mockResolvedValue("savedJob"));
    return mocks.mutations.get(name);
  },
}));
import { JobListPage } from "./JobListPage";
import { ManagerJobListPage } from "../manager/ManagerJobListPage";
import { CalendarPage } from "./CalendarPage";
import { JobFormPage } from "./JobFormPage";
import { QuickJobPage } from "./QuickJobPage";
import { AssignmentSummary } from "@/components/AssignmentSummary";
let root: Root, host: HTMLDivElement;
async function render(component = JobFormPage) { await act(async () => root.render(createElement(component))); }
async function change(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); });
}
const teamSelect = () => host.querySelector('fieldset select') as HTMLSelectElement;
const workerCheckbox = (name: string) => [...host.querySelectorAll("label")].find(label => label.textContent?.includes(name))!.querySelector('input[type="checkbox"]') as HTMLInputElement;
async function toggle(name: string) { await act(async () => workerCheckbox(name).click()); }
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
const updateArgs = () => mocks.mutations.get("mutations/jobs:update")!.mock.calls.at(-1)![0];
const assignmentKeys = (args: any) => Object.keys(args).filter(key => ["cleanerIds", "assignedTeamId", "clearAssignedTeam"].includes(key));
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.navigate.mockReset(); mocks.success.mockReset(); mocks.mutations.clear(); mocks.queries.mockClear();
  sessionStorage.clear(); language = "en"; params = { id: "job" }; availability = [];
  actor = { _id: "owner", companyId: "company", role: "owner" };
  existing = { _id: "job", companyId: "company", propertyId: "property", cleanerIds: ["a", "b"], cleaners: workers, assignedTeamId: "team", assignedTeam: team, assignedTeamName: team.name, type: "standard", scheduledDate: "2030-01-02", durationMinutes: 60, notes: "Before", acceptanceStatus: "accepted" };
  teamDetails = { ...team, members: [{ userId: "a", active: true, companyId: "company", user: { status: "active", role: "cleaner" } }] };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("combined assignment forms", () => {
  it("opens/saves a combined job without serializing unchanged assignment sources", async () => {
    await render(); expect(teamSelect().value).toBe("team"); expect(workerCheckbox("Alex").checked).toBe(true); expect(workerCheckbox("Jordan").checked).toBe(true);
    expect(host.textContent).toContain(en.assignment.alsoOnTeam);
    await submit(); expect(assignmentKeys(updateArgs())).toEqual([]);
    expect(updateArgs()).not.toHaveProperty("acceptanceStatus");
  });
  it("editing only notes preserves both assignment sources, including live changes by another staff member", async () => {
    await render();
    existing = { ...existing, assignedTeamId: "other-team", cleanerIds: ["other-worker"], notes: "Other staff note" };
    await render(); expect(teamSelect().value).toBe("team");
    const notes = host.querySelector("textarea")!; await change(notes, "New notes"); await submit();
    expect(updateArgs().notes).toBe("New notes"); expect(assignmentKeys(updateArgs())).toEqual([]);
  });
  it("clearing a team sends only clearAssignedTeam and preserves direct workers", async () => {
    await render(); await change(teamSelect(), ""); await submit();
    expect(updateArgs()).toMatchObject({ clearAssignedTeam: true }); expect(updateArgs()).not.toHaveProperty("cleanerIds"); expect(updateArgs()).not.toHaveProperty("assignedTeamId");
  });
  it("clearing direct workers sends an explicit empty array and preserves the team", async () => {
    await render(); await toggle("Alex"); await toggle("Jordan"); await submit();
    expect(updateArgs().cleanerIds).toEqual([]); expect(updateArgs()).not.toHaveProperty("clearAssignedTeam"); expect(updateArgs()).not.toHaveProperty("assignedTeamId");
  });
  it("changes one source without removing the other and supports explicit unassigned state", async () => {
    await render(); await toggle("Jordan"); await submit(); expect(updateArgs().cleanerIds).toEqual(["a"]); expect(updateArgs()).not.toHaveProperty("clearAssignedTeam");
    await change(teamSelect(), ""); await toggle("Alex"); await submit(); expect(updateArgs()).toMatchObject({ cleanerIds: [], clearAssignedTeam: true });
  });
  it.each(["team", "direct", "combined", "unassigned"])("creates %s through standard creation", async mode => {
    params = {}; existing = undefined; await render();
    if (mode === "team" || mode === "combined") await change(teamSelect(), "team");
    if (mode === "direct" || mode === "combined") await toggle("Alex");
    await submit(); const args = mocks.mutations.get("mutations/jobs:create")!.mock.calls[0][0];
    expect(args.cleanerIds).toEqual(mode === "direct" || mode === "combined" ? ["a"] : []);
    expect(args.assignedTeamId).toBe(mode === "team" || mode === "combined" ? "team" : undefined); expect(args).not.toHaveProperty("clearAssignedTeam");
  });
  it.each(["team", "direct", "combined", "unassigned"])("creates %s through quick creation", async mode => {
    params = {}; existing = undefined; await render(QuickJobPage);
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Location"))!.click());
    if (mode === "direct" || mode === "combined") await toggle("Alex");
    if (mode === "team" || mode === "combined") await change(teamSelect(), "team");
    expect(workerCheckbox("Alex").checked).toBe(mode === "direct" || mode === "combined");
    await submit(); const args = mocks.mutations.get("mutations/jobs:createQuick")!.mock.calls[0][0];
    expect(args.cleanerIds).toEqual(mode === "direct" || mode === "combined" ? ["a"] : []);
    expect(args.assignedTeamId).toBe(mode === "team" || mode === "combined" ? "team" : undefined);
  });
  it("selects maintenance staff in quick mode and preserves a selected team when changing job type", async () => {
    params = {}; existing = undefined; await render(QuickJobPage); await change(teamSelect(), "team");
    const type = [...host.querySelectorAll("select")].find(s => s.querySelector('option[value="maintenance"]'))!;
    await change(type, "maintenance"); expect(teamSelect().value).toBe("team"); expect(host.textContent).toContain("Morgan"); expect(host.textContent).not.toContain("Jordan");
  });
  it("preserves a retained archived team and unavailable direct worker on an unrelated edit", async () => {
    existing = { ...existing, assignedTeamId: "archived", assignedTeam: { _id: "archived", name: "Archived team" }, cleanerIds: ["inactive"], cleaners: [{ _id: "inactive", name: "Retained worker" }] };
    await render(); expect(teamSelect().value).toBe("archived"); expect(workerCheckbox("Retained worker").checked).toBe(true);
    await submit(); expect(assignmentKeys(updateArgs())).toEqual([]);
    await toggle("Retained worker"); await submit(); expect(updateArgs().cleanerIds).toEqual([]);
  });
  it("permits removing an already-selected unavailable worker without silently removing them on date changes", async () => {
    availability = [{ _id: "a", isUnavailable: true }]; await render(); expect(workerCheckbox("Alex").disabled).toBe(false);
    await submit(); expect(assignmentKeys(updateArgs())).toEqual([]); await toggle("Alex"); expect(workerCheckbox("Alex").disabled).toBe(true);
  });
  it.each([true, false])("manager assignment permission=%s controls selectors and payloads", async allowed => {
    actor = { ...actor, role: "manager", canCreateJobs: true, canAssignCleaners: allowed }; await render();
    expect(!!host.querySelector("fieldset")).toBe(allowed);
    if (allowed) { await change(teamSelect(), ""); } else { expect(host.textContent).toContain("Team Alpha"); expect(host.textContent).toContain("Alex"); }
    await submit(); expect(assignmentKeys(updateArgs())).toEqual(allowed ? ["clearAssignedTeam"] : []);
    if (!allowed) expect(mocks.queries.mock.calls.filter(([name, args]) => name === "queries/teams:get" && args !== "skip")).toHaveLength(0);
  });
  it("accepted shared-copy edits use local assignments without requesting partner properties", async () => {
    existing = { ...existing, propertyId: undefined, propertySnapshot: { name: "Shared location", address: "Shared address" }, sharedFromJobId: "origin", sharedWorkAccess: { allowed: true } };
    await render(); await toggle("Jordan"); await submit(); expect(updateArgs()).toMatchObject({ cleanerIds: ["a"] }); expect(updateArgs()).not.toHaveProperty("propertyId"); expect(updateArgs()).not.toHaveProperty("clearAssignedTeam");
  });
  it("pending shared work exposes no editable assignment controls", async () => {
    existing = { ...existing, sharedFromJobId: "origin", sharedWorkAccess: { allowed: false, status: "pending" } };
    await render(); expect(host.querySelector("form")).toBeNull(); expect(host.querySelector("fieldset")).toBeNull();
  });
  it.each(["en", "es"] as const)("renders accessible independent controls and overlap copy in %s", async lang => {
    language = lang; await render(); const copy = lang === "es" ? es : en;
    expect(host.textContent).toContain(copy.assignment.help); expect(host.textContent).toContain(copy.assignment.alsoOnTeam);
    expect([...host.querySelectorAll("label")].some(label => label.htmlFor === teamSelect().id)).toBe(true);
    expect(host.querySelector('fieldset')?.className).toContain("min-w-0"); expect(host.querySelector('fieldset .grid')?.className).toContain("grid-cols-1");
  });
});

describe("assignment payload", () => {
  it("deduplicates and treats order as unchanged, independently changing team", () => {
    expect(assignmentPayload(true, ["b", "a", "a"], "team", { cleanerIds: ["a", "b"], assignedTeamId: "team" })).toEqual({});
    expect(assignmentPayload(true, ["a"], "new", { cleanerIds: ["a"], assignedTeamId: "team" })).toEqual({ assignedTeamId: "new" });
  });
  it("omits local assignments for partner creation or managers without assignment permission", () => {
    expect(assignmentPayload(true, ["a"], "team", undefined, true)).toEqual({ cleanerIds: [] });
    expect(assignmentPayload(false, ["a"], "team", { cleanerIds: ["a"] })).toEqual({});
  });
});

describe("assignment presentation", () => {
  it.each(["en", "es"] as const)("shows both sources without duplicate direct names in %s", async lang => {
    language = lang; await act(async () => root.render(createElement(AssignmentSummary, { job: { assignedTeamName: "Team Alpha", cleaners: [workers[0], workers[0], workers[1]], assignedTeamMembers: [workers[0]] } })));
    expect(host.textContent).toContain("Team Alpha"); expect(host.textContent?.match(/Alex/g)).toHaveLength(1); expect(host.textContent).toContain("Jordan"); expect(host.textContent).toContain((lang === "es" ? es : en).assignment.alsoOnTeam);
  });
  it("shows a team-only job without an unassigned warning and unassigned jobs accurately", async () => {
    await act(async () => root.render(createElement(AssignmentSummary, { job: { assignedTeamName: "Team Alpha", cleaners: [] } })));
    expect(host.textContent).not.toContain(en.common.unassigned);
    await act(async () => root.render(createElement(AssignmentSummary, { job: {} })));
    expect(host.textContent).toBe(en.common.unassigned);
  });
  it("escapes HTML-like worker and team names", async () => {
    await act(async () => root.render(createElement(AssignmentSummary, { job: { assignedTeamName: "<img src=x>", cleaners: [{ _id: "x", name: "<script>bad</script>" }] } })));
    expect(host.querySelector("img,script")).toBeNull(); expect(host.textContent).toContain("<script>bad</script>");
  });
});


describe("assignment route presentation", () => {
  it.each([["owner", JobListPage], ["manager", ManagerJobListPage]] as const)("shows both sources on the %s job list", async (role, Page) => {
    actor = { ...actor, role, canSeeAllJobs: true };
    existing = { ...existing, propertyName: "Location", propertyAddress: "1 Main", _creationTime: 1, status: "confirmed", reworkCount: 0 };
    await render(Page);
    expect(host.textContent).toContain("Team Alpha"); expect(host.textContent).toContain("Alex"); expect(host.textContent).toContain("Jordan");
  });
  it("does not classify a team-only job as unassigned", async () => {
    existing = { ...existing, propertyName: "Location", status: "confirmed", cleaners: [], cleanerIds: [], _creationTime: 1 };
    await render(JobListPage);
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === en.jobs.unassigned)!.click()); expect(host.querySelector('a[href="/jobs/job"]')).toBeNull();
  });
  it("shows both assignment sources in calendar month, week and day views", async () => {
    const now = new Date(); const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    existing = { ...existing, propertyName: "Location", status: "confirmed", scheduledDate: date, startTime: "10:00", _creationTime: 1 };
    await render(CalendarPage);
    for (const view of [en.calendar.month, en.calendar.week, en.calendar.day]) {
      await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === view)!.click());
      expect(host.textContent).toContain("Team Alpha"); expect(host.textContent).toContain("Alex"); expect(host.textContent).toContain("Jordan");
    }
  });
});
