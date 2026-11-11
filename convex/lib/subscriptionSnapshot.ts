import type Stripe from "stripe";
import type { BillingSnapshot } from "./subscriptionPolicy";

export function stripeBillingSnapshot(subscription: Stripe.Subscription): BillingSnapshot {
  const item = subscription.items.data[0]; const price = item?.price;
  if (subscription.items.data.length !== 1 || !price || price.unit_amount === null || !price.recurring ||
      !["month", "year"].includes(price.recurring.interval) || price.billing_scheme !== "per_unit") {
    throw new Error("Unsupported subscription notice pricing");
  }
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const allDiscounts = [...subscription.discounts, ...(item.discounts ?? [])];
  const seen = new Set<string>();
  const discounts: BillingSnapshot["discounts"] = [];
  for (const d of allDiscounts) {
    if (typeof d === "string") throw new Error("Subscription discount expansion required");
    if (seen.has(d.id)) continue; seen.add(d.id);
    const coupon = d.source?.coupon;
    if (!coupon || typeof coupon === "string") throw new Error("Coupon expansion required");
    discounts.push({ id: d.id, description: coupon.name ?? (coupon.percent_off !== null ? `${coupon.percent_off}% off` : "Stripe discount"),
      start: d.start * 1000, end: d.end ? d.end * 1000 : undefined });
  }
  discounts.sort((a, b) => a.id.localeCompare(b.id));
  const awardedUntil = Number(subscription.metadata.scrub_awarded_until);
  return {
    subscriptionId: subscription.id, customerId, status: subscription.status,
    renewing: ["active", "trialing"].includes(subscription.status) && !subscription.cancel_at_period_end &&
      !subscription.cancel_at && !subscription.pause_collection && subscription.collection_method === "charge_automatically",
    createdAt: subscription.created * 1000, plan: price.nickname ?? subscription.metadata.tier ?? "SCRUB subscription",
    amount: price.unit_amount * (item.quantity ?? 1), currency: price.currency,
    interval: price.recurring.interval as "month" | "year", intervalCount: price.recurring.interval_count,
    anchor: subscription.billing_cycle_anchor * 1000,
    trialEnd: subscription.trial_end ? subscription.trial_end * 1000 : undefined,
    awardedUntil: Number.isFinite(awardedUntil) && awardedUntil > 0 ? awardedUntil * 1000 : undefined,
    discounts,
  };
}
