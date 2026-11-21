import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import * as founder from "../../founderNotifications";
import * as billing from "../../mutations/billing";
import { founderStripeLaunchSeconds } from "../founderLaunch";
import { firstCompanyPayment, founderAccess } from "../founderStripe";

const modules = import.meta.glob("../../**/*.ts");
const provider = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send: provider }; } }));
const launch = 100;
beforeEach(() => {
  vi.stubEnv("SCRUB_FOUNDER_STRIPE_LAUNCH_AT", "1970-01-01T00:01:40Z");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_corrections");
  vi.stubEnv("STRIPE_WEBHOOK_ACCOUNT_SECRET", "whsec_corrections");
  vi.stubEnv("STRIPE_WEBHOOK_CONNECT_SECRET", "");
  vi.stubEnv("APP_URL", "https://scrub.example.com");
  vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "");
  vi.stubEnv("SCRUB_FOUNDER_EMAIL", "founder@example.com");
  vi.stubEnv("RESEND_API_KEY", "test");
  vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.com");
  provider.mockReset().mockRejectedValue(new Error("provider timeout"));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function setup() {
  const t = convexTest(schema, modules);
  const companyId = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Real company", timezone: "UTC", stripeCustomerId: "cus_corrections", stripeSubscriptionId: "sub_corrections", subscriptionStatus: "trialing" });
    const referrer = await ctx.db.insert("users", { companyId, role: "affiliate", status: "active", name: "Affiliate", email: "affiliate@example.com", passwordHash: "test" });
    await ctx.db.insert("users", { companyId, role: "owner", status: "active", name: "Owner", email: "owner@example.com", passwordHash: "test", referredByUserId: referrer });
    return companyId;
  });
  return { t, companyId };
}
const subscription = (created = launch, status = "active") => ({ id: "sub_corrections", object: "subscription", customer: "cus_corrections", created, status, discounts: ["di_promo"], cancel_at_period_end: false, current_period_end: 1000, items: { data: [{ price: { id: "price_corrections" } }] } });
const invoice = (id = "in_first", paidAt = 101, amount = 1000) => ({ id, object: "invoice", customer: "cus_corrections", subscription: "sub_corrections", status: "paid", amount_paid: amount, currency: "usd", created: 10, status_transitions: { paid_at: paidAt } });
async function deliver(t: ReturnType<typeof convexTest>, type: string, object: unknown, id = "evt_corrections", previous?: unknown) {
  const payload = JSON.stringify({ id, object: "event", type, created: 200, data: { object, ...(previous ? { previous_attributes: previous } : {}) } });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_corrections" });
  return t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload });
}
const notifications = (t: ReturnType<typeof convexTest>) => t.run(ctx => ctx.db.query("founderNotifications").collect());

// Exercise actual registered mutations with a failing DB operation, not a mocked best-effort helper.
function failInsert(endpoint: unknown, table: string) {
  const target = endpoint as { _handler: (ctx: any, args: any) => Promise<unknown> };
  const original = target._handler;
  return vi.spyOn(target, "_handler").mockImplementation((ctx, args) => original({ ...ctx, db: new Proxy(ctx.db, {
    get(db, property) {
      if (property === "insert") return (name: string, value: unknown) => {
        if (name === table) throw new Error("injected founder storage failure");
        return db.insert(name, value);
      };
      const value = Reflect.get(db, property); return typeof value === "function" ? value.bind(db) : value;
    },
  }) }, args));
}

describe("forward-looking subscription access", () => {
  it.each(["", "invalid", "2026-02-30T00:00:00Z", "2026-11-21T10:00:00"])("fails closed for missing/invalid boundary %s", async value => {
    vi.stubEnv("SCRUB_FOUNDER_STRIPE_LAUNCH_AT", value);
    expect(founderStripeLaunchSeconds()).toBeNull();
    const { t, companyId } = await setup();
    expect((await deliver(t, "customer.subscription.created", subscription())).status).toBe(200);
    expect(await notifications(t)).toEqual([]);
    expect((await t.run(ctx => ctx.db.get(companyId)))?.subscriptionStatus).toBe("active");
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toHaveLength(1);
  });
  it.each(["customer.subscription.created", "customer.subscription.updated"])("rejects prelaunch subscriptions on %s", async type => {
    const { t } = await setup();
    await deliver(t, type, subscription(99), "evt_old", { status: "incomplete" });
    expect(await notifications(t)).toEqual([]);
  });
  it.each([undefined, { status: "active" }, { status: "trialing" }])("does not call a renewal/billing edit a start (%s)", async previous => {
    const { t } = await setup();
    await deliver(t, "customer.subscription.updated", subscription(), "evt_edit", previous);
    expect(await notifications(t)).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("founderBillingFacts").collect())).toEqual([]);
  });
  it("notifies initial incomplete-to-access transition and deduplicates delayed creation/edits", async () => {
    const { t } = await setup();
    await deliver(t, "customer.subscription.created", subscription(100, "incomplete"), "evt_incomplete");
    expect(await notifications(t)).toEqual([]);
    await deliver(t, "customer.subscription.updated", subscription(), "evt_access", { status: "incomplete" });
    await deliver(t, "customer.subscription.created", subscription(100, "trialing"), "evt_created");
    await deliver(t, "customer.subscription.updated", subscription(), "evt_edit");
    await deliver(t, "customer.subscription.updated", subscription(), "evt_access", { status: "incomplete" });
    expect((await notifications(t)).map(row => row.kind)).toEqual(["access"]);
  });
  it("does not fall back to active company state when payment evidence reconciles", async () => {
    const { t } = await setup();
    await t.mutation(internal.founderNotifications.billing, { customerId: "cus_corrections", subscriptionId: "sub_corrections", payment: { Invoice: "in_first", "Paid at": "101" } });
    expect((await notifications(t)).map(row => row.kind)).toEqual(["paid"]);
  });
  it("skips old queued access/payment rows lacking reliable postlaunch proof", async () => {
    const { t } = await setup();
    for (const kind of ["access", "paid"] as const) {
      const id = await t.run(ctx => ctx.db.insert("founderNotifications", { kind, key: kind, state: "pending", details: { Status: "active", Timestamp: "2026-11-21" }, createdAt: Date.now() }));
      expect(await t.mutation(internal.founderNotifications.claim, { id })).toBeNull();
      expect((await t.run(ctx => ctx.db.get(id)))?.state).toBe("skipped");
    }
  });
  it("replaces only unsent stale payment evidence and preserves a genuine postlaunch conversion", async () => {
    const { t, companyId } = await setup();
    const id = await t.run(ctx => ctx.db.insert("founderNotifications", { kind: "paid", key: `paid:${companyId}`, state: "skipped", details: { Timestamp: "old draft" }, createdAt: Date.now() }));
    expect(await t.query(internal.founderNotifications.paymentAlreadyRecorded, { customerId: "cus_corrections" })).toBe(false);
    await t.mutation(internal.founderNotifications.billing, { customerId: "cus_corrections", subscriptionId: "sub_corrections", payment: { Invoice: "in_first", "Paid at": "101" } });
    expect((await t.run(ctx => ctx.db.get(id)))?.state).toBe("pending");
    expect(await t.query(internal.founderNotifications.paymentAlreadyRecorded, { customerId: "cus_corrections" })).toBe(true);
    expect(await notifications(t)).toHaveLength(1);
  });
});

function mockStripe(invoices: ReturnType<typeof invoice>[], creditOnly: string[] = []) {
  return { invoices: { list: () => invoices }, invoicePayments: { list: ({ invoice: id }: { invoice: string }) => creditOnly.includes(id) ? [] : [{ amount_paid: 1000, status_transitions: { paid_at: invoices.find(invoice => invoice.id === id)!.status_transitions.paid_at }, payment: { type: "payment_intent", payment_intent: "pi_test" } }] }, paymentIntents: { retrieve: async () => ({ status: "succeeded", amount_received: 1000, currency: "usd", customer: "cus_corrections" }) } } as unknown as Stripe;
}
describe("forward-looking first collection", () => {
  it("does not invent a launch time from missing allocation history timestamps", async () => {
    const paid = invoice(), stripe = mockStripe([paid]);
    vi.spyOn(stripe.invoicePayments, "list").mockReturnValue([{ amount_paid: 1000, payment: { type: "payment_intent", payment_intent: "pi_old" } }] as any);
    await expect(firstCompanyPayment(stripe, "cus_corrections", paid as unknown as Stripe.Invoice)).rejects.toThrow("Missing verified collection timestamp");
  });
  it("rejects a prelaunch partial collection even when the invoice settled after launch", async () => {
    const paid = invoice("in_partial", 110);
    const stripe = mockStripe([paid]);
    vi.spyOn(stripe.invoicePayments, "list").mockReturnValue([{ amount_paid: 1000, status_transitions: { paid_at: 99 }, payment: { type: "payment_intent", payment_intent: "pi_partial" } }] as any);
    expect(await firstCompanyPayment(stripe, "cus_corrections", paid as unknown as Stripe.Invoice)).toBeUndefined();
  });
  it("does not announce prelaunch first payment when a renewal or delayed event arrives", async () => {
    const old = invoice("in_old", 99), renewal = invoice("in_renewal", 101);
    const stripe = mockStripe([renewal, old]);
    expect(await firstCompanyPayment(stripe, "cus_corrections", renewal as unknown as Stripe.Invoice)).toBeUndefined();
    expect(await firstCompanyPayment(stripe, "cus_corrections", old as unknown as Stripe.Invoice)).toBeUndefined();
  });
  it("preserves prelaunch trials/100% coupons/credits converting positively after launch", async () => {
    const paid = invoice(), free = invoice("in_free", 50, 0), credits = invoice("in_credits", 60);
    expect(founderAccess(subscription(50, "trialing") as unknown as Stripe.Subscription, 200)).toBeUndefined();
    expect(await firstCompanyPayment(mockStripe([paid, credits, free], [credits.id]), "cus_corrections", paid as unknown as Stripe.Invoice)).toMatchObject({ Invoice: "in_first", "Paid at": "101", Amount: "1000" });
  });
  it("uses the launch boundary inclusively and original payment time with reversed delivery order", async () => {
    const first = invoice("in_first", 100), renewal = invoice("in_renewal", 200);
    expect(await firstCompanyPayment(mockStripe([renewal, first]), "cus_corrections", renewal as unknown as Stripe.Invoice)).toMatchObject({ Invoice: "in_first", "Paid at": "100", Event: "first_payment" });
  });
});

describe("founder failures never intercept canonical Stripe processing", () => {
  it("preserves canonical work when the existing founder fact patch fails", async () => {
    const { t, companyId } = await setup();
    await t.run(ctx => ctx.db.insert("founderBillingFacts", { customerId: "cus_corrections", subscriptionId: "sub_corrections" }));
    const target = founder.billing as any, original = target._handler;
    vi.spyOn(target, "_handler").mockImplementation((ctx: any, args: any) => original({ ...ctx, db: new Proxy(ctx.db, {
      get(db, key) { if (key === "patch") return () => { throw new Error("founder fact patch failed"); }; const value = Reflect.get(db, key); return typeof value === "function" ? value.bind(db) : value; },
    }) }, args));
    expect((await deliver(t, "customer.subscription.created", subscription())).status).toBe(200);
    expect((await t.run(ctx => ctx.db.get(companyId)))?.subscriptionStatus).toBe("active");
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("stripeWebhookEvents").collect())).toMatchObject([{ status: "completed" }]);
  });
  it("isolates cron scheduling and provider failure from subsequent webhook processing", async () => {
    const { t } = await setup();
    expect((await deliver(t, "customer.subscription.created", subscription())).status).toBe(200);
    await expect(t.run(ctx => (founder.tick as any)._handler({ ...ctx, scheduler: { runAfter: () => { throw new Error("scheduler unavailable"); } } }, {}))).rejects.toThrow("scheduler unavailable");
    const row = (await notifications(t))[0];
    await t.action(internal.founderNotificationActions.dispatch, { id: row._id });
    expect(provider).toHaveBeenCalledTimes(1);
    expect((await notifications(t))[0].state).toBe("unknown");
    // Acknowledgement persistence also cannot propagate back into a completed webhook.
    vi.spyOn(founder.finish as any, "_handler").mockRejectedValue(new Error("acknowledgement unavailable"));
    const ackId = await t.run(ctx => ctx.db.insert("founderNotifications", { key: "ack-test", kind: "signup", state: "pending", details: {}, createdAt: Date.now() }));
    await expect(t.action(internal.founderNotificationActions.dispatch, { id: ackId })).rejects.toThrow("acknowledgement unavailable");
    expect((await deliver(t, "invoice.paid", invoice(), "evt_invoice")).status).toBe(200);
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toHaveLength(2);
    expect(await t.run(ctx => ctx.db.query("stripeWebhookEvents").collect())).toMatchObject([{ status: "completed" }, { status: "completed" }]);
  });
  it.each(["founderBillingFacts", "founderNotifications"])("commits subscription sync and affiliate attribution when %s insert fails", async table => {
    const { t, companyId } = await setup();
    const fault = failInsert(founder.billing, table);
    expect((await deliver(t, "customer.subscription.created", subscription())).status).toBe(200);
    expect(fault).toHaveBeenCalled();
    expect((await t.run(ctx => ctx.db.get(companyId)))?.subscriptionStatus).toBe("active");
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toMatchObject([{ attributionType: "subscription_created" }]);
    expect(await t.run(ctx => ctx.db.query("stripeWebhookEvents").collect())).toMatchObject([{ status: "completed" }]);
    expect((await deliver(t, "customer.subscription.created", subscription())).status).toBe(200);
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toHaveLength(1);
  });
  it("commits invoice attribution and webhook completion when founderPaymentChecks insert fails", async () => {
    const { t } = await setup(); const fault = failInsert(founder.recordPaymentCheck, "founderPaymentChecks");
    expect((await deliver(t, "invoice.paid", invoice())).status).toBe(200);
    expect(fault).toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toMatchObject([{ attributionType: "invoice_paid", stripeInvoiceId: "in_first", amountCents: 1000 }]);
    expect(await t.run(ctx => ctx.db.query("stripeWebhookEvents").collect())).toMatchObject([{ status: "completed" }]);
  });
  it.each(["syncSubscription", "recordAttribution"] as const)("retains HTTP 500/retry semantics for actual %s failures", async name => {
    const { t } = await setup();
    vi.spyOn(billing[name] as any, "_handler").mockRejectedValue(new Error("actual billing failure"));
    expect((await deliver(t, "customer.subscription.created", subscription())).status).toBe(500);
    expect(await t.run(ctx => ctx.db.query("stripeWebhookEvents").collect())).toMatchObject([{ status: "failed" }]);
    expect(await t.run(ctx => ctx.db.query("affiliateAttributions").collect())).toEqual([]);
  });
  it("retains invoice attribution failures on Stripe's retry path", async () => {
    const { t } = await setup();
    vi.spyOn(billing.recordAttribution as any, "_handler").mockRejectedValue(new Error("invoice attribution unavailable"));
    expect((await deliver(t, "invoice.paid", invoice())).status).toBe(500);
    expect(await t.run(ctx => ctx.db.query("stripeWebhookEvents").collect())).toMatchObject([{ status: "failed" }]);
    expect(await t.run(ctx => ctx.db.query("founderPaymentChecks").collect())).toEqual([]);
  });
  it("keeps invalid Stripe signatures rejected", async () => {
    const { t } = await setup();
    expect((await t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": "invalid" }, body: "{}" })).status).toBe(400);
    expect(await t.run(ctx => ctx.db.query("stripeWebhookEvents").collect())).toEqual([]);
  });
});
