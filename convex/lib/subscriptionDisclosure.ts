import type Stripe from "stripe";
import { planDisplayName, type ScrubPlan } from "./plans";

export const SUBSCRIPTION_TERMS_VERSION = "scrub-recurring-2026-11-11-v1";

/** Stripe owns the final dates/discounts shown after a code is entered in Checkout. */
export function subscriptionDisclosure(price: Stripe.Price, plan: ScrubPlan, appUrl: string) {
  if (!price.active || price.type !== "recurring" || price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1 || price.billing_scheme !== "per_unit" ||
      price.unit_amount === null || price.unit_amount <= 0 || price.currency !== "usd") {
    throw new Error("This checkout requires an active, fixed USD monthly subscription price");
  }
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency }).format(price.unit_amount / 100);
  const renewal = `SCRUB ${planDisplayName(plan)} automatically renews monthly at ${amount} USD after the 14-day free trial unless canceled. Any applied promotion changes the charges and duration as shown in the order summary; the regular monthly rate resumes after it expires.`;
  const cancellation = "Cancel automatic renewal before the next charge using Cancel automatic renewal in Settings > Billing, or Settings > Billing > Manage Billing. Access continues through the subscription end date shown there. Contact scrubadubsolutionsllc@gmail.com for help.";
  return {
    consent_collection: { terms_of_service: "required" as const },
    custom_text: {
      submit: { message: `${renewal} ${cancellation} Review the final billing dates and promotion before subscribing.` },
      terms_of_service_acceptance: { message: `I expressly agree to recurring billing: ${renewal} [Subscription terms](${appUrl}/terms#subscriptions).` },
    },
  };
}
