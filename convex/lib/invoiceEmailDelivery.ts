import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertInvoiceInvariant, invoiceDisplayLines } from "./invoiceModel";
import { calculateInvoiceTotals, publicInvoiceAddOns } from "./invoiceAddOnLineItems";

export const INVOICE_EMAIL_CLAIM_MS = 10 * 60_000;
export const invoiceEmailState = v.union(v.literal("pending"), v.literal("provider_accepted"), v.literal("failed"), v.literal("unknown"), v.literal("skipped"));
export const invoiceEmailResponse = v.object({ attemptId: v.id("transactionalDocumentDeliveryAttempts"), status: invoiceEmailState, sentAt: v.union(v.number(), v.null()) });
export const invoiceEmailPayloadValidator = v.object({
  recipientEmail: v.string(), clientName: v.string(), companyName: v.string(), replyTo: v.optional(v.string()),
  relationshipId: v.id("clientRelationships"), clientUserId: v.id("clientUsers"),
  invoice: v.object({ invoiceNumber: v.string(), title: v.string(), dueDate: v.string(), invoiceType: v.union(v.literal("job"), v.literal("commercial")),
    baseSubtotalCents: v.number(), addOnSubtotalCents: v.number(), subtotalCents: v.number(), taxCents: v.number(), totalCents: v.number(),
    addOnLineItems: v.array(v.object({ name: v.string(), quantity: v.optional(v.number()), unitLabel: v.optional(v.string()), lineTotalCents: v.number() })) }),
});
export class InvoiceEmailIneligible extends Error {}

type Ctx = QueryCtx | MutationCtx;

export async function invoiceEmailPayload(ctx: Ctx, companyId: Id<"companies">, invoiceId: Id<"invoices">) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice || invoice.companyId !== companyId) throw new InvoiceEmailIneligible("Access denied");
  const type = assertInvoiceInvariant(invoice);
  if (invoice.status !== "issued") throw new InvoiceEmailIneligible("Only issued invoices can be sent");
  const relationship = invoice.clientRelationshipId ? await ctx.db.get(invoice.clientRelationshipId) : null;
  if (!relationship || relationship.companyId !== companyId) throw new InvoiceEmailIneligible("A linked client relationship is required");
  const client = relationship.clientUserId ? await ctx.db.get(relationship.clientUserId) : null;
  if (relationship.status !== "active" || !client || client.status !== "active") throw new InvoiceEmailIneligible("Client portal access is required before emailing this invoice");
  const email = relationship.email?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvoiceEmailIneligible("A valid client email is required");
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company unavailable");
  const validEmail = (value?: string): value is string => !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  let replyTo = validEmail(company.contactEmail) ? company.contactEmail.trim() : undefined;
  if (!replyTo) {
    const owners = await ctx.db.query("users").withIndex("by_companyId_role",
      q => q.eq("companyId", companyId).eq("role", "owner")).take(1001);
    if (owners.length > 1000) throw new Error("Too many invoice sender owners");
    replyTo = owners.find(owner => owner.status === "active" && validEmail(owner.email))?.email.trim();
  }
  const totals = calculateInvoiceTotals(invoice.baseSubtotalCents ?? invoice.subtotalCents, invoiceDisplayLines(invoice), invoice.taxCents);
  if (totals.totalCents !== invoice.totalCents || totals.subtotalCents !== invoice.subtotalCents) throw new Error("Invoice totals failed integrity validation");
  const lines = type === "job" ? invoiceDisplayLines(invoice) : publicInvoiceAddOns(invoice.addOnLineItems);
  return { recipientEmail: email, clientName: invoice.billToSnapshot?.displayName ?? relationship.displayName,
    companyName: company.companyDisplayName ?? company.name ?? "Your Cleaning Company", replyTo,
    relationshipId: relationship._id, clientUserId: client._id,
    invoice: { invoiceNumber: invoice.invoiceNumber, title: invoice.title, dueDate: invoice.dueDate!, invoiceType: type, ...totals,
      addOnLineItems: lines.map((line: { name: string; quantity?: number; unitLabel?: string; lineTotalCents: number }) =>
        ({ name: line.name, quantity: line.quantity, unitLabel: line.unitLabel, lineTotalCents: line.lineTotalCents })) } };
}

export function invoiceAttemptResponse(attempt: Doc<"transactionalDocumentDeliveryAttempts">) {
  const status = ["pending", "provider_accepted", "failed", "unknown", "skipped"].includes(attempt.result)
    ? attempt.result as "pending" | "provider_accepted" | "failed" | "unknown" | "skipped" : "unknown";
  return { attemptId: attempt._id, status, sentAt: status === "provider_accepted" ? attempt.resultAt ?? null : null };
}

export async function invoiceEmailSummary(ctx: Ctx, invoice: Doc<"invoices">) {
  const attempt = invoice.latestEmailAttemptId ? await ctx.db.get(invoice.latestEmailAttemptId) : null;
  if (!attempt) return { attemptId: null, status: invoice.latestEmailAttemptId ? "unknown" : invoice.sentAt ? "unverified" : "not_sent", at: null };
  if (attempt.companyId !== invoice.companyId || attempt.documentKind !== "invoice" || attempt.documentId !== String(invoice._id)) {
    return { attemptId: null, status: "unknown", at: null };
  }
  return { attemptId: attempt._id, status: invoiceAttemptResponse(attempt).status, at: attempt.resultAt ?? attempt.attemptedAt };
}
