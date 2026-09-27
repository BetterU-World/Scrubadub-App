import { describe, expect, it } from "vitest";
import { invoicePlatformFeeCents, invoicePaymentProcessing } from "../invoiceModel";

const invoice = { _id: "invoice", companyId: "company", status: "paid", paymentSource: "online", canonicalPaymentAttemptId: "canonical" };
const attempt = { _id: "canonical", invoiceId: "invoice", companyId: "company", platformFeeCents: 0 };

describe("defensive invoice payment presentation", () => {
  it("shows zero for outside payment even when old online evidence remains", () => {
    expect(invoicePlatformFeeCents({ ...invoice, paymentSource: "outside" }, [{ ...attempt, platformFeeCents: 200 }])).toBe(0);
  });
  it.each([undefined, null, -1, NaN, 1.5])("does not invent a fee when frozen data is %s", fee => {
    expect(invoicePlatformFeeCents(invoice, [{ ...attempt, platformFeeCents: fee }])).toBeNull();
  });
  it("ignores unrelated provenance and preserves a historical destination fee", () => {
    expect(invoicePlatformFeeCents(invoice, [{ ...attempt, companyId: "other", platformFeeCents: 200 }])).toBeNull();
    expect(invoicePlatformFeeCents(invoice, [{ ...attempt, platformFeeCents: 200 }])).toBe(200);
    expect(invoicePaymentProcessing({ ...invoice, status: "issued" }, [{ ...attempt, invoiceId: "other", status: "open" }])).toBe(false);
  });
});
