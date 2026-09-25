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
