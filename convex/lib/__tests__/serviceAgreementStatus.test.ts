import { describe, expect, it } from "vitest";
import { getServiceAgreementPresentationStatus } from "../../../packages/frontend/src/lib/serviceAgreementStatus";

describe("service agreement presentation status", () => {
  it("maps the supported stored lifecycle to friendly presentation states", () => {
    expect(getServiceAgreementPresentationStatus(null)).toBe("not_created");
    expect(getServiceAgreementPresentationStatus({ status: "draft" })).toBe("draft");
    expect(getServiceAgreementPresentationStatus({ status: "ready" })).toBe("ready");
    expect(getServiceAgreementPresentationStatus({ status: "sent" })).toBe("sent");
    expect(getServiceAgreementPresentationStatus({ status: "signed" })).toBe("accepted");
    expect(getServiceAgreementPresentationStatus({ status: "cancelled" })).toBe("cancelled");
  });

  it("distinguishes a client decline from an owner cancellation", () => {
    expect(getServiceAgreementPresentationStatus({ status: "cancelled", declinedAt: 1 })).toBe("declined");
  });

  it("uses lifecycle timestamps as safe fallbacks", () => {
    expect(getServiceAgreementPresentationStatus({ status: "draft", readyAt: 1 })).toBe("ready");
    expect(getServiceAgreementPresentationStatus({ status: "draft", sentAt: 1 })).toBe("sent");
    expect(getServiceAgreementPresentationStatus({ status: "draft", signedAt: 1 })).toBe("accepted");
    expect(getServiceAgreementPresentationStatus({ status: "draft", cancelledAt: 1 })).toBe("cancelled");
  });

  it("gives specific and terminal evidence precedence", () => {
    expect(getServiceAgreementPresentationStatus({ status: "signed", declinedAt: 1 })).toBe("declined");
    expect(getServiceAgreementPresentationStatus({ status: "sent", signedAt: 1 })).toBe("accepted");
    expect(getServiceAgreementPresentationStatus({ status: "sent", cancelledAt: 1 })).toBe("cancelled");
  });
});
