import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { InvoicePaymentRecord } from "./InvoicePaymentRecord";

const base = { state: "paid", source: "online", invoiceAmountCents: 3000, paymentAmountCents: 3000, paidAt: 1700000000000, platformFeeCents: 200, history: [], references: null };
const render = (changes: any = {}) => renderToStaticMarkup(createElement(InvoicePaymentRecord, { record: { ...base, ...changes } }));

describe("owner invoice payment record", () => {
  it.each([0, 200])("renders the frozen %i cent fee with online provenance", platformFeeCents => {
    const html = render({ platformFeeCents });
    expect(html).toContain("paymentRecord.sources.online");
    expect(html).toContain(platformFeeCents === 0 ? "$0.00" : "$2.00");
    expect(html).toContain("paymentRecord.methodUnavailable");
  });
  it("distinguishes outside payment and missing legacy evidence", () => {
    expect(render({ source: "outside", platformFeeCents: 0, paymentAmountCents: null })).toContain("paymentRecord.sources.outside");
    expect(render({ source: "outside", platformFeeCents: 0 })).not.toContain("paymentRecord.methodUnavailable");
    expect(render({ platformFeeCents: null, paidAt: null })).toContain("paymentRecord.unavailable");
    expect(render({ source: "unknown", platformFeeCents: null })).toContain("paymentRecord.sources.unknown");
  });
  it("shows problems and event evidence without controls or invented outcomes", () => {
    const html = render({ needsAttention: true, hasRefundEvidence: true, hasDisputeEvidence: true, history: [{ kind: "charge.dispute.closed", recordedAt: 1700000000000 }] });
    expect(html).toContain('role="alert"');
    expect(html).toContain("paymentRecord.refundEvidence");
    expect(html).toContain("paymentRecord.disputeEvidence");
    expect(html).toContain("paymentRecord.events.disputeClosed");
    expect(html).not.toContain("<button");
  });
  it("keeps historical support references in an optional details section", () => {
    const html = render({ references: { paymentIntentId: "pi_historical", chargeModel: "destination" } });
    expect(html).toContain("paymentRecord.historical");
    expect(html).toContain("pi_historical");
    expect(render()).not.toContain("paymentRecord.references");
  });
  it("includes every lifecycle and evidence localization key in EN and ES", () => {
    const leaves = (value: any, prefix = ""): string[] => Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [`${prefix}${key}`] : leaves(item, `${prefix}${key}.`));
    expect(leaves(en.paymentRecord).sort()).toEqual(leaves(es.paymentRecord).sort());
    for (const key of ["needsReview", "attemptFailed", "attemptExpired", "retryPayment", "returnHelp", "paidOnline", "paidOutside", "onlineUnavailable"] as const) {
      expect(en.clientBilling[key]).toBeTruthy();
      expect(es.clientBilling[key]).toBeTruthy();
      expect(es.clientBilling[key]).not.toBe(en.clientBilling[key]);
    }
  });
});
