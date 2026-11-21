import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { collectedSubscriptionPayment, firstCompanyPayment, founderAccess } from "../founderStripe";
import { INITIAL_ASSESSMENT_DEFINITION, isApplicable } from "../assessmentDefinition";
import { firstGiveawayId, giveawayCampaigns } from "../giveawayCampaigns";

const provider = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send: provider }; } }));
const modules = import.meta.glob("../../**/*.ts");
const backend = () => convexTest(schema, modules);
const checkout = { stripeCheckoutSessionId: "cs_founder", stripeCustomerId: "cus_founder", stripeSubscriptionId: "sub_founder", stripePriceId: "price_founder", subscriptionStatus: "trialing", founderAccess: { Status: "trialing", "Subscription created": "1" }, email: "owner@example.com", passwordHash: "hash", name: "Owner", companyName: "Cleaning", timezone: "America/New_York" };
const rows = (t: ReturnType<typeof backend>) => t.run(ctx => ctx.db.query("founderNotifications").collect());

beforeEach(() => {
  vi.stubEnv("SCRUB_FOUNDER_STRIPE_LAUNCH_AT", "1970-01-01T00:00:01Z");
  provider.mockReset().mockResolvedValue({ data: { id: "email_123" }, error: null });
  vi.stubEnv("SCRUB_FOUNDER_EMAIL", "founder@example.com");
  vi.stubEnv("RESEND_API_KEY", "test"); vi.stubEnv("RESEND_FROM_EMAIL", "verified@example.com");
  vi.stubEnv("APP_URL", "https://scrub.example.com"); vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("founder canonical milestones", () => {
  it("provisions once and separates trial access from payment", async () => {
    const t = backend();
    await t.mutation(internal.authInternal.provisionPublicCheckout, checkout);
    await t.mutation(internal.authInternal.provisionPublicCheckout, checkout);
    expect((await rows(t)).map(r => r.kind).sort()).toEqual(["access", "signup"]);
    expect((await rows(t)).find(r => r.kind === "access")?.details.Status).toBe("trialing");
  });
  it("notifies legacy owner creation but excludes worker/client, affiliate and empty company creation", async () => {
    const t = backend();
    const companyId = await t.mutation(internal.authInternal.createCompany, { name: "Company", timezone: "UTC" });
    expect(await rows(t)).toEqual([]);
    await t.mutation(internal.authInternal.createUser, { companyId, email: "worker@test.com", passwordHash: "hash", name: "Worker", role: "cleaner", status: "active" });
    await t.run(ctx => ctx.db.insert("users", { email: "affiliate@test.com", name: "Affiliate", passwordHash: "hash", role: "affiliate", status: "active" }));
    await t.run(ctx => ctx.db.insert("clientUsers", { email: "client@test.com", displayName: "Client", status: "active", createdAt: Date.now(), updatedAt: Date.now() }));
    expect(await rows(t)).toEqual([]);
    await t.mutation(internal.authInternal.createUser, { companyId, email: "owner@test.com", passwordHash: "hash", name: "Owner", role: "owner", status: "active" });
    expect((await rows(t)).map(r => r.kind)).toEqual(["signup"]);
  });
  it("reconciles pre-provisioning payment/access facts and deduplicates renewals", async () => {
    const t = backend();
    const evidence = { customerId: checkout.stripeCustomerId, subscriptionId: checkout.stripeSubscriptionId, payment: { Invoice: "in_first", Amount: "1000", "Paid at": "1" }, access: { "Subscription created": "1", Status: "active", "Coupon/promotion": "promo_half" } };
    await t.mutation(internal.founderNotifications.billing, evidence);
    expect(await rows(t)).toEqual([]);
    await t.mutation(internal.authInternal.provisionPublicCheckout, { ...checkout, subscriptionStatus: "active" });
    await t.mutation(internal.founderNotifications.billing, evidence);
    await t.mutation(internal.founderNotifications.billing, { ...evidence, payment: { Invoice: "in_renewal", Amount: "2000" } });
    expect((await rows(t)).filter(r => r.kind === "paid")).toMatchObject([{ details: { Invoice: "in_first" } }]);
    expect(await rows(t)).toHaveLength(3);
  });
  it.each(["accepted", "rejected", "network", "missing"])("isolates %s delivery and never sends twice", async result => {
    const t = backend(); await t.mutation(internal.authInternal.provisionPublicCheckout, checkout);
    const id = (await rows(t)).find(r => r.kind === "signup")!._id;
    if (result === "rejected") provider.mockResolvedValue({ data: null, error: { name: "validation_error", statusCode: 422 } });
    if (result === "network") provider.mockRejectedValue(new Error("timeout"));
    if (result === "missing") vi.stubEnv("SCRUB_FOUNDER_EMAIL", "");
    await t.action(internal.founderNotificationActions.dispatch, { id });
    await t.action(internal.founderNotificationActions.dispatch, { id });
    expect(provider).toHaveBeenCalledTimes(result === "missing" ? 0 : 1);
    expect((await rows(t)).find(r => r._id === id)?.state).toBe(({ accepted: "accepted", rejected: "failed", network: "unknown", missing: "skipped" } as const)[result as "accepted"]);
    expect(await t.run(ctx => ctx.db.query("checkoutProvisioning").collect())).toHaveLength(1);
    if (result === "accepted") expect(provider.mock.calls[0][0]).toMatchObject({ to: "founder@example.com", subject: "SCRUB — New Company Signup", text: expect.any(String), html: expect.any(String) });
  });
  it("claims concurrently once and abandons uncertain acceptance persistence without resend", async () => {
    const t = backend(); await t.mutation(internal.authInternal.provisionPublicCheckout, checkout);
    const id = (await rows(t))[0]._id;
    const claims = await Promise.all([t.mutation(internal.founderNotifications.claim, { id }), t.mutation(internal.founderNotifications.claim, { id })]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await t.run(ctx => ctx.db.patch(id, { claimedAt: Date.now() - 11 * 60_000 }));
    await t.run(async ctx => {
      const other = await ctx.db.query("founderNotifications").collect();
      for (const row of other) if (row._id !== id) await ctx.db.patch(row._id, { state: "skipped" });
    });
    await t.mutation(internal.founderNotifications.tick, {});
    expect((await rows(t)).find(r => r._id === id)?.state).toBe("unknown");
    await t.action(internal.founderNotificationActions.dispatch, { id });
    expect(provider).not.toHaveBeenCalled();
  });
});

const invoice = (id = "in_first", amount = 1000, created = 1) => ({ id, customer: "cus_founder", status: "paid", amount_paid: amount, currency: "usd", subscription: "sub_founder", created, status_transitions: { paid_at: created } }) as unknown as Stripe.Invoice;
function stripeMock(invoices: Stripe.Invoice[], allocations: Record<string, unknown[]> = {}) {
  return { invoices: { list: () => invoices }, invoicePayments: { list: ({ invoice: id }: { invoice: string }) => allocations[id] ?? [] }, paymentIntents: { retrieve: vi.fn(async () => ({ status: "succeeded", amount_received: 1000, currency: "usd", customer: "cus_founder" })) } } as unknown as Stripe;
}
const cash = (amount = 1000) => ({ amount_paid: amount, status: "paid", status_transitions: { paid_at: 1 }, payment: { type: "payment_intent", payment_intent: "pi_first" } });
describe("verified positive subscription collection", () => {
  it("runs successful asynchronous Stripe verification before company provisioning", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_founder");
    const t = backend(), stripe = new Stripe("sk_test_founder");
    vi.spyOn(Object.getPrototypeOf(stripe.invoices), "retrieve").mockResolvedValue(invoice());
    vi.spyOn(Object.getPrototypeOf(stripe.invoices), "list").mockReturnValue([invoice()]);
    vi.spyOn(Object.getPrototypeOf(stripe.invoicePayments), "list").mockReturnValue([cash()]);
    vi.spyOn(Object.getPrototypeOf(stripe.paymentIntents), "retrieve").mockResolvedValue({ status: "succeeded", amount_received: 1000, currency: "usd", customer: "cus_founder" });
    await t.mutation(internal.founderNotifications.recordPaymentCheck, { customerId: checkout.stripeCustomerId, subscriptionId: checkout.stripeSubscriptionId!, invoiceId: "in_first", eventId: "evt_first" });
    const check = (await t.run(ctx => ctx.db.query("founderPaymentChecks").collect()))[0];
    await t.action(internal.founderNotificationActions.checkPayment, { id: check._id });
    expect((await t.run(ctx => ctx.db.get(check._id)))?.state).toBe("done");
    expect(await rows(t)).toEqual([]);
    await t.mutation(internal.authInternal.provisionPublicCheckout, { ...checkout, founderAccess: { "Subscription created": "1", Status: "trialing", "Trial end": "2026-12-01", "Coupon/promotion": "promo_test" } });
    expect((await rows(t)).find(r => r.kind === "paid")?.details).toMatchObject({ Invoice: "in_first", Amount: "1000" });
    expect((await rows(t)).find(r => r.kind === "access")?.details).toMatchObject({ "Coupon/promotion": "promo_test" });
  });
  it("records signed invoice events once without performing network reads in the webhook", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_founder");
    vi.stubEnv("STRIPE_WEBHOOK_ACCOUNT_SECRET", "whsec_founder");
    const t = backend();
    for (const id of ["evt_founder", "evt_founder", "evt_duplicate_invoice"]) {
      const payload = JSON.stringify({ id, object: "event", type: "invoice.paid", created: 100, data: { object: invoice() } });
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_founder" });
      expect((await t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload })).status).toBe(200);
    }
    expect(await t.run(ctx => ctx.db.query("founderPaymentChecks").collect())).toHaveLength(1);
    expect(await rows(t)).toEqual([]);
  });
  it("verifies payment asynchronously, retries failed reads four times, and skips renewal reads after conversion", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_founder");
    const t = backend(); await t.mutation(internal.authInternal.provisionPublicCheckout, checkout);
    const stripe = new Stripe("sk_test_founder");
    const retrieve = vi.spyOn(Object.getPrototypeOf(stripe.invoices), "retrieve").mockRejectedValue(new Error("unavailable"));
    await t.mutation(internal.founderNotifications.recordPaymentCheck, { customerId: checkout.stripeCustomerId, subscriptionId: checkout.stripeSubscriptionId!, invoiceId: "in_first", eventId: "evt_first" });
    const check = (await t.run(ctx => ctx.db.query("founderPaymentChecks").collect()))[0];
    for (let n = 0; n < 5; n++) {
      await t.run(ctx => ctx.db.patch(check._id, { dueAt: Date.now() - 1 }));
      await t.action(internal.founderNotificationActions.checkPayment, { id: check._id });
    }
    expect(retrieve).toHaveBeenCalledTimes(4);
    expect((await t.run(ctx => ctx.db.get(check._id)))?.state).toBe("failed");
    expect((await rows(t)).filter(r => r.kind === "paid")).toHaveLength(0);
    await t.mutation(internal.founderNotifications.billing, { customerId: checkout.stripeCustomerId, subscriptionId: checkout.stripeSubscriptionId!, payment: { Invoice: "in_first", Amount: "1000", "Paid at": "1" } });
    await t.mutation(internal.founderNotifications.recordPaymentCheck, { customerId: checkout.stripeCustomerId, subscriptionId: checkout.stripeSubscriptionId!, invoiceId: "in_renewal", eventId: "evt_renewal" });
    const renewal = (await t.run(ctx => ctx.db.query("founderPaymentChecks").collect())).find(r => r.invoiceId === "in_renewal")!;
    await t.action(internal.founderNotificationActions.checkPayment, { id: renewal._id });
    expect(retrieve).toHaveBeenCalledTimes(4);
    expect((await t.run(ctx => ctx.db.get(renewal._id)))?.state).toBe("done");
  });
  it("counts partial discount cash but excludes free, credit-only and non-subscription invoices", async () => {
    const stripe = stripeMock([], { in_first: [cash()] });
    expect(await collectedSubscriptionPayment(stripe, { ...invoice(), discounts: ["di_half"] } as Stripe.Invoice)).toBe(1000);
    expect(await collectedSubscriptionPayment(stripe, invoice("in_first", 0))).toBe(0);
    expect(await collectedSubscriptionPayment(stripeMock([]), invoice())).toBe(0);
    expect(await collectedSubscriptionPayment(stripe, { ...invoice(), parent: { type: "quote_details" } } as unknown as Stripe.Invoice)).toBe(0);
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValueOnce({ status: "processing", amount_received: 1000 } as Stripe.PaymentIntent);
    expect(await collectedSubscriptionPayment(stripe, invoice())).toBe(0);
  });
  it("selects actual first collection despite out-of-order invoices and zero-dollar trials", async () => {
    const first = invoice(), renewal = invoice("in_renewal", 1000, 100);
    const stripe = stripeMock([renewal, first, invoice("in_free", 0, 0)], { in_first: [cash()], in_renewal: [cash()] });
    expect(await firstCompanyPayment(stripe, "cus_founder", renewal)).toMatchObject({ Invoice: "in_first", Amount: "1000" });
  });
  it("distinguishes active promotional access from a Stripe trial", () => {
    const sub = { created: 1, status: "active", items: { data: [{ price: { id: "price_test" } }] }, discounts: ["di_promo"], trial_end: null } as unknown as Stripe.Subscription;
    expect(founderAccess(sub, 1)).toMatchObject({ Status: "active", "Stripe discounts": "di_promo" });
    expect(founderAccess(sub, 1)).not.toHaveProperty("Trial end");
    expect(founderAccess({ ...sub, status: "trialing", trial_end: 100 }, 1)).toHaveProperty("Trial end");
  });
});

describe("assessment and giveaway independence", () => {
  it("ignores incomplete attempts and notifies completed assessments once without entering giveaway", async () => {
    const t = backend(), capability = "a".repeat(64);
    const attempt = await t.mutation(api.assessments.start, { capability, browserKey: "b".repeat(64), responseLanguage: "en", firstResponse: { questionKey: "business.team_size", answerValue: "solo" } });
    await expect(t.mutation(api.assessments.complete, { ...attempt, capability })).rejects.toThrow("required questions");
    expect(await rows(t)).toEqual([]);
    const answers: Record<string, string> = { "business.team_size": "solo" };
    for (const question of INITIAL_ASSESSMENT_DEFINITION.questions) {
      if (!question.required || question.key === "business.team_size" || !isApplicable(question, answers)) continue;
      const answerValue = question.options![0].value; answers[question.key] = answerValue;
      await t.mutation(api.assessments.saveResponse, { ...attempt, capability, responseLanguage: "en", response: { questionKey: question.key, answerValue } });
    }
    await t.mutation(api.assessments.complete, { ...attempt, capability });
    await t.mutation(api.assessments.complete, { ...attempt, capability });
    expect((await rows(t)).map(r => r.kind)).toEqual(["assessment"]);
    expect(JSON.stringify(await rows(t))).not.toMatch(/capability|answerValue|qualitative/);
  });
  it("notifies valid alternate entry once, without an assessment, and respects campaign closure", async () => {
    const campaign = giveawayCampaigns[firstGiveawayId], original = { ...campaign };
    Object.assign(campaign, { enabled: true, rulesApproved: true, startsAt: Date.now() - 1000, endsAt: Date.now() + 100000 });
    try {
      const t = backend();
      const entry = { campaignId: firstGiveawayId, browserKey: "d".repeat(64), firstName: "Pat", lastName: "Cleaner", email: "entrant@example.com", eligibilityConfirmed: true, rulesAcknowledged: true, marketingConsent: true };
      await t.mutation(api.giveaways.enterAlternate, entry); await t.mutation(api.giveaways.enterAlternate, entry);
      expect((await rows(t)).map(r => r.kind)).toEqual(["giveaway"]);
      expect((await rows(t))[0].details).toMatchObject({ Status: "qualified", Method: "alternate", "Marketing consent": "true" });
      campaign.endsAt = Date.now() - 1;
      await expect(t.mutation(api.giveaways.enterAlternate, { ...entry, email: "other@example.com" })).rejects.toThrow("not open");
      expect(await rows(t)).toHaveLength(1);
    } finally { Object.assign(campaign, original); }
  });
});
