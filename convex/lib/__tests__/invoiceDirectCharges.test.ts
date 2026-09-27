import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import Stripe from "stripe";
import { invoiceCheckoutParameters } from "../invoiceCheckoutConfig";
import { computeInvoicePlatformFee, getStripeRequestContextForAttempt, retrieveCheckoutSessionForAttempt, retrievePaymentIntentForAttempt, expireCheckoutSessionForAttempt, validatePaymentEventAccount } from "../invoiceStripeContext";
import { invoicePaymentsEnabled } from "../environment";
import { liveMerchantInvoiceCheckoutReady, MerchantAccountFacts, companyConnectState } from "../companyConnectReadiness";
import { merchantAccountParameters, CONNECT_API_VERSION } from "../companyStripeMerchant";

const mocked = vi.hoisted(() => ({ retrieveIntent: vi.fn() }));
vi.mock("stripe", async importOriginal => {
  const original = await importOriginal<typeof import("stripe")>();
  class MockStripe extends original.default {
    constructor(...args: ConstructorParameters<typeof original.default>) { super(...args); this.paymentIntents.retrieve = mocked.retrieveIntent; }
  }
  return { ...original, default: MockStripe };
});
const modules = import.meta.glob("../../**/*.ts");

async function setup(amount = 50000, legacy = false) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const company = await ctx.db.insert("companies", { name: "Direct", timezone: "America/New_York", stripeConnectAccountId: "acct_company", stripeConnectArchitecture: "merchant_direct_v2" });
    const client = await ctx.db.insert("clientUsers", { email: "direct@test.dev", displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const relationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Client", clientType: "commercial", status: "active", createdAt: 1, updatedAt: 1 });
    const commercial = await ctx.db.insert("commercialAccounts", { companyId: company, clientRelationshipId: relationship, clientName: "Client", contractAmountCents: amount, status: "active", createdAt: 1, updatedAt: 1 });
    const invoice = await ctx.db.insert("invoices", { companyId: company, clientRelationshipId: relationship, commercialAccountId: commercial, invoiceType: "commercial", title: "Cleaning", invoiceNumber: "INV-1", status: "issued", billingStartDate: "2030-01-01", billingEndDate: "2030-01-31", issueDate: "2030-02-01", dueDate: "2030-03-01", subtotalCents: amount, totalCents: amount, taxCents: 0, jobIds: [], createdAt: 1, updatedAt: 1 });
    return { company, client, relationship, invoice };
  });
  const attemptId = await t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: ids.invoice, clientUserId: ids.client, connectedStripeAccountId: "acct_company" });
  await t.mutation(internal.invoicePaymentInternal.opened, { attemptId, sessionId: "cs_direct", url: "https://checkout.test" });
  if (legacy) await t.run(ctx => ctx.db.patch(attemptId, { chargeModel: undefined, connectedStripeAccountId: undefined, destinationStripeAccountId: "acct_old" }));
  return { t, ...ids, attemptId, amount, legacy };
}

function paymentEvent(s: Awaited<ReturnType<typeof setup>>, changes: any = {}) {
  return { id: "evt_direct", object: "event", type: "checkout.session.completed", account: s.legacy ? undefined : "acct_company", livemode: false, created: Math.floor(Date.now() / 1000), data: { object: { id: "cs_direct", object: "checkout.session", livemode: false, payment_status: "paid", payment_intent: "pi_direct", amount_total: s.amount, currency: "usd", metadata: { type: "invoice_payment", invoicePaymentAttemptId: String(s.attemptId), invoiceId: String(s.invoice), companyId: String(s.company) } } }, ...changes };
}
function intent(s: Awaited<ReturnType<typeof setup>>) {
  return { id: "pi_direct", status: "succeeded", livemode: false, amount: s.amount, amount_received: s.amount, currency: "usd", application_fee_amount: computeInvoicePlatformFee(s.amount) || null, transfer_data: s.legacy ? { destination: "acct_old" } : null, metadata: { invoicePaymentAttemptId: String(s.attemptId), invoiceId: String(s.invoice), companyId: String(s.company) } };
}
async function deliver(s: Awaited<ReturnType<typeof setup>>, event: any, source = "connect") {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: source === "connect" ? "whsec_direct" : "whsec_platform" });
  return s.t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload });
}
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://scrub.test"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_mock");
  vi.stubEnv("STRIPE_WEBHOOK_CONNECT_SECRET", "whsec_direct"); vi.stubEnv("STRIPE_WEBHOOK_ACCOUNT_SECRET", "whsec_platform");
  vi.stubEnv("SCRUB_ENABLE_LIVE_INVOICE_PAYMENTS", ""); vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", ""); mocked.retrieveIntent.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("direct invoice economics and request context", () => {
  it.each([[2500, 0], [2999, 0], [3000, 200], [3001, 200], [50000, 200]])("freezes the fee and exact charge for %i cents", async (amount, fee) => {
    const s = await setup(amount);
    const attempt = (await s.t.run(ctx => ctx.db.get(s.attemptId)))!;
    expect(attempt).toMatchObject({ chargeModel: "direct", connectedStripeAccountId: "acct_company", platformFeeCents: fee });
    const checkout = invoiceCheckoutParameters(attempt, "INV-1", "https://scrub.test");
    expect(checkout.parameters.line_items[0].price_data.unit_amount).toBe(amount);
    expect(checkout.options.stripeAccount).toBe("acct_company");
    expect(checkout.parameters.payment_intent_data).not.toHaveProperty("transfer_data");
    if (fee) expect(checkout.parameters.payment_intent_data.application_fee_amount).toBe(200);
    else expect(checkout.parameters.payment_intent_data).not.toHaveProperty("application_fee_amount");
    mocked.retrieveIntent.mockResolvedValue(intent(s));
    expect((await deliver(s, paymentEvent(s))).status).toBe(200);
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe("paid");
  });
  it("uses immutable ownership for all reads and expiry, and legacy platform context", async () => {
    const stripe = { checkout: { sessions: { retrieve: vi.fn(), expire: vi.fn() } }, paymentIntents: { retrieve: vi.fn() } } as any;
    const direct = { chargeModel: "direct" as const, connectedStripeAccountId: "acct_old" };
    await retrieveCheckoutSessionForAttempt(stripe, direct, "cs_1"); await retrievePaymentIntentForAttempt(stripe, direct, "pi_1"); await expireCheckoutSessionForAttempt(stripe, direct, "cs_1");
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_1", {}, { stripeAccount: "acct_old" });
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_1", {}, { stripeAccount: "acct_old" });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_1", {}, { stripeAccount: "acct_old" });
    expect(getStripeRequestContextForAttempt({ destinationStripeAccountId: "acct_old" })).toEqual({});
    expect(() => getStripeRequestContextForAttempt({ chargeModel: "direct" })).toThrow("context");
    expect(validatePaymentEventAccount(direct, "acct_old", "account")).toBe(false);
    const base = { ...direct, _id: "one", invoiceId: "inv", companyId: "co", amountCents: 3000, platformFeeCents: 200 };
    expect(invoiceCheckoutParameters(base, "INV", "https://scrub.test").options.idempotencyKey).not.toBe(invoiceCheckoutParameters({ ...base, connectedStripeAccountId: "acct_new" }, "INV", "https://scrub.test").options.idempotencyKey);
  });
  it("defaults live payments off, permits test mode, and honors the external gate", () => {
    expect(invoicePaymentsEnabled()).toBe(true);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_mock"); expect(invoicePaymentsEnabled()).toBe(false);
    vi.stubEnv("SCRUB_ENABLE_LIVE_INVOICE_PAYMENTS", "true"); expect(invoicePaymentsEnabled()).toBe(true);
    vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "true"); expect(invoicePaymentsEnabled()).toBe(false);
  });
});

describe("signed direct and historical payment events", () => {
  it("applies success exactly once and retrieves the connected PaymentIntent", async () => {
    const s = await setup(); mocked.retrieveIntent.mockResolvedValue(intent(s));
    const event = paymentEvent(s); await deliver(s, event); await deliver(s, event); await deliver(s, { ...event, id: "evt_duplicate_other" });
    expect(mocked.retrieveIntent).toHaveBeenCalledWith("pi_direct", {}, { stripeAccount: "acct_company" });
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.canonicalPaymentAttemptId).toBe(s.attemptId);
    expect((await s.t.run(ctx => ctx.db.get(s.attemptId)))?.status).toBe("paid");
  });
  it.each([undefined, "acct_wrong"])("reconciles wrong or missing event.account %s before Stripe reads", async account => {
    const s = await setup(); await deliver(s, paymentEvent(s, { account }));
    expect(mocked.retrieveIntent).not.toHaveBeenCalled();
    expect((await s.t.run(ctx => ctx.db.get(s.attemptId)))?.status).toBe("reconciliation_required");
    mocked.retrieveIntent.mockResolvedValue(intent(s)); await deliver(s, paymentEvent(s, { id: "evt_corrected" }));
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe("issued");
  });
  it("rejects a direct event signed with the platform secret", async () => {
    const s = await setup(); await deliver(s, paymentEvent(s), "account");
    expect(mocked.retrieveIntent).not.toHaveBeenCalled(); expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe("issued");
  });
  it.each(["amount", "currency", "fee", "intent", "session"])("reconciles a signed %s mismatch", async field => {
    const s = await setup(); const observed: any = intent(s); const event = paymentEvent(s);
    if (field === "amount") observed.amount_received--;
    if (field === "currency") observed.currency = "eur";
    if (field === "fee") observed.application_fee_amount = 0;
    if (field === "intent") observed.id = "pi_wrong";
    if (field === "session") event.data.object.id = "cs_wrong";
    mocked.retrieveIntent.mockResolvedValue(observed); await deliver(s, event);
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe("issued");
    expect((await s.t.run(ctx => ctx.db.get(s.attemptId)))?.status).toBe("reconciliation_required");
  });
  it.each(["checkout.session.expired", "checkout.session.async_payment_failed"])("handles %s then late success", async type => {
    const s = await setup(); await deliver(s, paymentEvent(s, { type }));
    expect((await s.t.run(ctx => ctx.db.get(s.attemptId)))?.status).toBe(type.endsWith("expired") ? "expired" : "failed");
    mocked.retrieveIntent.mockResolvedValue(intent(s)); await deliver(s, paymentEvent(s, { id: "evt_late" }));
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe("paid");
  });
  it("preserves legacy ownership after the company changes accounts", async () => {
    const s = await setup(50000, true); await s.t.run(ctx => ctx.db.patch(s.company, { stripeConnectAccountId: "acct_replacement" }));
    mocked.retrieveIntent.mockResolvedValue(intent(s)); await deliver(s, paymentEvent(s), "account");
    expect(mocked.retrieveIntent).toHaveBeenCalledWith("pi_direct", {}, {});
    expect((await s.t.run(ctx => ctx.db.get(s.attemptId)))?.destinationStripeAccountId).toBe("acct_old");
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe("paid");
  });
  it("retains refund/dispute account context without altering invoice payment", async () => {
    const s = await setup(); mocked.retrieveIntent.mockResolvedValue(intent(s)); await deliver(s, paymentEvent(s));
    await deliver(s, { ...paymentEvent(s), id: "evt_refund", type: "charge.refunded", data: { object: { id: "ch_direct", payment_intent: "pi_direct" } } });
    expect(await s.t.run(ctx => ctx.db.query("invoiceStripeFinancialEvents").collect())).toMatchObject([{ attemptId: s.attemptId, eventAccount: "acct_company", contextValid: true }]);
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe("paid");
  });
});

describe("Merchant readiness and configuration", () => {
  const ready: MerchantAccountFacts = { id: "acct_company", closed: false, livemode: false, dashboard: "express", identity: { country: "us" }, applied_configurations: ["merchant"], defaults: { currency: "usd", responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } }, configuration: { merchant: { capabilities: { card_payments: { status: "active", status_details: [] }, stripe_balance: { payouts: { status: "active", status_details: [] } } } } }, requirements: { entries: [], summary: {} } };
  const compatible = { id: "acct_company", charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], past_due: [] } };
  it("requests only supported Merchant capabilities on the current preview", () => {
    const parameters = merchantAccountParameters("owner@test.dev", "company", "flow");
    expect(CONNECT_API_VERSION).toBe("2026-08-26.preview");
    expect(parameters).toMatchObject({ dashboard: "express", defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } }, configuration: { merchant: { capabilities: { card_payments: { requested: true } } } } });
    expect(parameters.configuration).not.toHaveProperty("recipient"); expect(parameters.include).toContain("defaults");
  });
  it("passes only complete live account facts", () => { expect(liveMerchantInvoiceCheckoutReady(ready, compatible, "acct_company", false)).toBe(true); });
  it.each(["merchant", "fees", "losses", "card", "payout", "requirements", "mode", "closed", "dashboard", "include", "restriction"])("fails closed for %s", field => {
    const account = structuredClone(ready); const v1 = structuredClone(compatible);
    if (field === "merchant") account.configuration = {};
    if (field === "fees") account.defaults!.responsibilities!.fees_collector = "application";
    if (field === "losses") account.defaults!.responsibilities!.losses_collector = "application";
    if (field === "card") account.configuration!.merchant!.capabilities!.card_payments!.status = "inactive";
    if (field === "payout") account.configuration!.merchant!.capabilities!.stripe_balance!.payouts!.status = "inactive";
    if (field === "requirements") account.requirements = { entries: [], summary: { minimum_deadline: { status: "past_due" } } };
    if (field === "mode") account.livemode = true;
    if (field === "closed") account.closed = true;
    if (field === "dashboard") account.dashboard = "full";
    if (field === "include") account.defaults = undefined;
    if (field === "restriction") v1.payouts_enabled = false;
    expect(liveMerchantInvoiceCheckoutReady(account, v1, "acct_company", false)).toBe(false);
  });
  it("requires reconnect for cached legacy Ready and live verification for modern accounts", () => {
    expect(companyConnectState({ stripeConnectAccountId: "acct_old", stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true, stripeConnectLastSyncAt: Date.now() })).toBe("reconnect_required");
    expect(liveMerchantInvoiceCheckoutReady({ ...ready, closed: true }, compatible, "acct_company", false)).toBe(false);
  });
});
