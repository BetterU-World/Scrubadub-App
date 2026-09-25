import { checkedPriceSnapshot } from "./jobPricing";

export function invoiceType(invoice: any): "commercial" | "job" {
  if (invoice.invoiceType === "job") return "job";
  if ((invoice.invoiceType === "commercial" || invoice.invoiceType === undefined) && invoice.commercialAccountId && invoice.billingStartDate && invoice.billingEndDate) return "commercial";
  throw new Error("Invoice type fields are inconsistent");
}

export function assertInvoiceInvariant(invoice: any) {
  const type = invoiceType(invoice);
  if (type === "commercial") {
    if (invoice.sourceJobId || invoice.jobPricingSnapshot || !invoice.commercialAccountId || !invoice.billingStartDate || !invoice.billingEndDate || !invoice.issueDate || !invoice.dueDate) throw new Error("Invalid commercial invoice");
  } else {
    if (invoice.commercialAccountId || invoice.billingStartDate || invoice.billingEndDate || !invoice.sourceJobId || invoice.jobIds?.length !== 1 || invoice.jobIds[0] !== invoice.sourceJobId || !invoice.clientRelationshipId || !invoice.jobPricingSnapshot || !invoice.billToSnapshot || !invoice.serviceSnapshot || !Number.isSafeInteger(invoice.paymentDueDays) || invoice.paymentDueDays < 0 || invoice.paymentDueDays > 365) throw new Error("Invalid job invoice");
    const price = invoice.jobPricingSnapshot;
    if (!Number.isSafeInteger(price.pricingRevision) || price.pricingRevision < 1 || !Number.isSafeInteger(price.consentAcceptedAt) || price.consentAcceptedAt <= 0 || (price.pricingSource === "accepted_proposal" ? !price.proposalIssueId || !!price.offerId : !price.offerId || !!price.proposalIssueId) || (price.consentSource === "client_in_app" && price.pricingSource !== "accepted_proposal" && !price.consentClientUserId) || (price.consentSource === "owner_reported_outside" && !price.consentRecordedByUserId)) throw new Error("Invalid job invoice provenance");
    const checked = checkedPriceSnapshot(price.baseChargeCents, price.addOns);
    const addOnSubtotalCents = checked.totalCents - checked.baseChargeCents;
    if (price.currency !== "usd" || checked.totalCents !== price.totalCents || invoice.baseSubtotalCents !== price.baseChargeCents || invoice.addOnSubtotalCents !== addOnSubtotalCents || invoice.subtotalCents !== price.totalCents || invoice.taxCents !== 0 || invoice.totalCents !== price.totalCents || (invoice.status !== "draft" && (!invoice.issueDate || !invoice.dueDate))) throw new Error("Invalid job invoice totals");
  }
  return type;
}

export function invoiceDisplayLines(invoice: any) {
  return invoiceType(invoice) === "job"
    ? invoice.jobPricingSnapshot.addOns.map((line: any) => ({ ...line, lineTotalCents: line.amountCents, billingCadence: "one_time" as const }))
    : invoice.addOnLineItems ?? [];
}
