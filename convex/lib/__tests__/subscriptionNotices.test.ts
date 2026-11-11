import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type Stripe from "stripe";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import { api } from "../../_generated/api";
import { hashTokenForLookup } from "../tokenHash";
import { addMonths, DAY, noticePlans, noticeText, type BillingSnapshot } from "../subscriptionPolicy";
import { cancellationParameters, extendedWinnerTrial, winnerAwardEnd } from "../winnerBilling";
import { stripeBillingSnapshot } from "../subscriptionSnapshot";

const mocks = vi.hoisted(() => ({ retrieve: vi.fn(), update: vi.fn(), coupon: vi.fn(), customer: vi.fn(), send: vi.fn() }));
vi.mock("../stripe", () => ({ getStripeClientOrNull: () => ({ subscriptions: { retrieve: mocks.retrieve, update: mocks.update }, coupons: { retrieve: mocks.coupon }, customers: { retrieve: mocks.customer } }) }));
vi.mock("../email", () => ({ deliverSubscriptionNotice: mocks.send }));
const modules = import.meta.glob("../../**/*.ts");
const start = Date.parse("2026-01-15T12:00:00Z");
const trialEnd = start + 14 * DAY;
const initial: BillingSnapshot = { subscriptionId: "sub_notice", customerId: "cus_notice", status: "trialing", renewing: true,
  createdAt: start, plan: "Team", amount: 6499, currency: "usd", interval: "month", intervalCount: 1, anchor: trialEnd, trialEnd, discounts: [] };
const subFixture = (snapshot = initial) => ({ id: snapshot.subscriptionId, customer: snapshot.customerId, livemode: false,
  status: snapshot.status, created: snapshot.createdAt / 1000, trial_start: snapshot.createdAt / 1000, trial_end: snapshot.trialEnd! / 1000,
  billing_cycle_anchor: snapshot.anchor / 1000, cancel_at: snapshot.renewing ? null : snapshot.trialEnd! / 1000,
  cancel_at_period_end: !snapshot.renewing, collection_method: "charge_automatically", metadata: {}, discounts: [],
  items: { data: [{ quantity: 1, discounts: [], price: { id: "price_team", nickname: snapshot.plan, unit_amount: snapshot.amount,
    currency: "usd", product: "prod_team", billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1 } } }] } } as unknown as Stripe.Subscription);
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(trialEnd - 7 * DAY);
  vi.stubEnv("SCRUB_ENABLE_SUBSCRIPTION_NOTICES", "true"); vi.stubEnv("SCRUB_SUBSCRIPTION_EMAIL_OWNER", "scrub");
  vi.stubEnv("APP_URL", "https://example.test"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("SCRUB_WINNER_PROMOTION_CODE_ID", "");
  mocks.retrieve.mockReset().mockResolvedValue(subFixture()); mocks.customer.mockReset().mockResolvedValue({ id: "cus_notice", email: "private@example.test" });
  mocks.send.mockReset().mockResolvedValue({ status: "provider_accepted", providerMessageId: "message_accepted" });
  mocks.update.mockReset().mockResolvedValue({});
  mocks.coupon.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function setup(snapshot = initial, confirmation = false) {
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert("companies", { name: "Notices", timezone: "America/New_York", stripeCustomerId: snapshot.customerId, stripeSubscriptionId: snapshot.subscriptionId }));
  await t.mutation(internal.subscriptionNotices.reconcile, { snapshot, confirmation });
  const rows = await t.run(ctx => ctx.db.query("subscriptionNotices").collect());
  return { t, rows };
}

describe("billing notice policy", () => {
  it("schedules standard trials at seven days and annual-boundary notices at thirty days", () => {
    const plans = noticePlans(initial, start);
    expect(plans.find(p => p.kind === "trial")).toMatchObject({ targetAt: trialEnd, dueAt: trialEnd - 7 * DAY, expiresAt: trialEnd - 3 * DAY });
    const annual = plans.find(p => p.kind === "annual")!;
    expect(annual.dueAt).toBe(annual.targetAt - 30 * DAY);
    expect(annual.targetAt).toBe(addMonths(trialEnd, 11));
    expect(addMonths(annual.targetAt, 1)).toBeGreaterThan(addMonths(start, 12));
  });
  it("uses a separate thirty-day annual-term window and records missed windows", () => {
    const yearly = { ...initial, interval: "year" as const, anchor: trialEnd };
    const annual = noticePlans(yearly, start).find(p => p.kind === "annual")!;
    expect(annual.targetAt).toBe(addMonths(trialEnd, 12));
    expect(annual.dueAt).toBe(annual.targetAt - 30 * DAY);
    const missed = noticePlans(initial, trialEnd - 2 * DAY).find(p => p.kind === "trial")!;
    expect(missed.expiresAt).toBeLessThan(Date.now() + 6 * DAY);
  });
  it("uses Stripe discount expiry without inventing a first positive charge", () => {
    const discounted = { ...initial, discounts: [{ id: "di_one", description: "100% off for six months", start, end: addMonths(start, 6) }] };
    expect(noticePlans(discounted, start).find(p => p.kind === "promotion")?.targetAt).toBe(addMonths(start, 6));
    const text = noticeText(discounted, "confirmation", 0, "https://example.test").text;
    expect(text).toContain("100% off for six months");
    expect(text).not.toContain("Scheduled paid billing begins");
  });
  it("gives the winner one free-to-paid reminder at the entire award end, not the initial trial end", () => {
    const award = addMonths(trialEnd, 6);
    const snapshot = { ...initial, awardedUntil: award, discounts: [{ id: "di_free", description: "100% off", start, end: addMonths(start, 6) }] };
    const plans = noticePlans(snapshot, start);
    expect(plans.filter(p => ["trial", "promotion"].includes(p.kind))).toMatchObject([{ kind: "promotion", targetAt: award, dueAt: award - 7 * DAY }]);
    expect(noticeText(snapshot, "confirmation", 0, "https://example.test").text).toContain("six additional calendar months");
  });
  it("suppresses nonrenewing and canceled subscriptions", () => {
    expect(noticePlans({ ...initial, renewing: false }, start)).toEqual([]);
    expect(noticePlans({ ...initial, status: "canceled" }, start)).toEqual([]);
  });
});

describe("transactional notice delivery", () => {
  it("confirms a signed public checkout once even before account setup", async () => {
    const t = convexTest(schema, modules);
    await t.run(ctx => ctx.db.insert("subscriptionCheckoutConsents", { stripeCheckoutSessionId: "cs_public", stripeCustomerId: initial.customerId,
      stripeSubscriptionId: initial.subscriptionId, termsVersion: "terms", disclosure: "Disclosure", consentText: "Accepted", stripeEventId: "evt_public",
      completedEventAt: start, recordedAt: start }));
    await t.mutation(internal.subscriptionNotices.reconcile, { snapshot: initial, confirmation: true });
    await t.mutation(internal.subscriptionNotices.reconcile, { snapshot: initial, confirmation: true });
    const rows = await t.run(ctx => ctx.db.query("subscriptionNotices").collect());
    const confirmations = rows.filter(row => row.kind === "confirmation");
    expect(confirmations).toHaveLength(1);
    await t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: confirmations[0]._id });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].text).toContain("Your SCRUB subscription confirmation");
    expect(mocks.send.mock.calls[0][0].text).toContain("$64.99");
    expect(mocks.send.mock.calls[0][0].text).toContain("Settings > Billing > Manage Billing");
  });
  it("deduplicates reconciliation and concurrent dispatch; retries have a stable provider key", async () => {
    const { t, rows } = await setup(); const row = rows.find(r => r.kind === "trial")!;
    await t.mutation(internal.subscriptionNotices.reconcile, { snapshot: initial, confirmation: false });
    expect(await t.run(ctx => ctx.db.query("subscriptionNotices").collect())).toHaveLength(rows.length);
    await Promise.all([t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: row._id }), t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: row._id })]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].idempotencyKey).toBe(`scrub-subscription-${row._id}`);
    expect(await t.run(ctx => ctx.db.get(row._id))).toMatchObject({ status: "accepted", providerId: "message_accepted", attempts: 1 });
  });
  it("retries provider uncertainty without duplicate acceptance and freezes the request key", async () => {
    const { t, rows } = await setup(); const row = rows.find(r => r.kind === "trial")!;
    mocks.send.mockResolvedValueOnce({ status: "unknown", category: "provider_uncertain" });
    await t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: row._id });
    const retry = (await t.run(ctx => ctx.db.get(row._id)))!;
    expect(retry.status).toBe("failed"); vi.mocked(Date.now).mockReturnValue(retry.dueAt);
    await t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: row._id });
    expect(mocks.send.mock.calls[0][0]).toEqual(mocks.send.mock.calls[1][0]);
    expect(await t.run(ctx => ctx.db.get(row._id))).toMatchObject({ status: "accepted", attempts: 2 });
  });
  it("suppresses queued reminders on fresh Stripe cancellation", async () => {
    const { t, rows } = await setup(); const row = rows.find(r => r.kind === "trial")!;
    mocks.retrieve.mockResolvedValue(subFixture({ ...initial, renewing: false }));
    await t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: row._id });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.get(row._id))).toMatchObject({ status: "superseded" });
  });
  it("hydrates item coupon IDs without a five-level Stripe expansion", async () => {
    const sub = subFixture();
    sub.items.data[0].discounts = [{ id: "di_item", start: start / 1000, end: (trialEnd + DAY) / 1000, source: { coupon: "coupon_item" } } as Stripe.Discount];
    mocks.coupon.mockResolvedValue({ id: "coupon_item", name: "25% off", percent_off: 25 });
    mocks.retrieve.mockImplementation(async () => structuredClone(sub));
    const snapshot = { ...initial, discounts: [{ id: "di_item", description: "25% off", start, end: trialEnd + DAY }] };
    const { t, rows } = await setup(snapshot);
    const row = rows.find(r => r.kind === "trial")!;
    await t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: row._id });
    expect(mocks.coupon).toHaveBeenCalledWith("coupon_item");
    expect(mocks.retrieve.mock.calls[0][1].expand).not.toContain("items.data.discounts.source.coupon");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("reschedules a changed billing date and uses the latest plan price before sending", async () => {
    const { t, rows } = await setup(); const row = rows.find(r => r.kind === "trial")!;
    const next = { ...initial, trialEnd: trialEnd + DAY, anchor: trialEnd + DAY, amount: 3499, plan: "Solo" };
    mocks.retrieve.mockResolvedValue(subFixture(next));
    await t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: row._id });
    expect(mocks.send).not.toHaveBeenCalled();
    const newer = (await t.run(ctx => ctx.db.query("subscriptionNotices").collect())).find(r => r.kind === "trial" && r.targetAt === next.trialEnd)!;
    vi.mocked(Date.now).mockReturnValue(newer.dueAt);
    await t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: newer._id });
    expect(mocks.send.mock.calls[0][0].text).toContain("$34.99");
  });
  it("fails closed on a replaced company's subscription and on missing email ownership", async () => {
    const { t, rows } = await setup(); const row = rows.find(r => r.kind === "trial")!;
    await t.run(async ctx => { const company = (await ctx.db.query("companies").collect())[0]; await ctx.db.patch(company._id, { stripeSubscriptionId: "sub_replacement" }); });
    await t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: row._id });
    vi.stubEnv("SCRUB_SUBSCRIPTION_EMAIL_OWNER", "stripe");
    await t.action(internal.actions.subscriptionNotices.dispatch, { noticeId: row._id });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("records a missed legal window rather than sending late", async () => {
    vi.mocked(Date.now).mockReturnValue(trialEnd - DAY);
    const { t, rows } = await setup();
    expect(rows.find(r => r.kind === "trial")?.status).toBe("missed");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.query("subscriptionNoticeAccounts").collect())).toHaveLength(1);
  });
  it("marks an old ambiguous claim unknown after the provider's idempotency window", async () => {
    const { t, rows } = await setup(); const row = rows.find(r => r.kind === "trial")!;
    await t.mutation(internal.subscriptionNotices.claim, { noticeId: row._id });
    vi.mocked(Date.now).mockReturnValue(Date.now() + DAY);
    await t.mutation(internal.subscriptionNotices.tick, {});
    expect(await t.run(ctx => ctx.db.get(row._id))).toMatchObject({ status: "unknown" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("verified winner billing mechanics (deterministic, not a Stripe Test Clock result)", () => {
  function winner(amount: number) {
    const sub = subFixture({ ...initial, amount });
    sub.discounts = [{ id: "di_award", promotion_code: "promo_winner", start: start / 1000, end: addMonths(start, 6) / 1000,
      source: { coupon: { percent_off: 100, duration: "repeating", duration_in_months: 6, applies_to: null } } } as unknown as Stripe.Discount];
    return sub;
  }
  it.each([3499, 6499, 14999])("verifies six complete discounted invoices after the trial for price %s", amount => {
    const sub = winner(amount); const end = winnerAwardEnd(sub, "promo_winner")!;
    expect(end * 1000).toBe(addMonths(trialEnd, 6));
    expect((sub.discounts[0] as Stripe.Discount).end! * 1000).toBeLessThan(end * 1000);
    for (const now of [start + DAY, trialEnd + 35 * DAY]) {
      vi.mocked(Date.now).mockReturnValue(now);
      expect(cancellationParameters(sub, end)).toMatchObject({ cancel_at: end, cancel_at_period_end: false, proration_behavior: "none" });
    }
  });
  it("does not guess dates from an invalid coupon and preserves a recorded award after expiry", () => {
    const sub = winner(6499); (sub.discounts[0] as Stripe.Discount).end = (trialEnd + DAY) / 1000;
    expect(() => winnerAwardEnd(sub, "promo_winner")).toThrow("six post-trial");
    sub.metadata = { scrub_offer: "giveaway-2026-002", scrub_winner_promotion: "promo_winner", scrub_initial_trial_end: String(trialEnd / 1000), scrub_initial_discount_end: String(addMonths(start, 6) / 1000), scrub_awarded_until: String(addMonths(trialEnd, 6) / 1000) };
    sub.discounts = [];
    vi.mocked(Date.now).mockReturnValue(addMonths(start, 6) + DAY);
    expect(winnerAwardEnd(sub, "promo_winner")! * 1000).toBe(addMonths(trialEnd, 6));
  });
  it("rejects a plan change outside coupon products or a shortened trial", () => {
    const sub = winner(6499);
    const discount = sub.discounts[0] as Stripe.Discount;
    (discount.source.coupon as Stripe.Coupon).applies_to = { products: ["prod_other"] };
    expect(() => winnerAwardEnd(sub, "promo_winner")).toThrow("not verified");
    (discount.source.coupon as Stripe.Coupon).applies_to = undefined;
    sub.trial_end = sub.trial_start! + 7 * 86400;
    expect(() => winnerAwardEnd(sub, "promo_winner")).toThrow("not verified");
  });
  it("has a calendar-based extended-trial fallback and clamps month ends", () => {
    const date = Date.parse("2026-02-15T10:00:00Z");
    const fallback = extendedWinnerTrial(date / 1000);
    expect(fallback.trial_end * 1000).toBe(Date.parse("2026-09-01T10:00:00Z"));
    expect(addMonths(Date.parse("2026-08-31T10:00:00Z"), 6)).toBe(Date.parse("2027-02-28T10:00:00Z"));
    expect(fallback).not.toHaveProperty("discounts");
  });
  it("authenticates online cancellation and binds it to the owner's Stripe customer", async () => {
    const { t } = await setup();
    const userId = await t.run(async ctx => {
      const company = (await ctx.db.query("companies").collect())[0];
      const user = await ctx.db.insert("users", { email: "owner@example.test", name: "Owner", role: "owner", status: "active", companyId: company._id, passwordHash: "synthetic" });
      await ctx.db.insert("authSessions", { userId: user, principalType: "staff", version: 1, tokenHash: await hashTokenForLookup("owner-session"), createdAt: Date.now(), lastUsedAt: Date.now(), expiresAt: Date.now() + DAY, idleExpiresAt: Date.now() + DAY });
      return user;
    });
    await expect(t.action(api.actions.billing.cancelAutomaticRenewal, { userId, sessionToken: "wrong-session" })).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.retrieve.mockResolvedValueOnce({ ...subFixture(), customer: "cus_other" });
    await expect(t.action(api.actions.billing.cancelAutomaticRenewal, { userId, sessionToken: "owner-session" })).rejects.toThrow("customer mismatch");
    expect(mocks.update).not.toHaveBeenCalled();
    vi.stubEnv("SCRUB_WINNER_PROMOTION_CODE_ID", "promo_winner"); mocks.retrieve.mockResolvedValue(winner(6499));
    await t.action(api.actions.billing.cancelAutomaticRenewal, { userId, sessionToken: "owner-session" });
    expect(mocks.update).toHaveBeenCalledWith("sub_notice", expect.objectContaining({ cancel_at: addMonths(trialEnd, 6) / 1000, proration_behavior: "none" }));
  });
});
