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
      event = stripe.webhooks.constructEvent(payload, signature, candidate.secret);
      matchedSecret = candidate.label;
      break;
    } catch {
      // This secret didn't match — try the next one.
    }
  }

  if (!matchedSecret) {
    console.error("[STRIPE-WEBHOOK] signature verification failed against all configured secrets");
    return new Response("Invalid signature", { status: 400 });
  }

  // event is guaranteed assigned when matchedSecret is truthy
  const verifiedEvent = event!;

  console.log(`[STRIPE-WEBHOOK] received event`, {
    eventId: verifiedEvent.id,
    eventType: verifiedEvent.type,
    verifiedWith: matchedSecret,
  });

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

        console.log(`[STRIPE-WEBHOOK] processing ${verifiedEvent.type}`, {
          eventId: verifiedEvent.id,
          subscriptionId: subscription.id,
          customerId: subCustomerId,
          priceId,
          status: subscription.status,
        });

        await ctx.runMutation(internal.mutations.billing.syncSubscription, {
          stripeCustomerId: subCustomerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          status: subscription.status,
          currentPeriodEnd: (subscription as any).current_period_end ?? 0,
          cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
        });

        // Record affiliate attribution on new subscription
        if (verifiedEvent.type === "customer.subscription.created") {
          await ctx.runMutation(internal.mutations.billing.recordAttribution, {
            stripeCustomerId: subCustomerId,
            stripeSubscriptionId: subscription.id,
            attributionType: "subscription_created",
          });
        }

        console.log(`[STRIPE-WEBHOOK] ${verifiedEvent.type} processed successfully`, {
          eventId: verifiedEvent.id,
          subscriptionId: subscription.id,
        });
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

        console.log("[STRIPE-WEBHOOK] invoice.paid received", {
          eventId: verifiedEvent.id,
          invoiceId: invoice.id,
          resolvedCustomerId: invoiceCustomerId,
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
          console.log("[STRIPE-WEBHOOK] calling recordAttribution", { eventId: verifiedEvent.id });
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
        console.log(`[STRIPE-WEBHOOK] checkout.session.completed`, {
          eventId: verifiedEvent.id,
          sessionId: session.id,
          paymentStatus: session.payment_status,
          mode: session.mode,
          type: meta.type,
          settlementId: meta.settlementId,
        });

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
          console.log("[STRIPE-WEBHOOK] settlement marked paid", {
            eventId: verifiedEvent.id,
            settlementId: meta.settlementId,
          });
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
          console.log("[STRIPE-WEBHOOK] settlement batch marked paid", {
            eventId: verifiedEvent.id,
            batchId: meta.batchId,
          });
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
          console.log("[STRIPE-WEBHOOK] cleaner payment marked paid", {
            eventId: verifiedEvent.id,
            cleanerPaymentId: meta.cleanerPaymentId,
          });
        }
        break;
      }
      case "account.updated": {
        const account = verifiedEvent.data.object as Stripe.Account;
        console.log(`[STRIPE-WEBHOOK] account.updated`, {
          eventId: verifiedEvent.id,
          accountId: account.id,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
        });
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
        console.log(`[STRIPE-WEBHOOK] ${verifiedEvent.type}`, {
          eventId: verifiedEvent.id,
        });
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
  } catch (err: any) {
    // Log the error but always return 200 to prevent Stripe retry storms.
    // Signature was already verified, so the event is legitimate.
    console.error(`[STRIPE-WEBHOOK] error processing event — returning 200 to prevent retries`, {
      eventId: verifiedEvent.id,
      eventType: verifiedEvent.type,
      error: err?.message ?? String(err),
    });
  }

  return new Response(null, { status: 200 });
});

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: stripeWebhook,
});

export default http;
