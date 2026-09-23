import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";

let agreement: any;

vi.mock("convex/react", () => ({
  useQuery: () => agreement,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { _id: "owner-1" }, sessionToken: "token" }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key.split(".").reduce((value: any, part) => value?.[part], en as any) ?? key,
  }),
}));
vi.mock("@/components/ui/ServiceAgreementStatusBadge", () => ({ ServiceAgreementStatusBadge: () => null }));
vi.mock("@/components/ui/AsyncButton", () => ({ AsyncButton: ({ children }: { children: ReactNode }) => createElement("button", null, children) }));
vi.mock("@/components/AgreementContentView", () => ({ AgreementContentView: () => null }));

import { ServiceAgreementCard } from "./ServiceAgreementCard";

function renderDelivery(result?: string, channel = "email", sentAt: number | null = 1) {
  agreement = {
    _id: "agreement-1", status: sentAt ? "sent" : "draft", sentAt: sentAt ?? undefined,
    currentIssueId: sentAt ? "issue-1" : undefined,
    latestDeliveryAttempt: result ? { channel, result, attemptedAt: 1 } : null,
  };
  return renderToStaticMarkup(createElement(ServiceAgreementCard, { proposalId: "proposal-1" as any }));
}

describe("owner service agreement delivery presentation", () => {
  it("reports an outside send without claiming provider acceptance", () => {
    const html = renderDelivery("owner_reported", "owner_reported_outside_send");
    expect(html).toContain(en.serviceAgreements.outsideSendRecorded);
    expect(html).not.toContain(en.serviceAgreements.afterSendGuidance);
  });

  it("claims provider acceptance only for an accepted email attempt", () => {
    expect(renderDelivery("provider_accepted")).toContain(en.serviceAgreements.afterSendGuidance);
    expect(renderDelivery("provider_accepted", "owner_reported_outside_send")).not.toContain(en.serviceAgreements.afterSendGuidance);
    expect(renderDelivery("provider_accepted", "email", null)).not.toContain(en.serviceAgreements.afterSendGuidance);
  });

  it("does not turn failed, uncertain, or pending attempts into a success claim", () => {
    for (const [result, message] of [
      ["failed", en.serviceAgreements.deliveryFailed],
      ["unknown", en.serviceAgreements.deliveryUnknown],
      ["pending", en.serviceAgreements.deliveryPending],
    ]) {
      const html = renderDelivery(result);
      expect(html).toContain(message);
      expect(html).not.toContain(en.serviceAgreements.afterSendGuidance);
    }
  });

  it("treats a legacy sent agreement without an attempt as unverified", () => {
    expect(renderDelivery()).toContain(en.serviceAgreements.deliveryUnverified);
    expect(renderDelivery()).not.toContain(en.serviceAgreements.afterSendGuidance);
    expect(renderDelivery(undefined, "email", null)).not.toContain(en.serviceAgreements.deliveryUnverified);
  });

  it("has matching provenance copy in the Spanish catalog", () => {
    for (const key of ["outsideSendRecorded", "deliveryFailed", "deliveryUnknown", "deliveryPending", "deliveryUnverified"] as const) {
      expect(es.serviceAgreements[key]).toBeTruthy();
    }
  });
});
