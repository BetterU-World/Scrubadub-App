import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { SharedWorkNotice } from "@/components/SharedWorkNotice";
const state = vi.hoisted(() => ({ status: "pending", allowed: false, role: "owner" }));
beforeEach(() => { state.status = "pending"; state.allowed = false; state.role = "owner"; });
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/jobs/copy/edit", vi.fn()], useParams: () => ({ id: "copy" }), Link: ({ href, children }: any) => createElement("a", { href }, children) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { _id: "owner", companyId: "recipient", role: state.role, canCreateJobs: true, canApproveForms: true, canRequestRework: true }, sessionToken: "test" }), getStaffSessionToken: () => "test" }));
vi.mock("@/components/ui/FeedbackProvider", () => ({ useFeedback: () => ({ error: vi.fn(), success: vi.fn() }), useFeedbackState: () => [null, vi.fn()] }));
vi.mock("@/components/payments/PerformedWorkerPicker", () => ({ usePerformedWorkers: () => ({ selected: [], candidates: [], setSelected: vi.fn() }), PerformedWorkerPicker: () => null }));
vi.mock("@/components/payments/JobCompensation", () => ({ JobCompensation: () => null }));
vi.mock("@/components/payments/PartnerCompensation", () => ({ PartnerCompensation: () => null }));
vi.mock("@/components/owner/ServicePricingPanel", () => ({ ServicePricingPanel: () => null }));
vi.mock("@/components/owner/ResidentialInvoicePanel", () => ({ ResidentialInvoicePanel: () => null }));
vi.mock("@/components/owner/JobInvoiceBillingPanel", () => ({ JobInvoiceBillingPanel: () => null }));
vi.mock("@/components/JobTimingPanel", () => ({ JobTimingPanel: ({ controls }: { controls?: boolean }) => controls ? createElement("button", null, "timer-control") : null }));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: (ref: any) => getFunctionName(ref) === "queries/jobs:get" ? {
  _id: "copy", sharedFromJobId: "original", companyId: "recipient", cleanerIds: [], status: "scheduled", type: "standard",
  assignedManagerId: "owner", redFlags: [], cleaners: [], canCurrentUserExecute: state.allowed,
  sharedWorkAccess: { allowed: state.allowed, status: state.status }, propertySnapshot: { name: "Synthetic", address: "Test" },
} : getFunctionName(ref) === "queries/partners:getIncomingSharedStatus" ? { _id: "share", status: "pending", fromCompanyName: "Synthetic" }
  : getFunctionName(ref) === "queries/inspections:getSummary" ? null : [] }));
import { JobFormPage } from "./JobFormPage";
import { JobDetailPage } from "./JobDetailPage";
import { ManagerJobDetailPage } from "../manager/ManagerJobDetailPage";
import { MaintenanceJobDetailPage } from "../maintenance/MaintenanceJobDetailPage";
import { MaintenanceFormPage } from "../maintenance/MaintenanceFormPage";

describe("shared-work affordances", () => {
  it.each(["pending", "rejected", "manual_review"])("blocks direct assignment/edit route for %s", status => {
    state.status = status; state.allowed = false;
    const html = renderToStaticMarkup(createElement(JobFormPage));
    expect(html).toContain('role="status"');
    expect(html).toContain(status === "manual_review" ? "sharedWork.manualReview" : `sharedWork.${status}`);
    expect(html).toContain('href="/jobs/copy"');
    expect(html).not.toContain("<form");
  });
  it("keeps the edit form available after company acceptance", () => {
    state.status = "accepted"; state.allowed = true;
    expect(renderToStaticMarkup(createElement(JobFormPage))).toContain("<form");
  });
  it("distinguishes company acceptance from worker acceptance and renders no notice for permitted work", () => {
    expect(renderToStaticMarkup(createElement(SharedWorkNotice, { access: { allowed: false, status: "pending" } }))).toContain("sharedWork.pending");
    expect(renderToStaticMarkup(createElement(SharedWorkNotice, { access: { allowed: true, status: "completed" } }))).toBe("");
  });
  it.each([MaintenanceJobDetailPage, MaintenanceFormPage])("blocks a direct Maintenance execution route before showing actions", Page => {
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("sharedWork.pending");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
  });
  it("keeps recipient Owner response actions but hides assignment, alternate execution, and timing", () => {
    const html = renderToStaticMarkup(createElement(JobDetailPage));
    expect(html).toContain("jobs.accept");
    expect(html).toContain("jobs.reject");
    expect(html).not.toContain("jobs.assignCleaner");
    expect(html).not.toContain("jobs.ownerExecution");
    expect(html).not.toContain("timer-control");
  });
  it("hides Manager editing, cancellation and inspection controls on blocked work", () => {
    state.role = "manager";
    const html = renderToStaticMarkup(createElement(ManagerJobDetailPage));
    expect(html).toContain("sharedWork.pending");
    expect(html).not.toContain("Edit Job");
    expect(html).not.toContain("jobs.cancelJob");
    expect(html).not.toContain("type=\"range\"");
  });
});
