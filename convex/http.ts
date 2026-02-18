import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

const stripeWebhook = httpAction(async (ctx, request) => {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET env var not set");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const payload = await request.text();

  // Verify signature using Stripe's recommended HMAC approach
  const crypto = await import("node:crypto");
  const [, timestamp, ...sigs] = signature.split(",").reduce(
    (acc, part) => {
      const [key, value] = part.split("=");
      if (key.trim() === "t") acc[1] = value;
      if (key.trim() === "v1") acc.push(value);
      return acc;
    },
    ["", ""] as string[],
  );

  if (!timestamp || sigs.length === 0) {
    return new Response("Invalid signature format", { status: 400 });
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");

  const isValid = sigs.some(
    (sig) =>
      sig.length === expectedSig.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig)),
  );

  if (!isValid) {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(payload);

  // TODO: implement full billing logic
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      console.log(`Received Stripe event: ${event.type}`, event.id);
      break;
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
