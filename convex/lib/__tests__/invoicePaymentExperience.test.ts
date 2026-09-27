import { describe, expect, it } from "vitest";
import { invoicePaymentLifecycle, ownerInvoicePaymentRecord } from "../invoicePaymentExperience";

const invoice = { _id: "invoice", companyId: "company", status: "paid", paymentSource: "online", canonicalPaymentAttemptId: "canonical", totalCents: 2500, paidAt: 20 };
const attempt = { _id: "canonical", invoiceId: "invoice", companyId: "company", status: "paid", amountCents: 2500, platformFeeCents: 0, chargeModel: "direct", stripePaymentIntentId: "pi_one", createdAt: 10, updatedAt: 20, completedAt: 20 };

describe("payment experience stored evidence", () => {
  it("preserves historical destination fee and does not create method/refund/outcome facts", () => {
    const record = ownerInvoicePaymentRecord(invoice, [{ ...attempt, chargeModel: undefined, platformFeeCents: 200 }], [], [], true);
    expect(record).toMatchObject({ source: "online", platformFeeCents: 200, references: { chargeModel: "destination" } });
    expect(record.history).toEqual([{ kind: "initiated", recordedAt: 10 }, { kind: "confirmed", recordedAt: 20 }]);
    expect(record).not.toHaveProperty("paymentMethod");
    expect(record).not.toHaveProperty("refundAmountCents");
    expect(record).not.toHaveProperty("disputeStatus");
  });
  it("handles outside and legacy records without inventing provenance", () => {
    expect(ownerInvoicePaymentRecord({ ...invoice, paymentSource: "outside" }, [attempt], [], [], true)).toMatchObject({ source: "outside", platformFeeCents: 0, paymentAmountCents: null, references: null });
    expect(ownerInvoicePaymentRecord({ ...invoice, canonicalPaymentAttemptId: undefined }, [], [], [], true)).toMatchObject({ platformFeeCents: null, paymentAmountCents: null, references: null });
    expect(ownerInvoicePaymentRecord({ ...invoice, paymentSource: undefined }, [], [], [], true).source).toBe("unknown");
  });
  it("excludes unrelated attempts, exceptions and unverified financial events", () => {
    const issued = { ...invoice, status: "issued" };
    const foreignAttempt = { ...attempt, companyId: "foreign", status: "reconciliation_required" };
    const foreignException = { invoiceIdCandidate: "invoice", companyIdCandidate: "foreign" };
    expect(invoicePaymentLifecycle(issued, [foreignAttempt], [foreignException])).toEqual({ state: "payable", needsAttention: false });
    const events = [{ attemptId: "canonical", contextValid: false, eventType: "charge.refunded", createdAt: 30 }, { attemptId: "other", contextValid: true, eventType: "charge.dispute.created", createdAt: 30 }];
    const record = ownerInvoicePaymentRecord(invoice, [attempt], [], events, false);
    expect(record).toMatchObject({ hasRefundEvidence: false, hasDisputeEvidence: false, references: null });
    expect(record.history).toHaveLength(2);
  });
  it("keeps review problems visible even alongside an open attempt or a canonical paid invoice", () => {
    const exception = { invoiceIdCandidate: "invoice", companyIdCandidate: "company", createdAt: 25 };
    expect(invoicePaymentLifecycle({ ...invoice, status: "issued" }, [{ ...attempt, status: "open" }], [exception])).toEqual({ state: "attention", needsAttention: true });
    expect(invoicePaymentLifecycle(invoice, [attempt], [exception])).toEqual({ state: "paid", needsAttention: true });
  });
});
