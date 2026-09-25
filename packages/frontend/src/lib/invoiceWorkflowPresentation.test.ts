import { describe, expect, it } from "vitest";
import en from "../i18n/en/common.json";
import es from "../i18n/es/common.json";
import { invoiceEmailActionKey, jobBillingView } from "./invoiceWorkflowPresentation";

describe("invoice workflow presentation", () => {
  it("offers billing review only for approved, uninvoiced commercial jobs with invoice permission", () => {
    const base = { commercialAccountId: "account", jobStatus: "approved", hasInvoice: false, canRead: true, canManage: true };
    expect(jobBillingView(base)).toBe("eligible");
    expect(jobBillingView({ ...base, jobStatus: "scheduled" })).toBe("awaiting_approval");
    expect(jobBillingView({ ...base, commercialAccountId: undefined })).toBe("hidden");
    expect(jobBillingView({ ...base, hasInvoice: true })).toBe("existing");
    expect(jobBillingView({ ...base, canManage: false })).toBe("read_only");
    expect(jobBillingView({ ...base, canRead: false, canManage: false })).toBe("hidden");
  });

  it("distinguishes email from resend and uses neutral paid copy in both languages", () => {
    expect(invoiceEmailActionKey()).toBe("invoices.send");
    expect(invoiceEmailActionKey(123)).toBe("invoices.resend");
    for (const copy of [en, es]) {
      expect(copy.invoices.send).toBeTruthy();
      expect(copy.invoices.resend).toBeTruthy();
      expect(copy.invoices.issueHelper).toBeTruthy();
      expect(copy.invoices.paidNote).toBeTruthy();
      expect(copy.invoices.paidNote).not.toMatch(/no Stripe|No se procesó/);
    }
  });
});
