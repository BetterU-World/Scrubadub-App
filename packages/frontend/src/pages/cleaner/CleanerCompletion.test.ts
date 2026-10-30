// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), success: vi.fn(), mutations: new Map<string, ReturnType<typeof vi.fn>>() }));
let job: any;
let form: any;
let items: any[];
let fastModeEligible = false;
let actor: any;
let language: "en" | "es" = "en";
const candidates = [{ userId: "cleaner", displayName: "Maya" }];
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: actor }), getStaffSessionToken: () => "verified" }));
vi.mock("@/components/ui/FeedbackProvider", () => ({ useFeedback: () => ({ success: mocks.success }), useFeedbackState: () => [null, vi.fn()] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, args?: Record<string, string>) => {
  if (!key.startsWith("fastMode.")) return key;
  let value = (language === "es" ? es : en).fastMode[key.slice(9) as keyof typeof en.fastMode] ?? key;
  for (const [name, replacement] of Object.entries(args ?? {})) value = value.split(`{{${name}}}`).join(replacement);
  return value;
} }) }));
vi.mock("wouter", () => ({ useParams: () => ({ id: "job" }), useLocation: () => ["/jobs/job/form", mocks.navigate], Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("convex/react", () => ({
  useQuery: (reference: any, args: any) => {
    if (args === "skip") return undefined;
    switch (getFunctionName(reference)) {
      case "queries/jobs:get": return job;
      case "queries/forms:getByJob": return form;
      case "queries/forms:getItems": return items;
      case "queries/forms:fastModeEligibility": return fastModeEligible;
      case "workerCompensation:submissionCandidates": return candidates;
      default: throw Error(`Unexpected query ${getFunctionName(reference)}`);
    }
  },
  useMutation: (reference: any) => {
    const name = getFunctionName(reference);
    if (!mocks.mutations.has(name)) mocks.mutations.set(name, vi.fn().mockResolvedValue({ alreadySubmitted: false }));
    return mocks.mutations.get(name);
  },
}));
vi.mock("@/components/ui/DialogShell", () => ({ DialogShell: ({ open, children }: any) => open ? createElement("div", { role: "dialog" }, children) : null }));
vi.mock("@/components/JobTimingPanel", () => ({ JobTimingPanel: () => null }));
vi.mock("@/components/JobTimeline", () => ({ JobTimeline: () => null }));

import { CleaningFormPage } from "./CleaningFormPage";
import { CleanerJobDetailPage } from "./CleanerJobDetailPage";
import { FastModeEligibilityControl } from "@/components/FastModeEligibilityControl";

let root: Root;
let host: HTMLDivElement;
const button = (label: string) => Array.from(host.querySelectorAll("button")).find(b => b.textContent?.includes(label))!;
async function render(component = CleaningFormPage) { await act(async () => root.render(createElement(component))); }
async function review() { await act(async () => button("jobCompletion.review").click()); }
async function selectWorker() { await act(async () => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click()); }

describe("cleaner completion interface", () => {
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.navigate.mockReset(); mocks.success.mockReset(); mocks.mutations.clear(); localStorage.clear();
    fastModeEligible = false;
    language = "en";
    actor = { _id: "cleaner", companyId: "company", role: "cleaner" };
    job = { _id: "job", companyId: "company", type: "standard", status: "in_progress", canCurrentUserExecute: true, canCurrentUserSubmit: true, inventoryChecklist: [], cleaners: [], scheduledDate: "2026-10-30", durationMinutes: 60, form: { _id: "form", status: "in_progress" } };
    form = { _id: "form", status: "in_progress" };
    items = [{ _id: "item", completed: true, section: "Cleaning", itemName: "Sink", isRedFlag: false }];
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

  it("requires worker confirmation and submits once through the canonical form mutation", async () => {
    await render(); await review();
    expect(button("jobCompletion.submit").disabled).toBe(true);
    await selectWorker();
    expect(button("jobCompletion.submit").disabled).toBe(false);
    await act(async () => button("jobCompletion.submit").click());
    expect(mocks.mutations.get("mutations/forms:submit")).toHaveBeenCalledWith({ formId: "form", userId: "cleaner", sessionToken: "verified", performedWorkerIds: ["cleaner"] });
    expect(mocks.navigate).toHaveBeenCalledWith("/jobs/job");
    expect(mocks.success).toHaveBeenCalledWith("jobCompletion.success");
    expect(mocks.mutations.has("mutations/jobs:completeJob")).toBe(false);
  });

  it("explains that submitting ends a pause and allows the canonical backend behavior", async () => {
    job.currentPauseStartedAt = 123;
    await render(); await review(); await selectWorker();
    expect(host.textContent).toContain("jobCompletion.paused");
    expect(button("jobCompletion.submit").disabled).toBe(false);
    await act(async () => button("jobCompletion.submit").click());
    expect(mocks.mutations.get("mutations/forms:submit")).toHaveBeenCalledTimes(1);
  });

  it("shows required inventory blockers and a link to reporting before allowing submission", async () => {
    job.inventoryChecklist = [{ name: "Soap", required: true }];
    await render(); await review(); await selectWorker();
    expect(host.textContent).toContain("jobCompletion.inventory");
    expect(host.querySelector('a[href="/jobs/job"]')?.textContent).toBe("jobCompletion.reportInventory");
    expect(button("jobCompletion.submit").disabled).toBe(true);
  });

  it("blocks unchecked work in Standard Mode", async () => {
    items[0].completed = false;
    await render(); await review(); await selectWorker();
    expect(host.textContent).toContain("jobCompletion.checklist");
    expect(button("jobCompletion.submit").disabled).toBe(true);
  });

  it("shows team permission guidance without a misleading roster or active submission button", async () => {
    job.canCurrentUserSubmit = false;
    await render(); await review();
    expect(host.textContent).toContain("jobCompletion.teamLead");
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(button("jobCompletion.submit").disabled).toBe(true);
  });

  it("reacts to a permission change while the review is open", async () => {
    await render(); await review(); await selectWorker();
    job = { ...job, canCurrentUserSubmit: false };
    await render();
    expect(button("jobCompletion.submit").disabled).toBe(true);
    expect(host.textContent).toContain("jobCompletion.teamLead");
    expect(mocks.mutations.get("mutations/forms:submit")).not.toHaveBeenCalled();
  });

  it("prevents repeated clicks while a submission is in flight", async () => {
    await render(); await review(); await selectWorker();
    let resolve!: (value: unknown) => void;
    const submit = mocks.mutations.get("mutations/forms:submit")!;
    submit.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await act(async () => { button("jobCompletion.submit").click(); button("jobCompletion.submit").click(); });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(button("jobCompletion.submit").disabled).toBe(true);
    await act(async () => resolve({ alreadySubmitted: false }));
    await act(async () => button("jobCompletion.submit").click());
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("shows an actionable server rejection and allows retry without losing the roster", async () => {
    await render(); await review(); await selectWorker();
    const submit = mocks.mutations.get("mutations/forms:submit")!;
    submit.mockRejectedValueOnce(new Error("Cannot submit: 1 required inventory item(s) not reported"));
    await act(async () => button("jobCompletion.submit").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("jobCompletion.inventoryError");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    await act(async () => button("jobCompletion.submit").click());
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it("uses the same review path for an older in-progress job with a submitted form", async () => {
    form.status = "submitted";
    await render(); await review(); await selectWorker();
    await act(async () => button("jobCompletion.submit").click());
    expect(mocks.mutations.get("mutations/forms:updateScore")).not.toHaveBeenCalled();
    expect(mocks.mutations.get("mutations/forms:submit")).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/jobs/job");
  });

  it.each(["submitted", "approved"])("does not allow editing or resubmitting a %s job", async status => {
    job.status = status; form.status = status;
    await render();
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(mocks.mutations.has("mutations/forms:markAllComplete")).toBe(false);
  });

  it("requires rework to be restarted on job detail before reviewing again", async () => {
    job.status = "rework_requested"; form.status = "rework_requested";
    await render();
    expect(host.textContent).toContain("jobCompletion.stateError");
    expect(host.querySelector('a[href="/jobs/job"]')).not.toBeNull();
  });

  it("starts in Standard Mode without writes on mount, refresh, or rework", async () => {
    fastModeEligible = true; items[0].completed = false;
    await render();
    expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    expect(mocks.mutations.has("mutations/forms:markAllComplete")).toBe(false);
    expect(mocks.mutations.has("mutations/forms:confirmSection")).toBe(false);
    await act(async () => root.unmount()); root = createRoot(host); await render();
    expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    form.status = "rework_requested"; job.status = "rework_requested"; await render();
    form.status = "in_progress"; job.status = "in_progress"; await render();
    expect(items[0].completed).toBe(false);
    expect(mocks.mutations.has("mutations/forms:confirmSection")).toBe(false);
  });

  it("keeps ineligible workers in Standard Mode with individual completion available", async () => {
    items[0].completed = false; await render();
    expect((host.querySelector('[role="switch"]') as HTMLButtonElement).disabled).toBe(true);
    const itemButton = Array.from(host.querySelectorAll("button")).find(b => b.className.includes("w-6 h-6"))!;
    await act(async () => itemButton.click());
    expect(mocks.mutations.get("mutations/forms:updateItem")).toHaveBeenCalledWith(expect.objectContaining({ completed: true, itemId: "item" }));
  });

  it.each([
    ["en", 375], ["en", 1280], ["es", 375], ["es", 1280],
  ] as const)("requires deliberate section action and renders %s labels at %spx", async (locale, width) => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    language = locale; fastModeEligible = true; items[0].completed = false;
    items.push({ ...items[0], _id: "other", section: "Bathroom", itemName: "Shower" });
    await render();
    await act(async () => (host.querySelector('[role="switch"]') as HTMLButtonElement).click());
    expect(mocks.mutations.get("mutations/forms:confirmSection")).not.toHaveBeenCalled();
    const label = locale === "en" ? "Confirm Cleaning Complete" : "Confirmar Cleaning completada";
    await act(async () => button(label).click());
    expect(mocks.mutations.get("mutations/forms:confirmSection")).toHaveBeenCalledExactlyOnceWith({ formId: "form", section: "Cleaning", userId: "cleaner", sessionToken: "verified" });
    expect(host.textContent).toContain(locale === "en" ? "Cleaning confirmed complete." : "Cleaning confirmada como completada.");
  });

  it("guards double clicks, shows failure, and allows retry", async () => {
    fastModeEligible = true; items[0].completed = false; await render();
    await act(async () => (host.querySelector('[role="switch"]') as HTMLButtonElement).click());
    let reject!: (error: Error) => void;
    const mutation = mocks.mutations.get("mutations/forms:confirmSection")!;
    mutation.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await act(async () => { button("Confirm Cleaning Complete").click(); button("Confirm Cleaning Complete").click(); });
    expect(mutation).toHaveBeenCalledTimes(1);
    await act(async () => reject(Error("Fast Mode eligibility required")));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("company authorization");
    await act(async () => button("Confirm Cleaning Complete").click());
    expect(mutation).toHaveBeenCalledTimes(2);
  });

  it("returns an open form to Standard Mode on revocation, retaining progress", async () => {
    fastModeEligible = true; await render();
    await act(async () => (host.querySelector('[role="switch"]') as HTMLButtonElement).click());
    fastModeEligible = false; await render();
    expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    expect(host.textContent).not.toContain("Confirm Cleaning Complete");
    expect(items[0].completed).toBe(true);
    fastModeEligible = true; await render();
    expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
  });

  it("preserves mixed checklist progress and notes when switching modes both ways", async () => {
    fastModeEligible = true;
    items[0].note = "Verified sink";
    items.push({ ...items[0], _id: "other", itemName: "Oven", completed: false });
    const previous = JSON.stringify(items);
    await render();
    await act(async () => (host.querySelector('[role="switch"]') as HTMLButtonElement).click());
    await act(async () => (host.querySelector('[role="switch"]') as HTMLButtonElement).click());
    expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    expect(JSON.stringify(items)).toBe(previous);
    expect(mocks.mutations.get("mutations/forms:updateItem")).not.toHaveBeenCalled();
    expect(mocks.mutations.get("mutations/forms:confirmSection")).not.toHaveBeenCalled();
  });

  it.each(["owner", "manager"])("exposes only targeted eligibility administration to an authorized %s", async role => {
    actor = { ...actor, role, canManageTeam: true };
    await render(() => createElement(FastModeEligibilityControl, { workerUserId: "target" as any, eligible: false }));
    await act(async () => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(mocks.mutations.get("mutations/workers:setFastModeEligibility")).toHaveBeenCalledExactlyOnceWith({ workerUserId: "target", eligible: true, userId: "cleaner", sessionToken: "verified" });
  });

  it.each(["cleaner", "manager"])("hides eligibility administration from an unauthorized %s", async role => {
    actor = { ...actor, role, canManageTeam: false };
    await render(() => createElement(FastModeEligibilityControl, { workerUserId: "target" as any, eligible: false }));
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("guards eligibility changes while saving and reports failures", async () => {
    actor = { ...actor, role: "owner" };
    await render(() => createElement(FastModeEligibilityControl, { workerUserId: "target" as any, eligible: true }));
    let reject!: (error: Error) => void;
    const mutation = mocks.mutations.get("mutations/workers:setFastModeEligibility")!;
    mutation.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const checkbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => { checkbox.click(); checkbox.click(); });
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(checkbox.disabled).toBe(true);
    await act(async () => reject(Error("Permission changed")));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Eligibility could not be saved");
    expect(checkbox.disabled).toBe(false);
  });

  it("job detail offers one checklist destination and no redundant completion action", async () => {
    await render(CleanerJobDetailPage);
    expect(host.querySelectorAll('a[href="/jobs/job/form"]')).toHaveLength(1);
    expect(host.textContent).not.toContain("jobs.completeCleaning");
    expect(mocks.mutations.has("mutations/jobs:completeJob")).toBe(false);
  });

  it("denying an assignment never requests performed workers", async () => {
    job.status = "scheduled";
    await render(CleanerJobDetailPage);
    await act(async () => button("jobs.deny").click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.textContent).not.toContain("compensation.performed");
  });
});
