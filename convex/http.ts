import Stripe from "stripe";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();

const stripeWebhook = httpAction(async (ctx, request) => {
  const payload = await request.text();
  let event: Stripe.Event;

  // Stripe signature verification is always required — no dev bypass.
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  // Try secrets in order: account (platform), then connect.
  const secretCandidates: Array<{ secret: string; label: string }> = [];
  if (process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET) {
    secretCandidates.push({ secret: process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET, label: "account" });
  }
  if (process.env.STRIPE_WEBHOOK_CONNECT_SECRET) {
    secretCandidates.push({ secret: process.env.STRIPE_WEBHOOK_CONNECT_SECRET, label: "connect" });
  }
  if (secretCandidates.length === 0) {
    console.error("[STRIPE-WEBHOOK] no webhook secrets configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  let matchedSecret: string | null = null;

  for (const candidate of secretCandidates) {
    try {
      // Use constructEventAsync — Convex httpAction runs in a V8 isolate
      // without Node.js crypto, so the synchronous constructEvent fails.
      event = await stripe.webhooks.constructEventAsync(payload, signature, candidate.secret);
      matchedSecret = candidate.label;
      break;
    } catch (verifyErr: any) {
      console.warn(`[STRIPE-WEBHOOK] verification failed with "${candidate.label}" secret`, {
        error: verifyErr?.message ?? String(verifyErr),
      });
    }
  }

  if (!matchedSecret) {
    console.error("[STRIPE-WEBHOOK] signature verification failed against all configured secrets");
    return new Response("Invalid signature", { status: 400 });
  }

  // event is guaranteed assigned when matchedSecret is truthy
  const verifiedEvent = event!;

  const claim = await ctx.runMutation(
    internal.mutations.billing.beginStripeWebhookEvent,
    {
      stripeEventId: verifiedEvent.id,
      eventType: verifiedEvent.type,
      now: Date.now(),
    }
  );
  if (claim === "completed" || claim === "processing") {
    return new Response(null, { status: 200 });
  }

  try {
    switch (verifiedEvent.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = verifiedEvent.data.object as Stripe.Subscription;
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
          eventCreated: verifiedEvent.created,
        });

        // Record affiliate attribution on new subscription
        if (verifiedEvent.type === "customer.subscription.created") {
          await ctx.runMutation(internal.mutations.billing.recordAttribution, {
            stripeCustomerId: subCustomerId,
            stripeSubscriptionId: subscription.id,
            attributionType: "subscription_created",
          });
        }

        break;
      }
      case "invoice.paid": {
        const invoice = verifiedEvent.data.object as Stripe.Invoice;
        // Extract string IDs — Stripe may expand these to full objects
        const invoiceCustomerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id ?? null;
        const rawSubscription = (invoice as any).subscription;
        const invoiceSubscriptionId =
          typeof rawSubscription === "string"
            ? rawSubscription
            : rawSubscription?.id ?? null;

        if (invoiceCustomerId && invoiceSubscriptionId) {
          const attrArgs = {
            stripeCustomerId: invoiceCustomerId,
            stripeSubscriptionId: invoiceSubscriptionId,
            attributionType: "invoice_paid" as const,
            stripeInvoiceId: invoice.id,
            amountCents: invoice.amount_paid,
            currency: invoice.currency,
          };
          await ctx.runMutation(
            internal.mutations.billing.recordAttribution,
            attrArgs,
          );
        } else {
          console.warn("[STRIPE-WEBHOOK] skipping recordAttribution — missing customerId or subscriptionId", {
            eventId: verifiedEvent.id,
            invoiceCustomerId,
            invoiceSubscriptionId,
          });
        }
        break;
      }
      case "checkout.session.completed": {
        const session = verifiedEvent.data.object as Stripe.Checkout.Session;
        const meta = session.metadata ?? {};
        // Handle settlement payments
        if (
          meta.type === "settlement_payment" &&
          meta.settlementId &&
          session.payment_status === "paid"
        ) {
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent as any)?.id ?? undefined;

          await ctx.runMutation(
            internal.mutations.settlements.markSettlementPaidViaStripe,
            {
              settlementId: meta.settlementId as any,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: paymentIntentId,
              stripeDestinationAccountId: meta.recipientCompanyId,
              payerUserId: meta.payerUserId
                ? (meta.payerUserId as any)
                : undefined,
            },
          );
        }

        // Handle settlement batch payments
        if (
          meta.type === "settlement_batch" &&
          meta.batchId &&
          session.payment_status === "paid"
        ) {
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent as any)?.id ?? undefined;

          await ctx.runMutation(
            internal.mutations.settlements.markSettlementBatchPaidViaStripe,
            {
              batchId: meta.batchId as any,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: paymentIntentId,
              payerUserId: meta.payerUserId
                ? (meta.payerUserId as any)
                : undefined,
            },
          );
        }

        // Handle cleaner payout payments
        if (
          meta.type === "cleaner_payout" &&
          meta.cleanerPaymentId &&
          session.payment_status === "paid"
        ) {
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent as any)?.id ?? undefined;

          await ctx.runMutation(
            internal.mutations.cleanerPayments.markCleanerPaidViaStripe,
            {
              cleanerPaymentId: meta.cleanerPaymentId as any,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: paymentIntentId,
              payerUserId: meta.payerUserId
                ? (meta.payerUserId as any)
                : undefined,
            },
          );
        }
        break;
      }
      case "account.updated": {
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
        break;
      case "charge.refunded":
      case "invoice.voided": {
        const obj = verifiedEvent.data.object as unknown as Record<string, unknown>;
        console.warn(`[STRIPE-WEBHOOK] ${verifiedEvent.type} received — no commission reversal yet`, {
          eventId: verifiedEvent.id,
          objectId: obj.id ?? "unknown",
        });
        break;
      }
      default:
        console.warn(`[STRIPE-WEBHOOK] unhandled event type — ignoring`, {
          eventId: verifiedEvent.id,
          eventType: verifiedEvent.type,
        });
    }
    await ctx.runMutation(
      internal.mutations.billing.completeStripeWebhookEvent,
      { stripeEventId: verifiedEvent.id, now: Date.now() }
    );
  } catch (err: any) {
    await ctx.runMutation(
      internal.mutations.billing.failStripeWebhookEvent,
      { stripeEventId: verifiedEvent.id, now: Date.now() }
    );
    // A verified event that failed processing must return non-2xx so Stripe
    // retries it. The failed claim remains safely replayable.
    console.error(`[STRIPE-WEBHOOK] error processing event — requesting retry`, {
      eventId: verifiedEvent.id,
      eventType: verifiedEvent.type,
      error: err?.message ?? String(err),
    });
    return new Response("Webhook processing failed", { status: 500 });
  }

  return new Response(null, { status: 200 });
});

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: stripeWebhook,
});

export default http;
