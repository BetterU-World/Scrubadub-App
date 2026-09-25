import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { assertInvoiceInvariant, invoiceDisplayLines } from "./lib/invoiceModel";
import { calculateInvoiceTotals } from "./lib/invoiceAddOnLineItems";

export const PLATFORM_FEE_CENTS = 200;

async function payable(ctx: any, invoiceId: any, clientUserId: any) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice || invoice.status !== "issued") throw new Error("Invoice is not payable");
  const type = assertInvoiceInvariant(invoice);
  const relationship = invoice.clientRelationshipId ? await ctx.db.get(invoice.clientRelationshipId) : null;
  if (!relationship || relationship.status !== "active" || relationship.companyId !== invoice.companyId || relationship.clientUserId !== clientUserId) throw new Error("Access denied");
  const client = await ctx.db.get(clientUserId);
  if (!client || client.status !== "active") throw new Error("Client portal access required");
  const company = await ctx.db.get(invoice.companyId);
  if (!company?.stripeConnectAccountId) throw new Error("Online payments are unavailable for this company");
  const totals = calculateInvoiceTotals(invoice.baseSubtotalCents ?? invoice.subtotalCents, invoiceDisplayLines(invoice), invoice.taxCents);
  if (!Number.isSafeInteger(invoice.totalCents) || invoice.totalCents < PLATFORM_FEE_CENTS || totals.totalCents !== invoice.totalCents || totals.subtotalCents !== invoice.subtotalCents) throw new Error("Invoice total is not payable online");
  return { invoice, type, relationship, company };
}

export const inspect = internalQuery({
  args: { invoiceId: v.id("invoices"), clientUserId: v.id("clientUsers") },
  handler: async (ctx, args) => {
    const { invoice, type, relationship, company } = await payable(ctx, args.invoiceId, args.clientUserId);
    const attempts = await ctx.db.query("invoicePaymentAttempts").withIndex("by_invoiceId", q => q.eq("invoiceId", invoice._id)).collect();
    const active = attempts.find(a => a.status === "creating" || a.status === "open");
    return { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, invoiceType: type, companyId: invoice.companyId, clientRelationshipId: relationship._id, amountCents: invoice.totalCents, destinationStripeAccountId: company.stripeConnectAccountId, activeAttemptId: active?._id, activeSessionId: active?.stripeCheckoutSessionId };
  },
});

export const reserve = internalMutation({
  args: { invoiceId: v.id("invoices"), clientUserId: v.id("clientUsers"), destinationStripeAccountId: v.string() },
  handler: async (ctx, args) => {
    const { invoice, type, relationship, company } = await payable(ctx, args.invoiceId, args.clientUserId);
    if (company.stripeConnectAccountId !== args.destinationStripeAccountId) throw new Error("Online payment account changed");
    const attempts = await ctx.db.query("invoicePaymentAttempts").withIndex("by_invoiceId", q => q.eq("invoiceId", invoice._id)).collect();
    const active = attempts.find(a => a.status === "creating" || a.status === "open");
    if (active) return active._id;
    const now = Date.now();
    return await ctx.db.insert("invoicePaymentAttempts", { companyId: invoice.companyId, invoiceId: invoice._id, invoiceType: type, clientRelationshipId: relationship._id, amountCents: invoice.totalCents, currency: "usd", destinationStripeAccountId: args.destinationStripeAccountId, platformFeeCents: PLATFORM_FEE_CENTS, status: "creating", createdAt: now, updatedAt: now });
  },
});

export const getCreation = internalQuery({ args: { attemptId: v.id("invoicePaymentAttempts") }, handler: async (ctx, args) => await ctx.db.get(args.attemptId) });
export const getByCheckoutSession = internalQuery({ args: { sessionId: v.string() }, handler: async (ctx, args) => await ctx.db.query("invoicePaymentAttempts").withIndex("by_stripeCheckoutSessionId", q => q.eq("stripeCheckoutSessionId", args.sessionId)).first() });

export const getOpenForInvoice = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => (await ctx.db.query("invoicePaymentAttempts").withIndex("by_invoiceId", q => q.eq("invoiceId", args.invoiceId)).collect()).filter(a => a.status === "creating" || a.status === "open").map(a => ({ _id: a._id, stripeCheckoutSessionId: a.stripeCheckoutSessionId })),
});

export const opened = internalMutation({
  args: { attemptId: v.id("invoicePaymentAttempts"), sessionId: v.string(), url: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || !["creating", "open"].includes(attempt.status)) throw new Error("Payment attempt is no longer open");
    if (attempt.stripeCheckoutSessionId && attempt.stripeCheckoutSessionId !== args.sessionId) throw new Error("Checkout session mismatch");
    await ctx.db.patch(args.attemptId, { status: "open", stripeCheckoutSessionId: args.sessionId, stripeCheckoutUrl: args.url, updatedAt: Date.now() });
  },
});

export const markUnavailable = internalMutation({
  args: { attemptId: v.id("invoicePaymentAttempts"), status: v.union(v.literal("failed"), v.literal("expired")) },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (attempt && ["creating", "open"].includes(attempt.status)) await ctx.db.patch(args.attemptId, { status: args.status, updatedAt: Date.now() });
  },
});

export const recordException = internalMutation({
  args: { sessionId: v.string(), paymentIntentId: v.optional(v.string()), invoiceIdCandidate: v.optional(v.string()), companyIdCandidate: v.optional(v.string()), reason: v.string(), amountCents: v.optional(v.number()), currency: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const prior = await ctx.db.query("invoicePaymentExceptions").withIndex("by_stripeCheckoutSessionId", q => q.eq("stripeCheckoutSessionId", args.sessionId)).first();
    if (!prior) await ctx.db.insert("invoicePaymentExceptions", { stripeCheckoutSessionId: args.sessionId, stripePaymentIntentId: args.paymentIntentId, invoiceIdCandidate: args.invoiceIdCandidate, companyIdCandidate: args.companyIdCandidate, reason: args.reason, amountCents: args.amountCents, currency: args.currency, createdAt: Date.now() });
  },
});

export const applySuccess = internalMutation({
  args: { attemptId: v.id("invoicePaymentAttempts"), sessionId: v.string(), paymentIntentId: v.string(), amountCents: v.number(), currency: v.string(), destination: v.string(), feeCents: v.number(), invoiceIdMetadata: v.optional(v.string()), companyIdMetadata: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Unknown payment attempt");
    if (attempt.status === "paid" && attempt.stripeCheckoutSessionId === args.sessionId && attempt.stripePaymentIntentId === args.paymentIntentId) return "already_paid";
    if (attempt.status === "paid") {
      const prior = await ctx.db.query("invoicePaymentExceptions").withIndex("by_stripeCheckoutSessionId", q => q.eq("stripeCheckoutSessionId", args.sessionId)).first();
      if (!prior) await ctx.db.insert("invoicePaymentExceptions", { stripeCheckoutSessionId: args.sessionId, stripePaymentIntentId: args.paymentIntentId, invoiceIdCandidate: String(attempt.invoiceId), companyIdCandidate: String(attempt.companyId), reason: "paid_attempt_identity_conflict", amountCents: args.amountCents, currency: args.currency, createdAt: Date.now() });
      return "reconciliation_required";
    }
    const invoice = await ctx.db.get(attempt.invoiceId);
    const mismatch = !invoice || invoice.companyId !== attempt.companyId || invoice.clientRelationshipId !== attempt.clientRelationshipId || invoice.totalCents !== attempt.amountCents || attempt.stripeCheckoutSessionId !== args.sessionId || (attempt.stripePaymentIntentId && attempt.stripePaymentIntentId !== args.paymentIntentId) || attempt.amountCents !== args.amountCents || args.currency !== "usd" || attempt.currency !== "usd" || attempt.destinationStripeAccountId !== args.destination || attempt.platformFeeCents !== PLATFORM_FEE_CENTS || args.feeCents !== PLATFORM_FEE_CENTS || String(attempt.invoiceId) !== args.invoiceIdMetadata || String(attempt.companyId) !== args.companyIdMetadata;
    const reason = mismatch ? "payment_facts_mismatch" : invoice.status !== "issued" || invoice.canonicalPaymentAttemptId ? "invoice_no_longer_payable_or_duplicate" : null;
    const now = Date.now();
    if (reason) {
      if (attempt.stripeCheckoutSessionId !== args.sessionId) {
        const prior = await ctx.db.query("invoicePaymentExceptions").withIndex("by_stripeCheckoutSessionId", q => q.eq("stripeCheckoutSessionId", args.sessionId)).first();
        if (!prior) await ctx.db.insert("invoicePaymentExceptions", { stripeCheckoutSessionId: args.sessionId, stripePaymentIntentId: args.paymentIntentId, invoiceIdCandidate: String(attempt.invoiceId), companyIdCandidate: String(attempt.companyId), reason, amountCents: args.amountCents, currency: args.currency, createdAt: now });
        return "reconciliation_required";
      }
      await ctx.db.patch(attempt._id, { status: "reconciliation_required", stripeCheckoutSessionId: args.sessionId, stripePaymentIntentId: args.paymentIntentId, exceptionReason: reason, completedAt: now, updatedAt: now });
      return "reconciliation_required";
    }
    await ctx.db.patch(attempt._id, { status: "paid", stripePaymentIntentId: args.paymentIntentId, completedAt: now, updatedAt: now });
    await ctx.db.patch(invoice!._id, { status: "paid", paymentSource: "online", canonicalPaymentAttemptId: attempt._id, stripeCheckoutSessionId: args.sessionId, stripePaymentIntentId: args.paymentIntentId, paidAt: now, updatedAt: now });
    return "paid";
  },
});
