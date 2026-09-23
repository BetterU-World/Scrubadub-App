import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";

vi.mock("wouter", () => ({ Link: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key.split(".").reduce((value: any, part) => value?.[part], en as any) ?? key }),
}));
vi.mock("@/components/client/ClientPortalPage", () => ({
  ClientPortalPage: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  ClientPortalSection: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  formatClientMoney: (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100),
}));
vi.mock("@/components/ui/ServiceAgreementStatusBadge", () => ({ ServiceAgreementStatusBadge: () => null }));
vi.mock("@/hooks/useClientAuth", () => ({ useClientAuth: () => ({ clientUserId: "client-1", sessionToken: "token" }) }));
vi.mock("@/lib/clientPresentation", () => ({ getClientStatusTranslationKey: (_kind: string, status: string) => `proposals.statuses.${status}` }));

import { ClientDocumentsPresentation } from "./ClientDocumentsPage";

function renderProposal(pricing: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(ClientDocumentsPresentation, {
    data: { agreements: [], proposals: [{ _id: "proposal-1", title: "QA Proposal", status: "accepted", providerName: "QA Co", ...pricing }] },
  }));
}

describe("Client Documents proposal pricing", () => {
  it("displays the immutable monthly total including accepted add-ons", () => {
    const html = renderProposal({ monthlyPriceCents: 250000, monthlyTotalCents: 257500, basePriceOnly: false });
    expect(html).toContain("$2,575.00 per month");
    expect(html).not.toContain("$2,500.00");
  });

  it("keeps a no-add-on proposal at its issued base amount", () => {
    const html = renderProposal({ monthlyPriceCents: 250000, monthlyTotalCents: 250000, basePriceOnly: false });
    expect(html).toContain("$2,500.00 per month");
    expect(html).not.toContain("base price");
  });

  it("labels an unsnapshotted legacy amount as base price when add-ons exist", () => {
    expect(renderProposal({ monthlyPriceCents: 250000, basePriceOnly: true }))
      .toContain("$2,500.00 per month (base price)");
  });

  it("shows monthly and one-time totals separately when both apply", () => {
    const html = renderProposal({ monthlyPriceCents: 250000, monthlyTotalCents: 257500, oneTimeTotalCents: 4000 });
    expect(html).toContain("$2,575.00 per month");
    expect(html).toContain("$40.00 one-time");
  });
});
