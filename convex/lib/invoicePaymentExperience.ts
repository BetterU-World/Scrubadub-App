import { invoicePlatformFeeCents } from "./invoiceModel";

function scopedAttempts(invoice: any, attempts: any[]) {
  return attempts.filter(a => a.invoiceId === invoice._id && a.companyId === invoice.companyId);
}

export function paymentNeedsAttention(invoice: any, attempts: any[], exceptions: any[]) {
  return scopedAttempts(invoice, attempts).some(a => a.status === "reconciliation_required" || (invoice.status === "issued" && a.status === "paid")) ||
    exceptions.some(e => e.invoiceIdCandidate === String(invoice._id) && (!e.companyIdCandidate || e.companyIdCandidate === String(invoice.companyId)));
}

export function invoicePaymentLifecycle(invoice: any, attempts: any[], exceptions: any[]) {
  const needsAttention = paymentNeedsAttention(invoice, attempts, exceptions);
  const scoped = scopedAttempts(invoice, attempts);
  const latest = [...scoped].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0];
  const state = invoice.status === "paid" ? "paid" : invoice.status !== "issued" ? "unavailable" :
    needsAttention ? "attention" : scoped.some(a => a.status === "creating" || a.status === "open") ? "processing" :
    latest?.status === "failed" ? "failed" : latest?.status === "expired" ? "expired" : "payable";
  return { state, needsAttention };
}

/** Stored evidence only. Dates below are record/receipt times, not inferred Stripe event times. */
export function ownerInvoicePaymentRecord(invoice: any, attempts: any[], exceptions: any[], financialEvents: any[], diagnostics: boolean) {
  const scoped = scopedAttempts(invoice, attempts);
  const canonical = scoped.find(a => a._id === invoice.canonicalPaymentAttemptId);
  const lifecycle = invoicePaymentLifecycle(invoice, scoped, exceptions);
  const evidence = financialEvents.filter(e => e.contextValid && scoped.some(a => a._id === e.attemptId));
  const history = scoped.flatMap(a => [
    { kind: "initiated", recordedAt: a.createdAt },
    ...(a.status === "creating" || (a.status === "paid" && a._id === invoice.canonicalPaymentAttemptId) ? [] : [{ kind: a.status, recordedAt: a.completedAt ?? a.updatedAt }]),
  ]);
  if (invoice.status === "paid" && invoice.paidAt) history.push({ kind: invoice.paymentSource === "outside" ? "outside" : "confirmed", recordedAt: invoice.paidAt });
  for (const e of evidence) history.push({ kind: e.eventType, recordedAt: e.createdAt });
  for (const e of exceptions.filter(e => e.invoiceIdCandidate === String(invoice._id) && (!e.companyIdCandidate || e.companyIdCandidate === String(invoice.companyId)))) {
    history.push({ kind: "reconciliation_required", recordedAt: e.createdAt });
  }
  // Support references are permission-gated; never expose a Checkout URL or raw event object.
  return {
    ...lifecycle,
    source: invoice.paymentSource === "online" || invoice.paymentSource === "outside" ? invoice.paymentSource : "unknown",
    invoiceAmountCents: invoice.totalCents,
    paymentAmountCents: invoice.paymentSource === "online" && canonical ? canonical.amountCents : null,
    paidAt: invoice.paidAt ?? null,
    platformFeeCents: invoicePlatformFeeCents(invoice, scoped),
    hasRefundEvidence: evidence.some(e => e.eventType === "charge.refunded"),
    hasDisputeEvidence: evidence.some(e => e.eventType.startsWith("charge.dispute.")),
    history: history.sort((a, b) => a.recordedAt - b.recordedAt),
    references: diagnostics && invoice.paymentSource === "online" && canonical ? {
      paymentIntentId: canonical.stripePaymentIntentId ?? null,
      checkoutSessionId: canonical.stripeCheckoutSessionId ?? null,
      chargeModel: canonical.chargeModel ?? "destination",
    } : null,
  };
}
