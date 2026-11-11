import { afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { subscriptionDisclosure, SUBSCRIPTION_TERMS_VERSION } from "../subscriptionDisclosure";

const modules = import.meta.glob("../../**/*.ts");
const price = { active: true, type: "recurring", recurring: { interval: "month", interval_count: 1 },
  billing_scheme: "per_unit", unit_amount: 6499, currency: "usd" } as Stripe.Price;
afterEach(() => vi.unstubAllEnvs());

describe("hosted recurring-billing consent", () => {
  it("uses Stripe's actual price and required checkbox without inventing a billing date", () => {
    const result = subscriptionDisclosure({ ...price, unit_amount: 6899 }, "team", "https://example.test");
    expect(result.consent_collection.terms_of_service).toBe("required");
    expect(result.custom_text.submit.message).toContain("$68.99 USD");
    expect(result.custom_text.submit.message).toContain("14-day free trial");
    expect(result.custom_text.submit.message).toContain("Settings > Billing > Manage Billing");
    expect(result.custom_text.submit.message).not.toMatch(/2026|2027/);
    expect(result.custom_text.terms_of_service_acceptance.message).toContain("automatically renews monthly");
    expect(result.custom_text.submit.message.length).toBeLessThanOrEqual(1200);
    expect(result.custom_text.terms_of_service_acceptance.message.length).toBeLessThanOrEqual(1200);
  });
  it.each([
    { active: false }, { unit_amount: null }, { currency: "eur" },
    { recurring: { interval: "year", interval_count: 1 } }, { billing_scheme: "tiered" },
  ])("rejects a price that would make monthly disclosures inaccurate: %j", override => {
    expect(() => subscriptionDisclosure({ ...price, ...override } as Stripe.Price, "team", "https://example.test")).toThrow();
  });
  it("retains signed completion evidence once and ignores connected-account events", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_consent");
    vi.stubEnv("STRIPE_WEBHOOK_ACCOUNT_SECRET", "whsec_consent");
    vi.stubEnv("STRIPE_WEBHOOK_CONNECT_SECRET", "");
    const t = convexTest(schema, modules);
    const disclosure = subscriptionDisclosure(price, "team", "https://example.test");
    const object = { id: "cs_consent", mode: "subscription", status: "complete", customer: "cus_consent",
      subscription: "sub_consent", consent: { terms_of_service: "accepted" },
      metadata: { subscriptionTermsVersion: SUBSCRIPTION_TERMS_VERSION }, custom_text: disclosure.custom_text };
    async function send(id: string, changes = {}, account?: string) {
      const payload = JSON.stringify({ id, object: "event", type: "checkout.session.completed", created: 1800000000,
        ...(account ? { account } : {}), data: { object: { ...object, ...changes } } });
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_consent" });
      return t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload });
    }
    expect((await send("evt_connected", {}, "acct_other")).status).toBe(200);
    expect(await t.run(ctx => ctx.db.query("subscriptionCheckoutConsents").collect())).toHaveLength(0);
    expect((await send("evt_missing", { consent: { terms_of_service: null } })).status).toBe(500);
    expect((await send("evt_accepted")).status).toBe(200);
    expect((await send("evt_duplicate")).status).toBe(200);
    expect(await t.run(ctx => ctx.db.query("subscriptionCheckoutConsents").collect())).toMatchObject([
      { stripeCheckoutSessionId: "cs_consent", stripeSubscriptionId: "sub_consent", termsVersion: SUBSCRIPTION_TERMS_VERSION,
        completedEventAt: 1800000000000, disclosure: disclosure.custom_text.submit.message },
    ]);
    // Historical Checkout sessions did not collect the new consent; do not invent evidence or break fulfillment.
    expect((await send("evt_legacy", { id: "cs_legacy", metadata: {}, consent: null })).status).toBe(200);
    expect(await t.run(ctx => ctx.db.query("subscriptionCheckoutConsents").collect())).toHaveLength(1);
  });
});
