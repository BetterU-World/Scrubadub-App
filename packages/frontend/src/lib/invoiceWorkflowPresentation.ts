export function jobBillingView(input: {
  commercialAccountId?: string;
  jobStatus: string;
  hasInvoice: boolean;
  canRead: boolean;
  canManage: boolean;
}): "hidden" | "existing" | "awaiting_approval" | "read_only" | "eligible" {
  if (!input.commercialAccountId || !input.canRead) return "hidden";
  if (input.hasInvoice) return "existing";
  if (input.jobStatus !== "approved") return "awaiting_approval";
  return input.canManage ? "eligible" : "read_only";
}

export function invoiceEmailActionKey(sentAt?: number): "invoices.send" | "invoices.resend" {
  return sentAt ? "invoices.resend" : "invoices.send";
}

export function invoiceEmailPresentation(status: string) {
  const known = ["not_sent", "unverified", "pending", "provider_accepted", "failed", "unknown", "skipped"];
  const safeStatus = known.includes(status) ? status : "unknown";
  return { messageKey: `invoiceDelivery.${safeStatus}`, blocked: safeStatus === "pending" || safeStatus === "unknown",
    resend: safeStatus !== "not_sent", actionKey: safeStatus === "not_sent" ? "invoices.send" : "invoiceDelivery.sendAnother" };
}
