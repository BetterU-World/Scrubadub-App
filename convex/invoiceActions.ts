"use node";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, type Infer } from "convex/values";
import { requireClientSession, requireOwnerOrManagerCapability } from "./lib/sessions";
import { getStripeClientOrNull } from "./lib/stripe";
import { deliverInvoiceEmail } from "./lib/email";
import { invoiceEmailResponse } from "./lib/invoiceEmailDelivery";
import type { OperationalEmailOutcome } from "./lib/operationalEmailModel";
import { requireAppUrl, assertInvoicePaymentsEnabled } from "./lib/environment";
import { retrieveCompanyMerchantReadiness } from "./lib/companyStripeMerchant";
import { retrieveCheckoutSessionForAttempt, expireCheckoutSessionForAttempt } from "./lib/invoiceStripeContext";
import { invoiceCheckoutParameters } from "./lib/invoiceCheckoutConfig";

export const sendInvoice = action({
  args: { userId: v.id("users"), sessionToken: v.string(), invoiceId: v.id("invoices"),
    requestKey: v.optional(v.string()), resend: v.optional(v.boolean()), previousAttemptId: v.optional(v.id("transactionalDocumentDeliveryAttempts")) },
  returns: invoiceEmailResponse,
  handler: async (ctx, args): Promise<Infer<typeof invoiceEmailResponse>> => {
    const prepared = await ctx.runMutation(internal.invoiceDeliveryInternal.prepareEmail, args);
    if (!prepared.claimed) return prepared.response;
    const attemptId = prepared.response.attemptId;
    let outcome: OperationalEmailOutcome;
    let providerMayHaveStarted = false;
    try {
      const payload = await ctx.runMutation(internal.invoiceDeliveryInternal.authorizeDispatch,
        { attemptId, userId: args.userId, sessionToken: args.sessionToken });
      if (!payload) outcome = { status: "skipped", category: "ineligible" };
      else {
        const viewUrl = `${requireAppUrl()}/client/billing`;
        // Sender owns the preflight/provider boundary and never labels a network exception unsent.
        providerMayHaveStarted = true;
        outcome = await deliverInvoiceEmail({ ...payload, viewUrl });
      }
    } catch {
      outcome = providerMayHaveStarted ? { status: "unknown", category: "provider_uncertain" }
        : { status: "failed", category: "pre_send_unavailable" };
    }
    try { return await ctx.runMutation(internal.invoiceDeliveryInternal.finishEmail, { attemptId, outcome }); }
    catch {
      // No second provider call. The durable claim watchdog will mark unknown.
      return { attemptId, status: "unknown" as const, sentAt: null };
    }
  },
});

export const createInvoiceCheckout = action({
  args: { clientUserId: v.id("clientUsers"), sessionToken: v.string(), invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const principal = await requireClientSession(ctx, args.sessionToken);
    assertInvoicePaymentsEnabled();
    if (principal.clientUserId !== args.clientUserId) throw new Error("Session principal does not match client");
    await ctx.runMutation(internal.rateLimitInternal.enforce, { key: `client:${principal.clientUserId}:invoice-checkout`, limit: 3, windowMs: 60_000 });
    const data: any = await ctx.runQuery((internal as any).invoicePaymentInternal.inspect, { clientUserId: principal.clientUserId, invoiceId: args.invoiceId });
    const stripe = getStripeClientOrNull(); if (!stripe) throw new Error("Stripe is not configured");
    let readiness;
    try { readiness = await retrieveCompanyMerchantReadiness(data.connectedStripeAccountId); }
    catch { throw new Error("Online payments are temporarily unavailable. Please try again later."); }
    const account = readiness.account;
    await ctx.runMutation((internal as any).mutations.companyStripeConnect.syncCompanyStripeConnectStatus, { stripeConnectAccountId: data.connectedStripeAccountId, observedAt: Date.now(), ...readiness.snapshot });
    if (!readiness.ready) throw new Error("This company cannot accept online payments right now");
    const attemptId: any = await ctx.runMutation((internal as any).invoicePaymentInternal.reserve, { invoiceId: data.invoiceId, clientUserId: principal.clientUserId, connectedStripeAccountId: account.id });
    const attempt: any = await ctx.runQuery((internal as any).invoicePaymentInternal.getCreation, { attemptId });
    if (!attempt || attempt.chargeModel !== "direct" || attempt.invoiceId !== data.invoiceId || attempt.companyId !== data.companyId || attempt.amountCents !== data.amountCents || attempt.connectedStripeAccountId !== account.id) throw new Error("Payment attempt changed");
    if (attempt.stripeCheckoutSessionId) {
      const existing = await retrieveCheckoutSessionForAttempt(stripe, attempt, attempt.stripeCheckoutSessionId);
      if (existing.status === "open" && existing.url) return { url: existing.url };
      if (existing.status === "complete") throw new Error("Payment is being confirmed. Please refresh Billing.");
      await ctx.runMutation((internal as any).invoicePaymentInternal.markUnavailable, { attemptId, status: "expired" });
      throw new Error("Previous Checkout expired. Please try again.");
    }
    const appUrl = requireAppUrl();
    let session;
    try {
      const checkout = invoiceCheckoutParameters({ ...attempt, _id: attemptId }, data.invoiceNumber, appUrl);
      session = await stripe.checkout.sessions.create(checkout.parameters, checkout.options);
    } catch (error: any) {
      // A network failure can occur after Stripe created the session. Keep the
      // reservation so retrying uses the same Stripe idempotency key.
      if (error?.type === "StripeInvalidRequestError") await ctx.runMutation((internal as any).invoicePaymentInternal.markUnavailable, { attemptId, status: "failed" });
      throw new Error("Checkout could not be started. Please try again.");
    }
    if (!session.url) throw new Error("Checkout session is unavailable");
    await ctx.runMutation((internal as any).invoicePaymentInternal.opened, { attemptId, sessionId: session.id, url: session.url });
    return { url: session.url };
  },
});

export const expireInvoiceCheckoutSessions = internalAction({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const attempts: any[] = await ctx.runQuery((internal as any).invoicePaymentInternal.getOpenForInvoice, { invoiceId: args.invoiceId });
    const stripe = getStripeClientOrNull();
    for (const attempt of attempts) {
      if (attempt.stripeCheckoutSessionId && stripe) {
        try { await expireCheckoutSessionForAttempt(stripe, attempt, attempt.stripeCheckoutSessionId); }
        catch { /* A concurrent completed payment is handled by the webhook. */ }
      }
      await ctx.runMutation((internal as any).invoicePaymentInternal.markUnavailable, { attemptId: attempt._id, status: "expired" });
    }
  },
});
