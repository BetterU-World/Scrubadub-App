import Stripe from "stripe";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();

const stripeWebhook = httpAction(async (ctx, request) => {
  const payload = await request.text();
  let event: Stripe.Event;

  if (process.env.STRIPE_WEBHOOK_DEV_BYPASS === "true") {
    console.log("[stripe:webhook] dev bypass enabled");
    event = JSON.parse(payload) as Stripe.Event;
  } else {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET env var not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response("Invalid signature", { status: 400 });
    }
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const subCustomerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? "";
      const priceId = subscription.items?.data?.[0]?.price?.id ?? "";
      await ctx.runMutation(internal.mutations.billing.syncSubscription, {
        stripeCustomerId: subCustomerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        status: subscription.status,
        currentPeriodEnd: (subscription as any).current_period_end ?? 0,
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      });

      // Record affiliate attribution on new subscription
      if (event.type === "customer.subscription.created") {
        await ctx.runMutation(internal.mutations.billing.recordAttribution, {
          stripeCustomerId: subCustomerId,
          stripeSubscriptionId: subscription.id,
          attributionType: "subscription_created",
        });
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      // Extract string IDs — Stripe may expand these to full objects
      const invoiceCustomerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id ?? null;
      const invoiceSubscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id ?? null;

      console.log("[attribution:http] invoice.paid received", {
        eventId: event.id,
        eventType: event.type,
        invoiceId: invoice.id,
        rawCustomerType: typeof invoice.customer,
        rawCustomerValue: String(invoice.customer).slice(0, 80),
        resolvedCustomerId: invoiceCustomerId,
        rawSubscriptionType: typeof invoice.subscription,
        resolvedSubscriptionId: invoiceSubscriptionId,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
      });

      if (invoiceCustomerId && invoiceSubscriptionId) {
        const attrArgs = {
          stripeCustomerId: invoiceCustomerId,
          stripeSubscriptionId: invoiceSubscriptionId,
          attributionType: "invoice_paid" as const,
          stripeInvoiceId: invoice.id,
          amountCents: invoice.amount_paid,
          currency: invoice.currency,
        };
        console.log("[attribution:http] calling recordAttribution with", attrArgs);
        await ctx.runMutation(
          internal.mutations.billing.recordAttribution,
          attrArgs,
        );
      } else {
        console.warn("[attribution:http] skipping recordAttribution — missing customerId or subscriptionId", {
          invoiceCustomerId,
          invoiceSubscriptionId,
        });
      }
      break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      console.log(`Stripe invoice event: ${event.type}`, event.id);
      break;
    case "charge.refunded":
    case "invoice.voided": {
      const obj = event.data.object as Record<string, unknown>;
      console.warn(`[stripe:webhook] ${event.type} received — no commission reversal yet`, {
        eventId: event.id,
        objectId: obj.id ?? "unknown",
      });
      break;
    }
    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  return new Response(null, { status: 200 });
});

http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: stripeWebhook,
});

export default http;
