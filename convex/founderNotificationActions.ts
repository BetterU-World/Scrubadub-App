"use node";
import Stripe from "stripe";
import { requireStripeSecretKey, assertExternalSideEffectsAllowed, requireAppUrl } from "./lib/environment";
import { invoiceSubscriptionId } from "./lib/stripeSubscriptionCompatibility";
import { firstCompanyPayment } from "./lib/founderStripe";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { deliverFounderEmail } from "./lib/email";
import { subjects, type FounderKind } from "./lib/founderNotifications";

export const dispatch = internalAction({
  args: { id: v.id("founderNotifications") }, returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.runMutation(internal.founderNotifications.claim, { id });
    if (!row) return null;
    const recipient = process.env.SCRUB_FOUNDER_EMAIL?.trim();
    if (!recipient || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(recipient)) {
      console.warn("[FOUNDER-NOTIFICATIONS] Set SCRUB_FOUNDER_EMAIL to one server-side mailbox; notification skipped.");
      await ctx.runMutation(internal.founderNotifications.finish, { id, state: "skipped" });
      return null;
    }
    if (row.kind === "assessment") {
      try { row.details["Admin link"] = requireAppUrl() + row.details["Admin path"]; delete row.details["Admin path"]; } catch { /* Keep the verified relative route if APP_URL is unavailable. */ }
    }
    const outcome = await deliverFounderEmail({ email: recipient, subject: subjects[row.kind as FounderKind], details: row.details, idempotencyKey: `founder/${id}` });
    // Failed acknowledgement persistence leaves a claim for conservative unknown recovery.
    await ctx.runMutation(internal.founderNotifications.finish, { id,
      state: outcome.status === "provider_accepted" ? "accepted" : outcome.status === "unknown" ? "unknown" : "failed",
      ...(outcome.status === "provider_accepted" && outcome.providerMessageId ? { providerMessageId: outcome.providerMessageId } : {}),
    });
    return null;
  },
});

export const checkPayment = internalAction({
  args: { id: v.id("founderPaymentChecks") }, returns: v.null(),
  handler: async (ctx, { id }) => {
    const check = await ctx.runMutation(internal.founderNotifications.claimPaymentCheck, { id });
    if (!check) return null;
    try {
      if (await ctx.runQuery(internal.founderNotifications.paymentAlreadyRecorded, { customerId: check.customerId })) {
        await ctx.runMutation(internal.founderNotifications.finishPaymentCheck, { id });
        return null;
      }
      assertExternalSideEffectsAllowed("Founder payment verification");
      const stripe = new Stripe(requireStripeSecretKey());
      const invoice = await stripe.invoices.retrieve(check.invoiceId);
      const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customer !== check.customerId || invoiceSubscriptionId(invoice) !== check.subscriptionId) throw new Error("Payment linkage mismatch");
      const payment = await firstCompanyPayment(stripe, check.customerId, invoice);
      if (payment) await ctx.runMutation(internal.founderNotifications.billing, { customerId: check.customerId, subscriptionId: check.subscriptionId, payment: { ...payment, "Stripe event": check.eventId } });
      await ctx.runMutation(internal.founderNotifications.finishPaymentCheck, { id });
    } catch { console.warn("[FOUNDER-NOTIFICATIONS] Payment verification deferred; bounded read-only retry."); }
    return null;
  },
});
