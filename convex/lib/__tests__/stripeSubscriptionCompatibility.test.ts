import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import { requireActiveSubscription } from "../subscriptionGating";
import { invoiceSubscriptionId, storedSubscriptionPeriodEndMs, subscriptionPeriodEndMs } from "../stripeSubscriptionCompatibility";

const modules = import.meta.glob("../../**/*.ts");
const now = 1_800_000_000_000;
const periodSeconds = now / 1000;
const grace = 3 * 86_400_000;

async function setup() {
  const t = convexTest(schema, modules);
  const companyId = await t.run(async ctx => {
    const company = await ctx.db.insert("companies", { name: "Subscription compatibility", timezone: "America/New_York", stripeCustomerId: "cus_compat" });
    const referrer = await ctx.db.insert("users", { name: "Referrer", email: "referrer@compat.test", passwordHash: "unused-test-hash", role: "cleaner", status: "active", companyId: company });
    await ctx.db.insert("users", { name: "Owner", email: "owner@compat.test", passwordHash: "unused-test-hash", role: "owner", status: "active", companyId: company, referredByUserId: referrer });
    return company;
  });
  return { t, companyId };
}

function subscription(status = "active", period: unknown = periodSeconds) {
  return { id: "sub_compat", object: "subscription", customer: "cus_compat", status, cancel_at_period_end: false,
    items: { object: "list", data: [{ id: "si_compat", object: "subscription_item", current_period_start: periodSeconds - 30 * 86400, current_period_end: period, price: { id: "price_compat" } }], has_more: false } };
}

async function deliver(t: ReturnType<typeof convexTest>, type: string, object: unknown, id = "evt_compat", created = periodSeconds) {
  const payload = JSON.stringify({ id, object: "event", api_version: "2026-01-28.clover", type, livemode: false, created, data: { object } });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_compat" });
  return t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload });
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubEnv("APP_URL", "https://compat.test");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_compat");
  vi.stubEnv("STRIPE_WEBHOOK_ACCOUNT_SECRET", "whsec_compat");
  vi.stubEnv("STRIPE_WEBHOOK_CONNECT_SECRET", "");
  vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("signed Clover subscription snapshots", () => {
  it.each(["created", "updated", "deleted"])("handles subscription.%s with item periods in milliseconds", async lifecycle => {
    const { t, companyId } = await setup();
    const status = lifecycle === "deleted" ? "canceled" : "active";
    expect((await deliver(t, `customer.subscription.${lifecycle}`, subscription(status))).status).toBe(200);
    expect(await t.run(ctx => ctx.db.get(companyId))).toMatchObject({ subscriptionStatus: status, currentPeriodEnd: now, stripeSubscriptionId: "sub_compat" });
    if (status === "canceled") await expect(t.query(internal.authInternal.checkSubscription, { companyId })).rejects.toThrow("Subscription inactive");
    else await expect(t.query(internal.authInternal.checkSubscription, { companyId })).resolves.toBeNull();
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toHaveLength(lifecycle === "created" ? 1 : 0);
  });

  it.each(["active", "trialing"])("preserves %s access even when period facts are unavailable", async status => {
    const { t, companyId } = await setup();
    await deliver(t, "customer.subscription.updated", subscription(status, null));
    expect((await t.run(ctx => ctx.db.get(companyId)))?.currentPeriodEnd).toBeUndefined();
    await expect(t.query(internal.authInternal.checkSubscription, { companyId })).resolves.toBeNull();
    await expect(t.run(ctx => requireActiveSubscription(ctx, companyId))).resolves.toBeNull();
  });

  it("uses the same three-day grace boundary in both access checks", async () => {
    const { t, companyId } = await setup();
    await deliver(t, "customer.subscription.updated", subscription("past_due"));
    vi.spyOn(Date, "now").mockReturnValue(now + grace - 1);
    await expect(t.query(internal.authInternal.checkSubscription, { companyId })).resolves.toBeNull();
    await expect(t.run(ctx => requireActiveSubscription(ctx, companyId))).resolves.toBeNull();
    vi.spyOn(Date, "now").mockReturnValue(now + grace);
    await expect(t.query(internal.authInternal.checkSubscription, { companyId })).rejects.toThrow("Subscription inactive");
    await expect(t.run(ctx => requireActiveSubscription(ctx, companyId))).rejects.toThrow("subscription is inactive");
  });

  it.each([undefined, null, 0, "1800000000", -1, 1.5])("clears stale period evidence and denies past_due grace for malformed %s", async period => {
    const { t, companyId } = await setup();
    await t.run(ctx => ctx.db.patch(companyId, { currentPeriodEnd: now + grace, subscriptionStatus: "active" }));
    const snapshot = subscription("past_due", null);
    snapshot.items.data[0].current_period_end = period;
    await deliver(t, "customer.subscription.updated", { ...snapshot, ...(period === undefined ? {} : { current_period_end: periodSeconds }) });
    expect((await t.run(ctx => ctx.db.get(companyId)))?.currentPeriodEnd).toBeUndefined();
    await expect(t.query(internal.authInternal.checkSubscription, { companyId })).rejects.toThrow("Subscription inactive");
    await expect(t.run(ctx => requireActiveSubscription(ctx, companyId))).rejects.toThrow("subscription is inactive");
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"])("denies %s despite a future period", async status => {
    const { t, companyId } = await setup();
    await deliver(t, "customer.subscription.updated", subscription(status, periodSeconds + 86400));
    await expect(t.query(internal.authInternal.checkSubscription, { companyId })).rejects.toThrow("Subscription inactive");
    await expect(t.run(ctx => requireActiveSubscription(ctx, companyId))).rejects.toThrow("subscription is inactive");
  });

  it("retains legacy snapshot and stored epoch-second compatibility without rewriting records", async () => {
    const { t, companyId } = await setup();
    const legacy = { ...subscription("past_due"), current_period_end: periodSeconds, items: { data: [{ price: { id: "price_compat" } }] } };
    await deliver(t, "customer.subscription.updated", legacy);
    expect((await t.run(ctx => ctx.db.get(companyId)))?.currentPeriodEnd).toBe(now);
    await t.run(ctx => ctx.db.patch(companyId, { currentPeriodEnd: periodSeconds }));
    await expect(t.query(internal.authInternal.checkSubscription, { companyId })).resolves.toBeNull();
    await expect(t.run(ctx => requireActiveSubscription(ctx, companyId))).resolves.toBeNull();
    expect((await t.run(ctx => ctx.db.get(companyId)))?.currentPeriodEnd).toBe(periodSeconds);
  });
});

describe("invoice.paid subscription attribution", () => {
  it.each(["sub_compat", { id: "sub_compat", object: "subscription" }])("uses modern parent linkage %s and deduplicates invoices", async linked => {
    const { t } = await setup();
    const invoice = { id: "in_compat", object: "invoice", customer: "cus_compat", amount_paid: 3000, currency: "usd", parent: { type: "subscription_details", subscription_details: { subscription: linked } }, subscription: "sub_obsolete" };
    await deliver(t, "invoice.paid", invoice);
    await deliver(t, "invoice.paid", invoice, "evt_compat_duplicate");
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toMatchObject([{ stripeSubscriptionId: "sub_compat", stripeInvoiceId: "in_compat", amountCents: 3000, currency: "usd" }]);
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toHaveLength(1);
  });

  it.each([undefined, { type: "quote_details" }, { type: "subscription_details", subscription_details: {} }])("does not invent attribution for absent/non-subscription parent %s", async parent => {
    const { t } = await setup();
    await deliver(t, "invoice.paid", { id: "in_unlinked", customer: "cus_compat", amount_paid: 3000, currency: "usd", parent });
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toHaveLength(0);
  });

  it("supports a historical top-level subscription", async () => {
    const { t } = await setup();
    await deliver(t, "invoice.paid", { id: "in_old", customer: "cus_compat", subscription: "sub_old", amount_paid: 3000, currency: "usd" });
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toMatchObject([{ stripeSubscriptionId: "sub_old" }]);
  });
});

describe("compatibility edge cases", () => {
  it("uses the earliest complete item period and refuses partial or invalid evidence", () => {
    expect(subscriptionPeriodEndMs({ items: { data: [{ current_period_end: periodSeconds + 100 }, { current_period_end: periodSeconds }] } })).toBe(now);
    expect(subscriptionPeriodEndMs({ items: { data: [{ current_period_end: periodSeconds }, {}] }, current_period_end: periodSeconds })).toBeUndefined();
    expect(subscriptionPeriodEndMs({})).toBeUndefined();
    expect(subscriptionPeriodEndMs({ current_period_end: Number.MAX_SAFE_INTEGER })).toBeUndefined();
    expect(storedSubscriptionPeriodEndMs(now)).toBe(now);
    expect(storedSubscriptionPeriodEndMs(Number.NaN)).toBeUndefined();
    expect(invoiceSubscriptionId({ parent: { type: "quote_details" }, subscription: "sub_old" })).toBeUndefined();
  });
});
