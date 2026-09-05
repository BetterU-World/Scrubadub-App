import Stripe from "stripe";
import { assertExternalSideEffectsAllowed, requireStripeSecretKey } from "./environment";

/**
 * Returns a configured Stripe client after enforcing the environment gate.
 */
export function getStripeClientOrNull(): Stripe {
  assertExternalSideEffectsAllowed("Stripe");
  return new Stripe(requireStripeSecretKey());
}
