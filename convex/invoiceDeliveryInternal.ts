import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { calculateInvoiceTotals } from "./lib/invoiceAddOnLineItems";
import { assertInvoiceInvariant, invoiceDisplayLines } from "./lib/invoiceModel";
import { internal } from "./_generated/api";
import { requireOwnerOrManagerCapability } from "./lib/sessionAuth";
import { invoiceEmailPayload, invoiceEmailPayloadValidator, invoiceEmailResponse, invoiceAttemptResponse, INVOICE_EMAIL_CLAIM_MS } from "./lib/invoiceEmailDelivery";
import { sendOutcome } from "./lib/operationalEmailModel";
import { operationalEmailResult } from "./lib/operationalEmailResult";

function verifiedTotals(invoice: any) {
  const totals = calculateInvoiceTotals(invoice.baseSubtotalCents ?? invoice.subtotalCents, invoiceDisplayLines(invoice), invoice.taxCents);
  if (totals.totalCents !== invoice.totalCents || totals.subtotalCents !== invoice.subtotalCents) throw new Error("Invoice totals failed integrity validation");
  return totals;
}

export const getForOwnerDelivery = internalQuery({
  args: { companyId: v.id("companies"), invoiceId: v.id("invoices") },
  returns: invoiceEmailPayloadValidator,
  handler: async (ctx, args) => {
    return invoiceEmailPayload(ctx, args.companyId, args.invoiceId);
  },
});
export const getForClientPayment = internalQuery({
  args: { clientUserId: v.id("clientUsers"), invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice: any = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.status !== "issued") throw new Error("Invoice is not payable");
    assertInvoiceInvariant(invoice);
    const relationship: any = invoice.clientRelationshipId ? await ctx.db.get(invoice.clientRelationshipId) : null;
    if (!relationship || relationship.status !== "active" || relationship.clientUserId !== args.clientUserId || relationship.companyId !== invoice.companyId) throw new Error("Access denied");
    const company: any = await ctx.db.get(invoice.companyId);
    if (!company?.stripeConnectAccountId) throw new Error("This company has not enabled online invoice payments");
    return { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, totalCents: verifiedTotals(invoice).totalCents, destinationAccountId: company.stripeConnectAccountId };
  },
});

export const markSent = internalMutation({
  args: { companyId: v.id("companies"), invoiceId: v.id("invoices") },
  returns: v.object({ sentAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const invoice: any = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.companyId !== args.companyId || invoice.status !== "issued") throw new Error("Invoice is not sendable");
    // Compatibility tombstone: old in-flight actions cannot prove provider acceptance.
    // Keep their validator contract, but never manufacture transport evidence.
    return { sentAt: invoice.sentAt ?? null };
  },
});

const actorArgs = { userId: v.id("users"), sessionToken: v.string() };
const attemptId = v.id("transactionalDocumentDeliveryAttempts");

export const prepareEmail = internalMutation({
  args: { ...actorArgs, invoiceId: v.id("invoices"), requestKey: v.optional(v.string()),
    resend: v.optional(v.boolean()), previousAttemptId: v.optional(attemptId) },
  returns: v.object({ claimed: v.boolean(), response: invoiceEmailResponse }),
  handler: async (ctx, args) => {
    const actor = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageInvoices");
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.companyId !== actor.companyId) throw new Error("Access denied");
    if (args.requestKey !== undefined && !/^[A-Za-z0-9_-]{16,128}$/.test(args.requestKey)) throw new Error("Invalid email request key");
    const requestKey = args.requestKey ?? "legacy-initial";
    const replay = await ctx.db.query("transactionalDocumentDeliveryAttempts").withIndex("by_document_request",
      q => q.eq("documentKind", "invoice").eq("documentId", String(invoice._id)).eq("requestKey", requestKey)).unique();
    if (replay) {
      if (replay.companyId !== actor.companyId) throw new Error("Access denied");
      if (replay.result === "pending" && replay.claimExpiresAt !== undefined && replay.claimExpiresAt <= Date.now()) {
        await ctx.db.patch(replay._id, { result: "unknown", resultAt: Date.now(), errorCategory: "claim_expired" });
        return { claimed: false, response: { ...invoiceAttemptResponse(replay), status: "unknown" as const } };
      }
      return { claimed: false, response: invoiceAttemptResponse(replay) };
    }
    const latest = invoice.latestEmailAttemptId ? await ctx.db.get(invoice.latestEmailAttemptId) : null;
    if (invoice.latestEmailAttemptId && (!latest || latest.companyId !== actor.companyId || latest.documentKind !== "invoice" || latest.documentId !== String(invoice._id))) {
      throw new Error("Invoice email history needs review; do not resend");
    }
    if (latest?.result === "pending" && latest.claimExpiresAt !== undefined && latest.claimExpiresAt <= Date.now()) {
      await ctx.db.patch(latest._id, { result: "unknown", resultAt: Date.now(), errorCategory: "claim_expired" });
      return { claimed: false, response: { ...invoiceAttemptResponse(latest), status: "unknown" as const } };
    }
    if (latest && (!args.resend || latest.result === "pending" || latest.result === "unknown")) {
      return { claimed: false, response: invoiceAttemptResponse(latest) };
    }
    if (latest && args.previousAttemptId !== latest._id) throw new Error("Email state changed. Review it before sending another email.");
    if (!latest && args.previousAttemptId) throw new Error("Email state changed. Review it before sending another email.");
    if (!latest && invoice.sentAt && !args.resend) throw new Error("Legacy email history is unverified. Confirm a deliberate resend.");
    const payload = await invoiceEmailPayload(ctx, actor.companyId, invoice._id);
    const now = Date.now();
    const id = await ctx.db.insert("transactionalDocumentDeliveryAttempts", { companyId: actor.companyId,
      documentKind: "invoice", documentId: String(invoice._id), issueId: String(invoice._id), channel: "email",
      requestKey, actorUserId: actor._id, relationshipId: payload.relationshipId, clientUserId: payload.clientUserId,
      attemptedAt: now, result: "pending", claimExpiresAt: now + INVOICE_EMAIL_CLAIM_MS });
    await ctx.db.patch(invoice._id, { latestEmailAttemptId: id });
    await ctx.scheduler.runAfter(INVOICE_EMAIL_CLAIM_MS, internal.invoiceDeliveryInternal.expireEmail, { attemptId: id });
    return { claimed: true, response: { attemptId: id, status: "pending" as const, sentAt: null } };
  },
});

export const authorizeDispatch = internalMutation({
  args: { ...actorArgs, attemptId }, returns: v.union(v.null(), invoiceEmailPayloadValidator),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.documentKind !== "invoice" || attempt.result !== "pending" || attempt.sendStartedAt !== undefined) return null;
    if (attempt.claimExpiresAt === undefined || attempt.claimExpiresAt <= Date.now()) {
      await ctx.db.patch(attempt._id, { result: "unknown", resultAt: Date.now(), errorCategory: "claim_expired" }); return null;
    }
    try {
      const actor = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageInvoices");
      if (attempt.actorUserId !== actor._id || attempt.companyId !== actor.companyId) return null;
      const id = ctx.db.normalizeId("invoices", attempt.documentId);
      const invoice = id ? await ctx.db.get(id) : null;
      if (!invoice || invoice.latestEmailAttemptId !== attempt._id) return null;
      const payload = await invoiceEmailPayload(ctx, actor.companyId, invoice._id);
      if (payload.relationshipId !== attempt.relationshipId || payload.clientUserId !== attempt.clientUserId) return null;
      await ctx.db.patch(attempt._id, { sendStartedAt: Date.now() });
      return payload;
    } catch { return null; }
  },
});

export const finishEmail = internalMutation({
  args: { attemptId, outcome: sendOutcome }, returns: invoiceEmailResponse,
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.documentKind !== "invoice") throw new Error("Invoice email attempt unavailable");
    const positive = args.outcome.status === "provider_accepted"
      ? operationalEmailResult({ error: null, data: { id: args.outcome.providerMessageId } }) : args.outcome;
    if (attempt.result !== "pending" && !(attempt.result === "unknown" && attempt.errorCategory === "claim_expired" && positive.status === "provider_accepted")) {
      return invoiceAttemptResponse(attempt);
    }
    const now = Date.now();
    const expired = attempt.claimExpiresAt === undefined || attempt.claimExpiresAt <= now;
    const outcome = expired && positive.status !== "provider_accepted" ? { status: "unknown" as const, category: "claim_expired" } : positive;
    const result = outcome.status;
    const providerMessageId = outcome.status === "provider_accepted" ? outcome.providerMessageId : undefined;
    await ctx.db.patch(attempt._id, { result, resultAt: now, providerMessageId,
      errorCategory: outcome.status === "provider_accepted" ? undefined : outcome.category });
    // Preserve financial status, amounts and payment evidence, even if paid/void/deleted after send.
    const id = ctx.db.normalizeId("invoices", attempt.documentId);
    const invoice = id ? await ctx.db.get(id) : null;
    if (result === "provider_accepted" && invoice?.companyId === attempt.companyId) await ctx.db.patch(invoice._id, { sentAt: now });
    return { attemptId: attempt._id, status: result, sentAt: result === "provider_accepted" ? now : null };
  },
});

export const expireEmail = internalMutation({
  args: { attemptId }, returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (attempt?.documentKind === "invoice" && attempt.result === "pending" && attempt.claimExpiresAt !== undefined && attempt.claimExpiresAt <= Date.now()) {
      await ctx.db.patch(attempt._id, { result: "unknown", resultAt: Date.now(), errorCategory: "claim_expired" });
    }
    return null;
  },
});
