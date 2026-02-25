"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import crypto from "crypto";

/**
 * Verify Stripe webhook signature.
 * Uses the raw body + Stripe-Signature header + webhook secret.
 */
function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const parts = signature.split(",").reduce(
    (acc, part) => {
      const [key, val] = part.split("=");
      if (key === "t") acc.timestamp = val;
      if (key === "v1") acc.signatures.push(val);
      return acc;
    },
    { timestamp: "", signatures: [] as string[] }
  );

  if (!parts.timestamp || parts.signatures.length === 0) return false;

  // Reject timestamps older than 5 minutes
  const tolerance = 5 * 60;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(parts.timestamp, 10)) > tolerance) return false;

  const signedPayload = `${parts.timestamp}.${payload}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return parts.signatures.some(
    (sig) => crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  );
}

export const handleWebhook = action({
  args: { body: v.string(), signature: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not configured");

    if (!verifyStripeSignature(args.body, args.signature, secret)) {
      throw new Error("Invalid webhook signature");
    }

    const event = JSON.parse(args.body);
    const relevantEvents = [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
    ];

    if (!relevantEvents.includes(event.type)) {
      return; // Ignore irrelevant events
    }

    const subscription = event.type.startsWith("invoice.")
      ? event.data.object.subscription
        ? { id: event.data.object.subscription }
        : null
      : event.data.object;

    if (!subscription) return;

    // For invoice events, we get a subscription ID string
    // For subscription events, we get the full subscription object
    const subObj = typeof subscription === "string"
      ? null
      : subscription;

    if (!subObj) return; // Invoice without subscription

    // Normalize customer: Stripe may expand to full object
    const customerId =
      typeof subObj.customer === "string"
        ? subObj.customer
        : subObj.customer?.id ?? "";

    await ctx.runMutation(internal.authInternal.upsertSubscription, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subObj.id,
      status: subObj.status,
      currentPeriodEnd: subObj.current_period_end * 1000, // Convert to ms
    });

    // Record affiliate attribution on new subscription
    if (event.type === "customer.subscription.created") {
      await ctx.runMutation(internal.mutations.billing.recordAttribution, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subObj.id,
        attributionType: "subscription_created",
      });
    }
  },
});
