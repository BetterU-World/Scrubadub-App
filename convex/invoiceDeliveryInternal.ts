import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { calculateInvoiceTotals, publicInvoiceAddOns } from "./lib/invoiceAddOnLineItems";

function verifiedTotals(invoice: any) {
  const totals = calculateInvoiceTotals(invoice.baseSubtotalCents ?? invoice.subtotalCents, invoice.addOnLineItems ?? [], invoice.taxCents);
  if (totals.totalCents !== invoice.totalCents || totals.subtotalCents !== invoice.subtotalCents) throw new Error("Invoice totals failed integrity validation");
  return totals;
}

export const getForOwnerDelivery = internalQuery({
  args: { companyId: v.id("companies"), invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice: any = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.companyId !== args.companyId) throw new Error("Access denied");
    if (invoice.status !== "issued") throw new Error("Only issued invoices can be sent");
    const relationship: any = invoice.clientRelationshipId ? await ctx.db.get(invoice.clientRelationshipId) : null;
    if (!relationship || relationship.companyId !== invoice.companyId || !relationship.email) throw new Error("Client email is required");
    const company: any = await ctx.db.get(invoice.companyId);
    return { recipientEmail: relationship.email, clientName: relationship.displayName, companyName: company?.companyDisplayName ?? company?.name ?? "Your Cleaning Company", invoice: { invoiceNumber: invoice.invoiceNumber, title: invoice.title, dueDate: invoice.dueDate, ...verifiedTotals(invoice), addOnLineItems: publicInvoiceAddOns(invoice.addOnLineItems) } };
  },
});

export const getForClientPayment = internalQuery({
  args: { clientUserId: v.id("clientUsers"), invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice: any = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.status !== "issued") throw new Error("Invoice is not payable");
    const relationship: any = invoice.clientRelationshipId ? await ctx.db.get(invoice.clientRelationshipId) : null;
    if (!relationship || relationship.clientUserId !== args.clientUserId || relationship.companyId !== invoice.companyId) throw new Error("Access denied");
    const company: any = await ctx.db.get(invoice.companyId);
    if (!company?.stripeConnectAccountId) throw new Error("This company has not enabled online invoice payments");
    return { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, totalCents: verifiedTotals(invoice).totalCents, destinationAccountId: company.stripeConnectAccountId };
  },
});

export const markSent = internalMutation({
  args: { companyId: v.id("companies"), invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice: any = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.companyId !== args.companyId || invoice.status !== "issued") throw new Error("Invoice is not sendable");
    const sentAt = Date.now(); await ctx.db.patch(args.invoiceId, { sentAt, updatedAt: sentAt }); return { sentAt };
  },
});

export const markPaidFromCheckout = internalMutation({
  args: { invoiceId: v.id("invoices"), stripeCheckoutSessionId: v.string(), stripePaymentIntentId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const invoice: any = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.status === "void") return;
    if (invoice.status === "paid") return;
    if (invoice.status !== "issued") throw new Error("Invoice is not payable");
    const now = Date.now();
    await ctx.db.patch(args.invoiceId, { status: "paid", paidAt: now, updatedAt: now, stripeCheckoutSessionId: args.stripeCheckoutSessionId, stripePaymentIntentId: args.stripePaymentIntentId });
  },
});
