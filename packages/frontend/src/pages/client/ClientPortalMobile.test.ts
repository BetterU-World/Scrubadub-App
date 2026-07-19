import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let queryResult: any;

vi.mock("convex/react", () => ({
  useQuery: () => queryResult,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));

vi.mock("@/hooks/useClientAuth", () => ({
  useClientAuth: () => ({ clientUserId: "client-1", sessionToken: "token", isLoading: false, signOut: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => options?.name ? `${key}: ${options.name}` : key,
  }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
  useParams: () => ({ agreementId: "agreement-1" }),
}));

vi.mock("@/components/shared/LanguageSwitcher", () => ({ LanguageSwitcher: () => createElement("button", null, "Language") }));
vi.mock("@/components/client/ClientPortalShell", () => ({ ClientPortalShell: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/components/ui/LoadingSpinner", () => ({ PageLoader: () => createElement("div", null, "Loading") }));
vi.mock("@/components/ui/ServiceAgreementStatusBadge", () => ({ ServiceAgreementStatusBadge: ({ agreement }: any) => createElement("span", null, agreement.status) }));
vi.mock("@/components/AddOnSnapshotList", () => ({ AddOnSnapshotList: () => null }));
vi.mock("@/components/ui/PageBack", () => ({ PageBack: ({ label }: any) => createElement("a", { href: "/client/home" }, label) }));
vi.mock("@/components/ui/AsyncButton", () => ({ AsyncButton: ({ children, ...props }: any) => createElement("button", props, children) }));
vi.mock("@/components/ui/ConfirmDialog", () => ({ ConfirmDialog: ({ confirmVariant }: any) => createElement("div", { "data-variant": confirmVariant }) }));
vi.mock("@/lib/clientPresentation", () => ({ getClientStatusTranslationKey: (_kind: string, status: string) => `status.${status}` }));

import { ClientPortalShell } from "../../components/client/ClientPortalShell";
import { ClientHomePage } from "./ClientHomePage";
import { ClientServiceAgreementPage } from "./ClientServiceAgreementPage";

const longCompany = "Compañía Internacional de Servicios Residenciales Extraordinariamente Larga";
const longAddress = "12345 Avenida Internacional de los Servicios Residenciales, Apartamento 987, Springfield";

describe("client portal responsive contracts", () => {
  beforeEach(() => { queryResult = undefined; });

  it("keeps the shell identity, navigation, and session action mobile reachable", () => {
    const html = renderToStaticMarkup(createElement(ClientPortalShell, {
      clientName: longCompany,
      onSignOut: vi.fn(),
      navigation: [{ href: "#documents", label: "Documentos importantes" }],
      children: createElement("p", null, "Content"),
    }));
    expect(html).toContain("min-h-dvh");
    expect(html).toContain(longCompany);
    expect(html).toMatch(/touch-target[^\"]*.*Documentos importantes/);
    expect(html).toContain("btn-secondary touch-target");
  });

  it("wraps long home content and exposes one reachable agreement and payment action", () => {
    queryResult = {
      clientUser: { displayName: longCompany, email: "cliente@example.com", phone: "555-0100" },
      relationships: [{ _id: "rel-1", companyName: longCompany, businessName: longCompany }],
      properties: [{ _id: "property-1", name: longCompany, address: longAddress }],
      commercialAccounts: [], proposals: [], completedJobs: [],
      upcomingJobs: [{ _id: "job-1", clientRelationshipId: "rel-1", propertyId: "property-1", type: "deep_clean", scheduledDate: "2026-07-20", startTime: "09:00", status: "scheduled" }],
      serviceAgreements: [{ _id: "agreement-1", clientRelationshipId: "rel-1", title: longCompany, status: "sent" }],
      invoices: [{ _id: "invoice-1", clientRelationshipId: "rel-1", invoiceNumber: "INV-1", title: longCompany, status: "issued", totalCents: 10000 }],
    };
    const html = renderToStaticMarkup(createElement(ClientHomePage));
    expect(html).toContain(longAddress);
    expect(html.match(new RegExp(`href="/client/service-agreements/agreement-1"`, "g"))?.length).toBe(2);
    expect(html).toContain("flex flex-col items-start gap-2 sm:flex-row");
    expect(html).toContain("btn-primary touch-target w-full");
  });

  it("keeps long agreement content readable and response actions touch sized", () => {
    queryResult = { _id: "agreement-1", clientName: longCompany, companyName: longCompany, companyEmail: "contratos@example.com", title: longCompany, propertyAddress: longAddress, servicesIncluded: longCompany, body: `${longCompany}\n${longAddress}`, status: "sent" };
    const html = renderToStaticMarkup(createElement(ClientServiceAgreementPage));
    expect(html).toContain(longAddress);
    expect(html).toContain("whitespace-pre-wrap break-words");
    expect(html).toContain("btn-primary touch-target");
    expect(html).toContain("btn-secondary touch-target");
    expect(html).toContain('data-variant="danger"');
  });
});
