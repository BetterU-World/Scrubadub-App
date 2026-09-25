import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";

const mock = vi.hoisted(() => ({ result: null as any, role: "owner", canManageSalesAndCommercial: true, clientResult: null as any }));
vi.mock("convex/react", () => ({ useQuery: (_query: any, args: any) => args === "skip" ? undefined : args?.clientUserId ? mock.clientResult : mock.result, useMutation: () => async () => undefined }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { _id: "owner", role: mock.role, canManageSalesAndCommercial: mock.canManageSalesAndCommercial }, sessionToken: "token" }) }));
vi.mock("@/hooks/useClientAuth", () => ({ useClientAuth: () => ({ clientUserId: "client", sessionToken: "token" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, vars?: any) => { const value = key.split(".").reduce((record: any, part) => record?.[part], en as any) ?? key; return String(value).replace("{{version}}", String(vars?.version ?? "")); } }) }));

import { ServicePricingPanel, requestedOfferLines } from "./ServicePricingPanel";
import { ClientPriceOfferPanel } from "../client/ClientPriceOfferPanel";

describe("residential pricing presentation", () => {
  it("uses request snapshot prices, quantities, and starting-at finalization", () => {
    expect(requestedOfferLines([
      { name: "Oven", pricingMethod: "flat", priceCents: 2500 },
      { name: "Windows", pricingMethod: "per_unit", priceCents: 1200, quantity: 3, unitLabel: "window" },
      { name: "Deep clean", pricingMethod: "starting_at", priceCents: 4000 },
    ])).toEqual([
      { name: "Oven", amount: "25.00", quantity: undefined, unitLabel: undefined, needsFinalPrice: false },
      { name: "Windows", amount: "36.00", quantity: 3, unitLabel: "window", needsFinalPrice: false },
      { name: "Deep clean", amount: "", quantity: undefined, unitLabel: undefined, needsFinalPrice: true },
    ]);
  });
  it("shows pending and accepted invoiceability honestly to the owner", () => {
    mock.result = { status: "pending", revision: 0, readiness: { ok: false, reason: "price_pending" }, canManage: true };
    const pending = renderToStaticMarkup(createElement(ServicePricingPanel, { jobId: "job" }));
    expect(pending).toContain("Price pending");
    expect(pending).toContain("Price must be resolved before invoicing");
    mock.result = { status: "accepted", revision: 1, chargeCents: 15000, source: "direct_quote", consent: { source: "owner_reported_outside", acceptedAt: 1 }, readiness: { ok: true }, canManage: true };
    const accepted = renderToStaticMarkup(createElement(ServicePricingPanel, { jobId: "job" }));
    expect(accepted).toContain("$150.00");
    expect(accepted).toContain("Agreement recorded outside SCRUB");
    expect(accepted).toContain("Price is ready for invoicing");
  });

  it("shows the exact current quote and acceptance actions in the client Request experience", () => {
    mock.clientResult = { offer: null };
    expect(renderToStaticMarkup(createElement(ClientPriceOfferPanel, { requestId: "request" }))).toContain("A price has not been established yet");
    mock.clientResult = { offer: { _id: "offer", status: "issued", version: 2, snapshot: { baseChargeCents: 15000, addOns: [{ snapshotId: "oven", name: "Oven", amountCents: 2500 }], totalCents: 17500 } } };
    const quote = renderToStaticMarkup(createElement(ClientPriceOfferPanel, { requestId: "request" }));
    expect(quote).toContain("$175.00");
    expect(quote).toContain("Oven");
    expect(quote).toContain("Accept price");
    expect(quote).toContain("Decline price");
    mock.clientResult.offer.status = "accepted";
    expect(renderToStaticMarkup(createElement(ClientPriceOfferPanel, { requestId: "request" }))).not.toContain("Accept price");
  });

  it("keeps financial read-only users from seeing price mutation controls", () => {
    mock.result = { status: "accepted", revision: 1, chargeCents: 12000, readiness: { ok: true }, canManage: false };
    const html = renderToStaticMarkup(createElement(ServicePricingPanel, { jobId: "job" }));
    expect(html).toContain("$120.00");
    expect(html).not.toContain("Issue price offer");
    expect(html).not.toContain("Mark no charge");
  });

  it("keeps English and Spanish pricing states and actions aligned", () => {
    expect(Object.keys(en.jobPricing).sort()).toEqual(Object.keys(es.jobPricing).sort());
    for (const key of ["states", "sources", "offerStates", "consent", "readiness", "reasons"] as const) expect(Object.keys(en.jobPricing[key]).sort()).toEqual(Object.keys(es.jobPricing[key]).sort());
  });
});
