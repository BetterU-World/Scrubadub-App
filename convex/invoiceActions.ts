"use node";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireClientSession, requireOwnerOrManagerCapability } from "./lib/sessions";
import { getStripeClientOrNull } from "./lib/stripe";
import { sendInvoiceEmail } from "./lib/email";
import { requireAppUrl } from "./lib/environment";
import { liveInvoiceCheckoutReady, snapshotFromStripeAccount } from "./lib/companyConnectReadiness";
import { invoiceCheckoutParameters } from "./lib/invoiceCheckoutConfig";

export const sendInvoice = action({
  args: { userId: v.id("users"), sessionToken: v.string(), invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<{ sentAt: number }> => {
    const owner = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageInvoices");
    const payload: any = await ctx.runQuery((internal as any).invoiceDeliveryInternal.getForOwnerDelivery, { companyId: owner.companyId, invoiceId: args.invoiceId });
    const viewUrl = `${requireAppUrl()}/client/billing`;
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
    const data: any = await ctx.runQuery((internal as any).invoicePaymentInternal.inspect, { clientUserId: principal.clientUserId, invoiceId: args.invoiceId });
    const stripe = getStripeClientOrNull(); if (!stripe) throw new Error("Stripe is not configured");
    let account;
    try { account = await stripe.accounts.retrieve(data.destinationStripeAccountId); }
    catch { throw new Error("Online payments are temporarily unavailable. Please try again later."); }
    const readiness = snapshotFromStripeAccount(account);
    await ctx.runMutation((internal as any).mutations.companyStripeConnect.syncCompanyStripeConnectStatus, { stripeConnectAccountId: data.destinationStripeAccountId, observedAt: Date.now(), ...readiness });
    if (!liveInvoiceCheckoutReady(account, data.destinationStripeAccountId)) throw new Error("This company cannot accept online payments right now");
    const attemptId: any = await ctx.runMutation((internal as any).invoicePaymentInternal.reserve, { invoiceId: data.invoiceId, clientUserId: principal.clientUserId, destinationStripeAccountId: account.id });
    const attempt: any = await ctx.runQuery((internal as any).invoicePaymentInternal.getCreation, { attemptId });
    if (!attempt || attempt.invoiceId !== data.invoiceId || attempt.companyId !== data.companyId || attempt.amountCents !== data.amountCents || attempt.destinationStripeAccountId !== account.id) throw new Error("Payment attempt changed");
    if (attempt.stripeCheckoutSessionId) {
      const existing = await stripe.checkout.sessions.retrieve(attempt.stripeCheckoutSessionId);
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
        try { await stripe.checkout.sessions.expire(attempt.stripeCheckoutSessionId); }
        catch { /* A concurrent completed payment is handled by the webhook. */ }
      }
      await ctx.runMutation((internal as any).invoicePaymentInternal.markUnavailable, { attemptId: attempt._id, status: "expired" });
    }
  },
});
