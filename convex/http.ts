import Stripe from "stripe";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { areExternalSideEffectsDisabled, requireStripeSecretKey } from "./lib/environment";
import type { Id } from "./_generated/dataModel";
import { cleanResourceDescription, cleanResourceTitle, RESOURCE_MAX_BYTES, validateResourceFile } from "./lib/companyResources";

declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();

function resourceCors(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const configured = [process.env.APP_URL, ...(process.env.SCRUB_RESOURCE_ALLOWED_ORIGINS ?? "").split(",")];
  const allowed = configured.map((value) => {
    try { return value?.trim() ? new URL(value.trim()).origin : null; } catch { return null; }
  }).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function resourceHeaders(origin: string | null): HeadersInit {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function resourceError(message: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...resourceHeaders(origin), "Content-Type": "application/json" },
  });
}

function resourceSession(request: Request) {
  const match = /^Bearer (\S+)$/.exec(request.headers.get("Authorization") ?? "");
  return match?.[1] ?? null;
}

const resourceOptions = httpAction(async (_ctx, request) => {
  const origin = resourceCors(request);
  return origin ? new Response(null, { status: 204, headers: resourceHeaders(origin) }) : new Response(null, { status: 403 });
});

const uploadResource = httpAction(async (ctx, request) => {
  const origin = resourceCors(request);
  if (!origin) return resourceError("Origin not allowed", 403, null);
  const sessionToken = resourceSession(request);
  if (!sessionToken) return resourceError("Sign in required", 401, origin);
  let newStorageId: Id<"_storage"> | null = null;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new Error("Choose a file");
    if (file.size === 0) throw new Error("File is empty");
    if (file.size > RESOURCE_MAX_BYTES) throw new Error("File exceeds 10 MB limit");
    const title = cleanResourceTitle(String(form.get("title") ?? ""));
    const description = cleanResourceDescription(String(form.get("description") ?? ""));
    const requestId = String(form.get("requestId") ?? "");
    const resourceId = String(form.get("resourceId") ?? "") || undefined;
    const expectedStorageId = String(form.get("expectedStorageId") ?? "") || undefined;
    const preflight = await ctx.runQuery((internal as any).queries.companyResources.prepareUpload, {
      sessionToken, requestId, resourceId: resourceId as Id<"companyResources"> | undefined,
      expectedStorageId: expectedStorageId as Id<"_storage"> | undefined,
    });
    if (preflight.reused) return new Response(JSON.stringify({ resourceId: preflight.resourceId, reused: true }), {
      status: 200, headers: { ...resourceHeaders(origin), "Content-Type": "application/json" },
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const originalName = "name" in file ? String(file.name) : "";
    const metadata = validateResourceFile(bytes, file.type, originalName);
    newStorageId = await ctx.storage.store(new Blob([bytes], { type: metadata.mimeType }));
    const result = await ctx.runMutation((internal as any).mutations.companyResources.finalizeUpload, {
      sessionToken, requestId, resourceId: resourceId as Id<"companyResources"> | undefined,
      expectedStorageId: expectedStorageId as Id<"_storage"> | undefined,
      storageId: newStorageId, title, description, ...metadata,
    });
    if (result.reused) await ctx.storage.delete(newStorageId);
    // Finalization now owns the new file; later response failures must not remove it.
    newStorageId = null;
    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...resourceHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (error: any) {
    if (newStorageId) {
      try { await ctx.storage.delete(newStorageId); }
      catch (cleanupError) {
        console.error("[resources] failed to clean up new upload", { storageId: newStorageId, cleanupError });
        return resourceError("Upload failed and file cleanup failed. Contact support.", 500, origin);
      }
    }
    const message = error?.message ?? "Resource upload failed";
    const status = /changed|Refresh|already used/.test(message) ? 409 : /permission|session|Access denied|Resource unavailable/.test(message) ? 403 : 400;
    return resourceError(message, status, origin);
  }
});

const readResource = httpAction(async (ctx, request) => {
  const origin = resourceCors(request);
  if (!origin) return resourceError("Origin not allowed", 403, null);
  const sessionToken = resourceSession(request);
  if (!sessionToken) return resourceError("Sign in required", 401, origin);
  const resourceId = new URL(request.url).searchParams.get("resourceId");
  if (!resourceId) return resourceError("Resource ID required", 400, origin);
  try {
    const resource = await ctx.runQuery((internal as any).queries.companyResources.getForRead, {
      sessionToken, resourceId: resourceId as Id<"companyResources">,
    });
    const blob = await ctx.storage.get(resource.storageId);
    if (!blob) return resourceError("Resource file unavailable", 404, origin);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const filename = resource.originalFileName.replace(/["\\\r\n]/g, "");
    return new Response(blob, { status: 200, headers: {
      ...resourceHeaders(origin), "Content-Type": resource.mimeType,
      "Content-Disposition": `${disposition}; filename="resource"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    } });
  } catch {
    return resourceError("Resource unavailable", 403, origin);
  }
});

http.route({ path: "/resources/upload", method: "OPTIONS", handler: resourceOptions });
http.route({ path: "/resources/upload", method: "POST", handler: uploadResource });
http.route({ path: "/resources/file", method: "OPTIONS", handler: resourceOptions });
http.route({ path: "/resources/file", method: "GET", handler: readResource });

const readClientResource = httpAction(async (ctx, request) => {
  const origin = resourceCors(request);
  if (!origin) return resourceError("Origin not allowed", 403, null);
  const sessionToken = resourceSession(request);
  if (!sessionToken) return resourceError("Sign in required", 401, origin);
  const resourceId = new URL(request.url).searchParams.get("resourceId");
  if (!resourceId) return resourceError("Resource ID required", 400, origin);
  try {
    const resource = await ctx.runQuery((internal as any).queries.clientResources.getForRead, {
      sessionToken, resourceId: resourceId as Id<"companyResources">,
    });
    const blob = await ctx.storage.get(resource.storageId);
    if (!blob) return resourceError("Resource file unavailable", 404, origin);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const filename = resource.originalFileName.replace(/["\\\r\n]/g, "");
    return new Response(blob, { status: 200, headers: {
      ...resourceHeaders(origin), "Content-Type": resource.mimeType,
      "Content-Disposition": `${disposition}; filename="resource"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    } });
  } catch {
    return resourceError("Resource unavailable", 403, origin);
  }
});

http.route({ path: "/client/resources/file", method: "OPTIONS", handler: resourceOptions });
http.route({ path: "/client/resources/file", method: "GET", handler: readClientResource });

const stripeWebhook = httpAction(async (ctx, request) => {
  if (areExternalSideEffectsDisabled()) {
    return new Response("External side effects disabled", { status: 503 });
  }
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

  const stripe = new Stripe(requireStripeSecretKey());
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
        if (meta.type === "commercial_invoice_payment" && meta.invoiceId && session.payment_status === "paid") {
          const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent as any)?.id ?? undefined;
          await ctx.runMutation((internal as any).invoiceDeliveryInternal.markPaidFromCheckout, { invoiceId: meta.invoiceId as any, stripeCheckoutSessionId: session.id, stripePaymentIntentId: paymentIntentId });
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
