import type Stripe from "stripe";
import { addMonths, winnerTrialEnd } from "./subscriptionPolicy";

/** A six-month coupon starts on application, but discounts whole monthly invoices.
 * Verify all six post-trial invoice starts fall inside Stripe's actual discount window.
 * Never infer the award from a label such as SIXMONTHSFREE.
 */
export function winnerAwardEnd(sub: Stripe.Subscription, promotionId: string | undefined): number | undefined {
  const recorded = Number(sub.metadata.scrub_awarded_until);
  if (sub.metadata.scrub_offer === "giveaway-2026-002-extended-trial") {
    if (!sub.trial_start || sub.trial_end !== recorded || winnerTrialEnd(sub.trial_start) !== recorded) throw new Error("Winner trial entitlement changed");
    return recorded;
  }
  if (!promotionId) return undefined;
  if (sub.metadata.scrub_offer === "giveaway-2026-002" && sub.metadata.scrub_winner_promotion === promotionId && recorded) {
    const initialTrialEnd = Number(sub.metadata.scrub_initial_trial_end);
    if (!initialTrialEnd || addMonths(initialTrialEnd * 1000, 6) !== recorded * 1000) throw new Error("Winner entitlement date changed");
    const stillPresent = sub.discounts.some(d => typeof d !== "string" &&
      (typeof d.promotion_code === "string" ? d.promotion_code : d.promotion_code?.id) === promotionId);
    if (!stillPresent) {
      const discountEnd = Number(sub.metadata.scrub_initial_discount_end);
      if (!discountEnd || Date.now() < discountEnd * 1000) throw new Error("Winner discount removed before its verified expiry");
      return recorded;
    }
  }
  const item = sub.items.data[0];
  const discount = sub.discounts.find(d => typeof d !== "string" &&
    (typeof d.promotion_code === "string" ? d.promotion_code : d.promotion_code?.id) === promotionId);
  if (!discount || typeof discount === "string") return undefined;
  const coupon = discount.source.coupon;
  const product = typeof item?.price.product === "string" ? item.price.product : item?.price.product?.id;
  if (sub.items.data.length !== 1 || !sub.trial_start || !sub.trial_end || sub.trial_end - sub.trial_start !== 14 * 86400 ||
      item.price.recurring?.interval !== "month" || item.price.recurring.interval_count !== 1 || item.price.billing_scheme !== "per_unit" ||
      !coupon || typeof coupon === "string" || coupon.percent_off !== 100 || coupon.duration !== "repeating" || coupon.duration_in_months !== 6 ||
      (coupon.applies_to && (!product || !coupon.applies_to.products.includes(product))) || !discount.end) {
    throw new Error("Winner offer billing configuration is not verified");
  }
  const first = sub.trial_end * 1000;
  const lastFreeInvoice = addMonths(first, 5);
  const firstPaidInvoice = addMonths(first, 6);
  if (discount.start * 1000 > first || discount.end * 1000 <= lastFreeInvoice || discount.end * 1000 > firstPaidInvoice) {
    throw new Error("Winner discount does not cover exactly six post-trial monthly invoice starts");
  }
  if (recorded && recorded * 1000 !== firstPaidInvoice) throw new Error("Winner entitlement date changed");
  return firstPaidInvoice / 1000;
}

/** Supported fallback for a test-verified extended Stripe trial, not a parallel access system. */
export function extendedWinnerTrial(startSeconds: number) {
  return { trial_end: winnerTrialEnd(startSeconds), metadata: { scrub_offer: "giveaway-2026-002-extended-trial", scrub_awarded_until: String(winnerTrialEnd(startSeconds)) } };
}

export function cancellationParameters(sub: Stripe.Subscription, awardEnd?: number): Stripe.SubscriptionUpdateParams {
  if (!["trialing", "active"].includes(sub.status)) throw new Error("Subscription is not active");
  if (awardEnd && awardEnd * 1000 > Date.now()) return { cancel_at: awardEnd, cancel_at_period_end: false, proration_behavior: "none" };
  return { cancel_at_period_end: true, proration_behavior: "none" };
}
