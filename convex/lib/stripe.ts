import Stripe from "stripe";

declare const process: { env: Record<string, string | undefined> };

/**
 * Returns a Stripe client if STRIPE_SECRET_KEY is set, otherwise null.
 * Safe to call in any context — never throws on missing config.
 */
export function getStripeClientOrNull(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}
