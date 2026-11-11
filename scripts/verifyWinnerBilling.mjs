// Manual, test-mode-only Stripe verification. No customer emails and no live credentials accepted.
import Stripe from "stripe";
import { writeFile } from "node:fs/promises";
const scenarios = ["standard", "promotion", "cancel-trial", "cancel-promotion", "change-plan"];
if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify({ mode: "dry-run; no Stripe calls", plans: [3499, 6499, 14999], scenarios,
    assertions: ["14-day trial", "six zero monthly invoices after trial", "first positive invoice at trial end + six calendar months",
      "cancel_at entire award end preserves trialing/active status", "price change preserves discount and billing date"],
    output: "stripe-winner-verification.json (exclusive write; no secrets/emails)" }, null, 2));
  process.exit(0);
}
if (!/^sk_test_/.test(process.env.STRIPE_SECRET_KEY ?? "")) throw new Error("STRIPE_SECRET_KEY must be an sk_test_ key. Live/restricted/absent keys are refused before any API call.");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-01-28.clover" });
const day = 86400;
const start = Date.UTC(2026, 10, 11, 12) / 1000;
const month = (seconds, count) => { const date = new Date(seconds * 1000); date.setUTCMonth(date.getUTCMonth() + count); return date.getTime() / 1000; };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const results = [];
const prices = [];
for (const [name, amount] of [["Solo", 3499], ["Team", 6499], ["Pro", 14999]]) {
  prices.push(await stripe.prices.create({ currency: "usd", unit_amount: amount, recurring: { interval: "month" }, product_data: { name: `SCRUB verification ${name} TEST ONLY` } }));
}
const coupon = await stripe.coupons.create({ duration: "repeating", duration_in_months: 6, percent_off: 100, name: "SCRUB verification TEST ONLY" });
const promo = await stripe.promotionCodes.create({ promotion: { type: "coupon", coupon: coupon.id }, max_redemptions: 50 });
for (const [index, price] of prices.entries()) for (const scenario of scenarios) {
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: start, name: `SCRUB ${index} ${scenario} TEST ONLY` });
  const customer = await stripe.customers.create({ test_clock: clock.id, payment_method: "pm_card_visa", invoice_settings: { default_payment_method: "pm_card_visa" } });
  let sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: price.id }], trial_period_days: 14,
    ...(scenario === "standard" ? {} : { discounts: [{ promotion_code: promo.id }] }), expand: ["discounts.source.coupon"] });
  assert(!sub.livemode && sub.trial_end - sub.trial_start === 14 * day, "Trial or mode mismatch");
  const trialEnd = sub.trial_end;
  const awardEnd = month(trialEnd, 6);
  const advance = async seconds => {
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: seconds });
    for (let attempt = 0; attempt < 120; attempt++) {
      const status = await stripe.testHelpers.testClocks.retrieve(clock.id);
      if (status.status === "ready") return;
      if (status.status !== "advancing") throw new Error("Test clock failed");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("Test clock did not become ready within 120 seconds");
  };
  if (scenario === "cancel-trial") {
    await advance(start + day);
    sub = await stripe.subscriptions.update(sub.id, { cancel_at: awardEnd, cancel_at_period_end: false, proration_behavior: "none" });
    assert(sub.status === "trialing", "Trial cancellation revoked access immediately");
  }
  let firstPositive;
  const count = scenario === "standard" ? 0 : 6;
  for (let period = 0; period <= count; period++) {
    await advance(month(trialEnd, period) + 3600);
    sub = await stripe.subscriptions.retrieve(sub.id);
    const invoices = await stripe.invoices.list({ subscription: sub.id, limit: 100 });
    const positive = invoices.data.filter(invoice => invoice.amount_due > 0);
    firstPositive = positive.reduce((earliest, invoice) => earliest === undefined ? invoice.created : Math.min(earliest, invoice.created), undefined);
    if (period < count) {
      assert(positive.length === 0, "Positive invoice before the full free entitlement ended");
      assert(["active", "trialing"].includes(sub.status), "Access ended before the full award end");
    }
    if (period === 1 && scenario === "cancel-promotion") {
      sub = await stripe.subscriptions.update(sub.id, { cancel_at: awardEnd, cancel_at_period_end: false, proration_behavior: "none" });
      assert(sub.status === "active", "Promotional cancellation revoked access immediately");
    }
    if (period === 1 && scenario === "change-plan") {
      sub = await stripe.subscriptions.update(sub.id, { items: [{ id: sub.items.data[0].id, price: prices[(index + 1) % prices.length].id }], proration_behavior: "none" });
      assert(sub.trial_end === trialEnd, "Plan change altered trial/award timing");
    }
  }
  const canceled = scenario.startsWith("cancel-");
  if (canceled) assert(sub.status === "canceled" && firstPositive === undefined, "Canceled subscription charged or failed to end at award boundary");
  else assert(firstPositive !== undefined && firstPositive >= (scenario === "standard" ? trialEnd : awardEnd), "First positive charge timing did not match the promised free entitlement");
  results.push({ planAmount: price.unit_amount, scenario, clockId: clock.id, trialEnd, awardEnd, firstPositive, finalStatus: sub.status, passed: true });
  console.log(`Passed plan ${price.unit_amount}, ${scenario}; test clock ${clock.id}`);
}
await writeFile("stripe-winner-verification.json", JSON.stringify({ apiVersion: "2026-01-28.clover", verifiedAt: new Date().toISOString(), results }, null, 2), { flag: "wx" });
console.log("Test fixtures retained in Stripe test mode for review. No live objects or emails were used.");
