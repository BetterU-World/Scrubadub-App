import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let queryResults: any[] = [];
let queryIndex = 0;

vi.mock("convex/react", () => ({
  useQuery: () => queryResults[queryIndex++],
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  getStaffSessionToken: () => "token",
  useAuth: () => ({ userId: "affiliate-1", sessionToken: "token", isLoading: false, user: { isSuperadmin: true } }),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/TableScrollRegion", () => ({
  TableScrollRegion: ({ label, children, className }: { label: string; children: ReactNode; className?: string }) =>
    createElement("div", { role: "region", "aria-label": label, tabIndex: 0, className }, children),
}));
vi.mock("@/components/ui/DialogShell", () => ({ DialogShell: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/components/ui/LoadingSpinner", () => ({ PageLoader: () => createElement("div", null, "Loading") }));

import { AffiliateRevenueTab } from "./AffiliateRevenueTab";
import { PayoutRequestsTab } from "./PayoutRequestsTab";
import { StripePayoutsSection } from "./StripePayoutsSection";

const longCompany = "Compañía Internacional de Servicios Profesionales Extraordinariamente Larga";

describe("affiliate financial responsive contracts", () => {
  beforeEach(() => { queryResults = []; queryIndex = 0; });

  it("stacks summary cards and keeps the revenue table in one accessible scroll region", () => {
    queryResults = [
      { lifetimeRevenueCents: 123456, last30dRevenueCents: 45678, last7dRevenueCents: 12345, totalReferredCompanies: 3, lifetimeCommissionCents: 12345, last30dCommissionCents: 4567, last7dCommissionCents: 1234 },
      { rows: [{ _id: "row-1", createdAt: 1, purchaserCompanyName: longCompany, attributionType: "invoice_paid", amountCents: 123456, currency: "usd", stripeInvoiceId: "invoice-reference-extra-long" }] },
    ];
    const html = renderToStaticMarkup(createElement(AffiliateRevenueTab));
    expect(html).toContain("grid-cols-1");
    expect(html).toContain(longCompany);
    expect(html.match(/<table/g)?.length).toBe(1);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="affiliate.revenue"');
  });

  it("keeps payout request identity readable and its row action touch sized", () => {
    queryResults = [{ rows: [{ _id: "request-1", createdAt: 1, referrerName: longCompany, referrerEmail: "affiliate-with-a-very-long-address@example.com", totalCommissionCents: 9000, status: "submitted", ledgerIds: ["ledger-1"] }] }];
    const html = renderToStaticMarkup(createElement(PayoutRequestsTab));
    expect(html).toContain(longCompany);
    expect(html).toContain("break-all");
    expect(html).toContain('aria-label="affiliate.payoutRequests"');
    expect(html).toContain("touch-target inline-flex");
    expect(html.match(/affiliate.view/g)?.length).toBe(1);
  });

  it("keeps the Stripe payout action immediately reachable", () => {
    queryResults = [{ affiliateStripeAccountId: null }];
    const html = renderToStaticMarkup(createElement(StripePayoutsSection));
    expect(html).toContain("touch-target");
    expect(html).toContain("w-full");
    expect(html).toContain("affiliate.connectStripeBtn");
  });
});
