"use node";
import { internalAction } from "../_generated/server";
import type Stripe from "stripe";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getStripeClientOrNull } from "../lib/stripe";
import { requireAppUrl, stripeExpectedLivemode } from "../lib/environment";
import { stripeBillingSnapshot } from "../lib/subscriptionSnapshot";
import { noticeText, snapshotKey } from "../lib/subscriptionPolicy";
import { winnerAwardEnd } from "../lib/winnerBilling";
import { deliverSubscriptionNotice } from "../lib/email";

const enabled = () => process.env.SCRUB_ENABLE_SUBSCRIPTION_NOTICES === "true" && process.env.SCRUB_SUBSCRIPTION_EMAIL_OWNER === "scrub";
const expand = ["discounts.source.coupon", "items.data.discounts"];
async function loadSubscription(stripe: Stripe, id: string) {
  // An item coupon path would exceed Stripe's four-level expansion limit. Hydrate coupon IDs separately.
  const sub = await stripe.subscriptions.retrieve(id, { expand });
  const discounts = [...sub.discounts, ...sub.items.data.flatMap(item => item.discounts ?? [])];
  const ids = [...new Set(discounts.flatMap(d => typeof d !== "string" && typeof d.source.coupon === "string" ? [d.source.coupon] : []))];
  const coupons = new Map(await Promise.all(ids.map(async couponId => [couponId, await stripe.coupons.retrieve(couponId)] as const)));
  for (const discount of discounts) if (typeof discount !== "string" && typeof discount.source.coupon === "string") {
    discount.source.coupon = coupons.get(discount.source.coupon)!;
  }
  return sub;
}

export const refresh = internalAction({
  args: { subscriptionId: v.string(), customerId: v.string(), confirmation: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, args) => {
    if (!enabled()) return null;
    const stripe = getStripeClientOrNull();
    const sub = await loadSubscription(stripe, args.subscriptionId);
    const snapshot = stripeBillingSnapshot(sub);
    const award = winnerAwardEnd(sub, process.env.SCRUB_WINNER_PROMOTION_CODE_ID);
    if (award) snapshot.awardedUntil = award * 1000;
    if (sub.livemode !== stripeExpectedLivemode() || snapshot.customerId !== args.customerId) throw new Error("Subscription billing identity mismatch");
    if (award && !sub.metadata.scrub_awarded_until) {
      await stripe.subscriptions.update(sub.id, { metadata: { scrub_offer: "giveaway-2026-002",
        scrub_winner_promotion: process.env.SCRUB_WINNER_PROMOTION_CODE_ID!, scrub_initial_trial_end: String(sub.trial_end), scrub_initial_discount_end: String(Math.max(...sub.discounts.map(d => typeof d === "string" ? 0 : d.end ?? 0))), scrub_awarded_until: String(award) } },
        { idempotencyKey: `scrub-winner-date:${sub.id}:${award}` });
    }
    await ctx.runMutation(internal.subscriptionNotices.reconcile, { snapshot, confirmation: args.confirmation ?? false });
    return null;
  },
});

export const scan = internalAction({
  args: { cursor: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    if (!enabled()) return null;
    const page = await ctx.runQuery(internal.subscriptionNotices.candidates, { cursor: args.cursor ?? null });
    for (const company of page.page) if (company.stripeSubscriptionId && company.stripeCustomerId) {
      await ctx.scheduler.runAfter(0, internal.actions.subscriptionNotices.refresh, {
        subscriptionId: company.stripeSubscriptionId, customerId: company.stripeCustomerId,
      });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(1000, internal.actions.subscriptionNotices.scan, { cursor: page.continueCursor });
    return null;
  },
});

export const dispatch = internalAction({
  args: { noticeId: v.id("subscriptionNotices") }, returns: v.null(),
  handler: async (ctx, args) => {
    if (!enabled()) return null;
    const current = await ctx.runQuery(internal.subscriptionNotices.get, args);
    if (!current || !["pending", "failed"].includes(current.notice.status)) return null;
    const stripe = getStripeClientOrNull();
    // Reconcile authoritative Stripe data immediately before claiming a send, not just at scheduling time.
    const sub = await loadSubscription(stripe, current.snapshot.subscriptionId);
    const snapshot = stripeBillingSnapshot(sub);
    if (snapshot.customerId !== current.snapshot.customerId || sub.livemode !== stripeExpectedLivemode()) throw new Error("Subscription billing identity mismatch");
    const binding = await ctx.runQuery(internal.subscriptionNotices.context, { subscriptionId: sub.id, customerId: snapshot.customerId });
    if (!binding) { await ctx.runMutation(internal.subscriptionNotices.suppress, args); return null; }
    await ctx.runMutation(internal.subscriptionNotices.reconcile, { snapshot, confirmation: current.notice.kind === "confirmation" });
    const claim = await ctx.runMutation(internal.subscriptionNotices.claim, args);
    if (!claim) return null;
    const finish = (result: "accepted" | "retry" | "unknown" | "superseded", providerId?: string) => ctx.runMutation(internal.subscriptionNotices.finish,
      { ...args, attempt: claim.attempts, result, providerId });
    try {
      const customer = await stripe.customers.retrieve(snapshot.customerId);
      // Last-moment cancellation/plan/date check; no message is sent from stale queued facts.
      const latestSub = await loadSubscription(stripe, sub.id);
      const latest = stripeBillingSnapshot(latestSub);
      const latestAward = winnerAwardEnd(latestSub, process.env.SCRUB_WINNER_PROMOTION_CODE_ID);
      if (latestAward) latest.awardedUntil = latestAward * 1000;
      if (!enabled() || snapshotKey(latest) !== claim.fingerprint || customer.deleted || !customer.email) {
        await finish("superseded"); return null;
      }
      const message = noticeText(claim.snapshot, claim.kind, claim.targetAt, requireAppUrl());
      const result = await deliverSubscriptionNotice({ email: customer.email, ...message, idempotencyKey: `scrub-subscription-${claim._id}` });
      if (result.status === "provider_accepted") await finish("accepted", result.providerMessageId);
      else if (result.status === "unknown" || (result.status === "failed" && result.category === "rate_limited")) await finish("retry");
      else await finish("unknown");
    } catch {
      // Same request key and frozen content are retried only inside Resend's 24-hour idempotency lifetime.
      await finish("retry");
    }
    return null;
  },
});
