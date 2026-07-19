import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let queryResults: any[] = [];
let queryIndex = 0;
vi.mock("convex/react", () => ({ useQuery: () => queryResults[queryIndex++], useMutation: () => vi.fn(), useAction: () => vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { _id: "owner-1", companyId: "company-1" }, sessionToken: "token" }), getStaffSessionToken: () => "token" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: ({ title, description }: any) => createElement("header", null, createElement("h1", null, title), description) }));
vi.mock("@/components/ui/LeadsHeader", () => ({ LeadsHeader: () => createElement("header", null, createElement("h1", null, "Requests")) }));
vi.mock("@/components/ui/LoadingSpinner", () => ({ PageLoader: () => createElement("div", null, "Loading"), LoadingSpinner: () => createElement("span", null, "Loading") }));
vi.mock("@/components/ui/EmptyState", () => ({ EmptyState: ({ title }: any) => createElement("div", null, title) }));
vi.mock("@/components/ui/StatusBadge", () => ({ StatusBadge: ({ status }: any) => createElement("span", null, status) }));
vi.mock("@/components/ui/TableScrollRegion", () => ({ TableScrollRegion: ({ label, children }: any) => createElement("div", { role: "region", "aria-label": label }, children) }));
vi.mock("@/hooks/useTimeAgo", () => ({ useTimeAgo: () => () => "recently" }));
vi.mock("@/components/owner/ShareKit", () => ({ ShareKit: () => createElement("section", null, "Share Kit") }));

import { SiteSetupPage } from "./SiteSetupPage";
import { RequestListPage } from "./RequestListPage";
import { CommercialAccountListPage } from "./CommercialAccountListPage";
import { CommercialInvoiceListPage } from "./CommercialInvoiceListPage";

const longName = "Compañía Internacional de Servicios Residenciales Extraordinariamente Larga";
const longAddress = "12345 Avenida Internacional de los Servicios Residenciales, Apartamento 987";

describe("final owner mobile consistency contracts", () => {
  beforeEach(() => {
    queryResults = [];
    queryIndex = 0;
    vi.stubGlobal("window", { location: { origin: "https://example.com" } });
  });

  it("puts live site identity and its primary action before configuration", () => {
    queryResults = [{ slug: "sitio-publico-extraordinariamente-largo", templateId: "A", brandName: longName, bio: "Bio", serviceArea: longAddress, services: [], publicRequestToken: "request-token" }];
    const html = renderToStaticMarkup(createElement(SiteSetupPage));
    expect(html.indexOf(longName)).toBeLessThan(html.indexOf("<form"));
    expect(html).toContain("https://example.com/sitio-publico-extraordinariamente-largo");
    expect(html).toContain("btn-primary touch-target");
    expect(html.match(/<h2/g)?.length).toBe(1);
  });

  it("keeps one request summary with wrapped identity, status, notes, and attached action", () => {
    queryResults = [[{ _id: "request-1", requesterName: longName, status: "new", createdAt: 1, requestedDate: "2026-07-20", requestedService: "Servicio residencial extraordinariamente detallado", notes: longAddress, propertySnapshot: { address: longAddress } }], undefined];
    const html = renderToStaticMarkup(createElement(RequestListPage));
    expect(html).toContain(longName);
    expect(html).toContain("line-clamp-2 break-words");
    expect(html).toContain('role="group"');
    expect(html).toContain("touch-target flex-none");
    expect(html.match(/href="\/requests\/request-1"/g)?.length).toBe(1);
  });

  it("uses one responsive account row while preserving its native table", () => {
    queryResults = [[{ _id: "account-1", clientName: longName, serviceAddress: longAddress, contractAmountCents: 123456, serviceFrequency: "weekly", status: "active", startDate: "2026-01-01", renewalDate: "2027-01-01", assignedManagerName: "Manager" }]];
    const html = renderToStaticMarkup(createElement(CommercialAccountListPage));
    expect(html.match(/<table/g)?.length).toBe(1);
    expect(html.match(/href="\/commercial-accounts\/account-1"/g)?.length).toBe(1);
    expect(html).toContain("block rounded-lg border border-gray-200 p-4 sm:table-row");
    expect(html).toContain(longName);
    expect(html).toContain(longAddress);
  });

  it("keeps invoice identity, account, status, period, and amount in one responsive row", () => {
    queryResults = [[{ _id: "invoice-1", invoiceNumber: "INV-2026-0001", commercialAccountName: longName, billingStartDate: "2026-07-01", billingEndDate: "2026-07-31", status: "issued", totalCents: 987654 }]];
    const html = renderToStaticMarkup(createElement(CommercialInvoiceListPage));
    expect(html.match(/<table/g)?.length).toBe(1);
    expect(html.match(/href="\/commercial-invoices\/invoice-1"/g)?.length).toBe(1);
    expect(html).toContain("text-xl font-bold");
    expect(html).toContain("$9,876.54");
    expect(html).toContain(longName);
  });
});
