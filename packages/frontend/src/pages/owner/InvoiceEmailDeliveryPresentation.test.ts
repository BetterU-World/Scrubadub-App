import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { invoiceEmailPresentation } from "../../lib/invoiceWorkflowPresentation";
const state = vi.hoisted(() => ({ invoice: {} as any, user: { _id: "owner", role: "owner", canManageInvoices: false } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user, sessionToken: "session" }) }));
vi.mock("convex/react", () => ({ useQuery: () => state.invoice, useAction: () => vi.fn(), useMutation: () => vi.fn() }));
vi.mock("wouter", () => ({ useParams: () => ({ id: "invoice" }), Link: ({ children }: any) => createElement("a", {}, children) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key.split(".").reduce((value: any, part) => value?.[part], en) ?? key }) }));
vi.mock("@/components/ui/FeedbackProvider", () => ({ useFeedbackState: () => [null, vi.fn()] }));
import { CommercialInvoiceDetailPage } from "./CommercialInvoiceDetailPage";
const render = () => renderToStaticMarkup(createElement(CommercialInvoiceDetailPage));
beforeEach(() => {
  state.user = { _id: "owner", role: "owner", canManageInvoices: false };
  state.invoice = { _id: "invoice", title: "Existing invoice", invoiceNumber: "INV-1", invoiceType: "commercial", status: "issued",
    subtotalCents: 10000, taxCents: 0, totalCents: 10000, jobIds: [], jobs: [], displayLines: [],
    clientRelationship: { displayName: "Client", hasPortalAccess: true, hasEmail: true } };
});
describe("invoice financial status and email evidence", () => {
  it.each(["pending", "unknown"])("blocks an unsafe resend for %s without suggesting failure", status => {
    state.invoice.emailDelivery = { status, attemptId: "attempt" };
    const html = render();
    expect(html).toContain(en.invoiceDelivery[status as "pending" | "unknown"]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Send another invoice email/);
    expect(invoiceEmailPresentation(status).blocked).toBe(true);
    expect(html).not.toContain(en.invoiceDelivery.failed);
  });
  it("separates provider acceptance from financial status and mailbox delivery", () => {
    state.invoice.emailDelivery = { status: "provider_accepted", attemptId: "attempt" };
    const html = render();
    expect(html).toContain(en.invoiceDelivery.provider_accepted);
    expect(html).toContain(en.invoices.statuses.issued);
    expect(invoiceEmailPresentation("provider_accepted")).toMatchObject({ blocked: false, resend: true });
  });
  it("shows legacy send timestamps as unverified, not delivered", () => {
    state.invoice.sentAt = 1800000000000;
    expect(render()).toContain(en.invoiceDelivery.unverified);
    expect(render()).toContain(en.invoiceDelivery.legacyTime);
    expect(render()).not.toContain(en.invoiceDelivery.provider_accepted);
  });
  it("permits fresh send only for no-history and explicit resend after definite failure/skipping", () => {
    expect(invoiceEmailPresentation("not_sent")).toMatchObject({ blocked: false, resend: false, actionKey: "invoices.send" });
    for (const status of ["failed", "skipped", "unverified"]) expect(invoiceEmailPresentation(status)).toMatchObject({ blocked: false, resend: true });
    expect(invoiceEmailPresentation("unexpected").blocked).toBe(true);
  });
  it("read-only financial managers see evidence without email action controls", () => {
    state.user = { _id: "reader", role: "manager", canManageInvoices: false };
    state.invoice.emailDelivery = { status: "unknown", attemptId: "attempt" };
    expect(render()).toContain(en.invoiceDelivery.unknown);
    expect(render()).not.toContain(en.invoiceDelivery.sendAnother);
  });
  it("keeps all new delivery copy bilingual", () => {
    expect(Object.keys(en.invoiceDelivery).sort()).toEqual(Object.keys(es.invoiceDelivery).sort());
    for (const key of Object.keys(en.invoiceDelivery) as Array<keyof typeof en.invoiceDelivery>) {
      expect(es.invoiceDelivery[key]).toBeTruthy(); expect(es.invoiceDelivery[key]).not.toBe(en.invoiceDelivery[key]);
    }
  });
});
