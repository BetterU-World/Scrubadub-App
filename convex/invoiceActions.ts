"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireClientSession, requireOwnerSession } from "./lib/sessions";
import { getStripeClientOrNull } from "./lib/stripe";
import { sendInvoiceEmail } from "./lib/email";

export const sendInvoice = action({
  args: { userId: v.id("users"), sessionToken: v.string(), invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const payload: any = await ctx.runQuery((internal as any).invoiceDeliveryInternal.getForOwnerDelivery, { companyId: owner.companyId, invoiceId: args.invoiceId });
    const viewUrl = `${(process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "")}/client/home#billing`;
    if (!await sendInvoiceEmail({ ...payload, viewUrl })) throw new Error("Invoice email could not be sent");
    return await ctx.runMutation((internal as any).invoiceDeliveryInternal.markSent, { companyId: owner.companyId, invoiceId: args.invoiceId });
  },
});

export const createInvoiceCheckout = action({
  args: { clientUserId: v.id("clientUsers"), sessionToken: v.string(), invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const principal = await requireClientSession(ctx, args.sessionToken);
    if (principal.clientUserId !== args.clientUserId) throw new Error("Session principal does not match client");
    await ctx.runMutation(internal.rateLimitInternal.enforce, { key: `client:${principal.clientUserId}:invoice-checkout`, limit: 3, windowMs: 60_000 });
    const data: any = await ctx.runQuery((internal as any).invoiceDeliveryInternal.getForClientPayment, { clientUserId: principal.clientUserId, invoiceId: args.invoiceId });
    const stripe = getStripeClientOrNull(); if (!stripe) throw new Error("Stripe is not configured");
    const appUrl = process.env.APP_URL ?? "http://localhost:5173";
    const session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price_data: { currency: "usd", product_data: { name: `Invoice ${data.invoiceNumber}` }, unit_amount: data.totalCents }, quantity: 1 }], payment_intent_data: { transfer_data: { destination: data.destinationAccountId }, metadata: { invoiceId: String(data.invoiceId) } }, metadata: { type: "commercial_invoice_payment", invoiceId: String(data.invoiceId) }, success_url: `${appUrl}/client/home?invoice_payment=success#billing`, cancel_url: `${appUrl}/client/home?invoice_payment=cancel#billing` }, { idempotencyKey: `invoice:${data.invoiceId}:checkout` });
    return { url: session.url };
  },
});
