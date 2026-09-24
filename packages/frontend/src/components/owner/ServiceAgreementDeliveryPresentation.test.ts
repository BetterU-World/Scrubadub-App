import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";

let agreement: any;
let staffUser: any = { _id: "owner-1", role: "owner" };

vi.mock("convex/react", () => ({
  useQuery: () => agreement,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: staffUser, sessionToken: "token" }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key.split(".").reduce((value: any, part) => value?.[part], en as any) ?? key,
  }),
}));
vi.mock("@/components/ui/ServiceAgreementStatusBadge", () => ({ ServiceAgreementStatusBadge: () => null }));
vi.mock("@/components/ui/AsyncButton", () => ({ AsyncButton: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => createElement("button", { disabled }, children) }));
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

  it("shows access guidance and blocks email while keeping outside send available", () => {
    staffUser = { _id: "owner-1", role: "owner" };
    agreement = {
      _id: "agreement-1", status: "ready",
      portalAccess: { status: "not_invited", canEmail: false, relationshipActive: true, recipientEmailAvailable: true },
    };
    const html = renderToStaticMarkup(createElement(ServiceAgreementCard, {
      proposalId: "proposal-1" as any,
      onInviteClient: () => {},
    }));
    expect(html).toContain(en.serviceAgreements.portalAccess.not_invited);
    expect(html).toContain(en.serviceAgreements.portalAccess.invite);
    expect(html).toContain(en.serviceAgreements.recordOutsideSend);
    expect(html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find((button) => button.includes("Send Service Agreement"))).toContain('disabled=""');

    staffUser = { _id: "manager-1", role: "manager", canManageSalesAndCommercial: true };
    const managerHtml = renderToStaticMarkup(createElement(ServiceAgreementCard, { proposalId: "proposal-1" as any, onInviteClient: () => {} }));
    expect(managerHtml).toContain(en.serviceAgreements.portalAccess.handoff);
    expect(managerHtml).not.toContain(en.serviceAgreements.portalAccess.invite);
  });

  it("permits the email control only when the linked client can authenticate", () => {
    staffUser = { _id: "owner-1", role: "owner" };
    agreement = { _id: "agreement-1", status: "ready", portalAccess: { status: "ready", canEmail: true } };
    const html = renderToStaticMarkup(createElement(ServiceAgreementCard, { proposalId: "proposal-1" as any }));
    expect(html).toContain(en.serviceAgreements.portalAccess.ready);
    expect(html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find((button) => button.includes("Send Service Agreement"))).not.toContain('disabled=""');
    for (const key of Object.keys(en.serviceAgreements.portalAccess)) {
      expect((es.serviceAgreements.portalAccess as any)[key]).toBeTruthy();
    }
  });

  it("reviews a ready structured draft without a Mark Ready step or creating an issue", () => {
    staffUser = { _id: "manager-1", role: "manager", canManageSalesAndCommercial: true, canManageDocuments: false };
    agreement = {
      _id: "agreement-1", status: "ready", contentMode: "structured", currentIssueId: undefined,
      canonicalPreview: { title: "Saved agreement" },
      authoringReview: { warnings: [{ code: "client_name_missing", field: "clientName" }], suggestions: [],
        template: { name: "Approved template", version: 2, fallback: false } },
      portalAccess: { status: "ready", canEmail: true },
    };
    const html = renderToStaticMarkup(createElement(ServiceAgreementCard, { proposalId: "proposal-1" as any }));
    expect(html).toContain(en.serviceAgreements.v2.reviewTab);
    expect(html).toContain(en.serviceAgreements.v2.savedPreviewHelp);
    expect(html).toContain(en.serviceAgreements.v2.needsAttention);
    expect(html).toContain(en.serviceAgreements.v2.issueEmail);
    expect(html).toContain(en.serviceAgreements.recordOutsideSend);
    expect(html).not.toContain(en.serviceAgreements.markReady);
  });
});
