import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const makeTest = () => convexTest(schema, modules);
const checkoutApi = (internal as any).authInternal.provisionPublicCheckout;
const billingApi = (internal as any).mutations.billing;

async function checkoutArgs(overrides: Record<string, unknown> = {}) {
  return {
    stripeCheckoutSessionId: "cs_pr3_1",
    stripeCustomerId: "cus_pr3_1",
    stripeSubscriptionId: "sub_pr3_1",
    stripePriceId: "price_pr3_1",
    subscriptionStatus: "trialing",
    currentPeriodEnd: 2_000_000_000,
    cancelAtPeriodEnd: false,
    tier: "scrub_team" as const,
    email: "owner@pr3.test",
    passwordHash: await hashPassword("test-password-123"),
    name: "PR3 Owner",
    companyName: "PR3 Cleaning",
    timezone: "America/New_York",
    ...overrides,
  };
}

describe("Security Hardening V1 PR 3", () => {
  it("provisions company, default site, owner, subscription, and completion exactly once", async () => {
    const t = makeTest();
    const args = await checkoutArgs();

    const first = await t.mutation(checkoutApi, args);
    const replay = await t.mutation(checkoutApi, {
      ...args,
      passwordHash: await hashPassword("test-password-123"),
    });

    expect(first).toMatchObject({ alreadyCompleted: false });
    expect(replay).toMatchObject({
      alreadyCompleted: true,
      userId: first.userId,
      companyId: first.companyId,
    });
    const state = await t.run(async (ctx) => ({
      companies: await ctx.db.query("companies").collect(),
      owners: await ctx.db.query("users").collect(),
      sites: await ctx.db.query("companySites").collect(),
      completions: await ctx.db.query("checkoutProvisioning").collect(),
    }));
    expect(state.companies).toHaveLength(1);
    expect(state.owners).toHaveLength(1);
    expect(state.sites).toHaveLength(1);
    expect(state.completions).toHaveLength(1);
    expect(state.companies[0]).toMatchObject({
      stripeCustomerId: "cus_pr3_1",
      stripeSubscriptionId: "sub_pr3_1",
      subscriptionStatus: "trialing",
      tier: "scrub_team",
    });
  });

  it("serializes concurrent completion attempts on the Checkout Session key", async () => {
    const t = makeTest();
    const args = await checkoutArgs({
      stripeCheckoutSessionId: "cs_concurrent",
      stripeCustomerId: "cus_concurrent",
    });
    const [one, two] = await Promise.all([
      t.mutation(checkoutApi, args),
      t.mutation(checkoutApi, args),
    ]);
    expect([one.alreadyCompleted, two.alreadyCompleted].sort()).toEqual([false, true]);
    const counts = await t.run(async (ctx) => ({
      companies: (await ctx.db.query("companies").collect()).length,
      owners: (await ctx.db.query("users").collect()).length,
      sites: (await ctx.db.query("companySites").collect()).length,
      completions: (await ctx.db.query("checkoutProvisioning").collect()).length,
    }));
    expect(counts).toEqual({ companies: 1, owners: 1, sites: 1, completions: 1 });
  });

  it("recovers a pre-hardening partial company without duplicating it", async () => {
    const t = makeTest();
    const companyId = await t.run((ctx) => ctx.db.insert("companies", {
      name: "Partial Cleaning",
      timezone: "America/New_York",
      stripeCustomerId: "cus_partial",
    }));
    const result = await t.mutation(checkoutApi, await checkoutArgs({
      stripeCheckoutSessionId: "cs_partial",
      stripeCustomerId: "cus_partial",
      stripeSubscriptionId: "sub_partial",
      email: "partial@pr3.test",
    }));
    expect(result.companyId).toBe(companyId);
    const state = await t.run(async (ctx) => ({
      companies: await ctx.db.query("companies").collect(),
      owners: await ctx.db.query("users").collect(),
      sites: await ctx.db.query("companySites").collect(),
      completions: await ctx.db.query("checkoutProvisioning").collect(),
    }));
    expect(state.companies).toHaveLength(1);
    expect(state.owners).toHaveLength(1);
    expect(state.sites).toHaveLength(1);
    expect(state.completions).toHaveLength(1);
  });

  it("deduplicates completed webhook events and retries failed or stale attempts", async () => {
    const t = makeTest();
    expect(await t.mutation(billingApi.beginStripeWebhookEvent, {
      stripeEventId: "evt_1", eventType: "invoice.paid", now: 1_000,
    })).toBe("started");
    expect(await t.mutation(billingApi.beginStripeWebhookEvent, {
      stripeEventId: "evt_1", eventType: "invoice.paid", now: 1_001,
    })).toBe("processing");
    await t.mutation(billingApi.failStripeWebhookEvent, {
      stripeEventId: "evt_1", now: 1_002,
    });
    expect(await t.mutation(billingApi.beginStripeWebhookEvent, {
      stripeEventId: "evt_1", eventType: "invoice.paid", now: 1_003,
    })).toBe("started");
    await t.mutation(billingApi.completeStripeWebhookEvent, {
      stripeEventId: "evt_1", now: 1_004,
    });
    expect(await t.mutation(billingApi.beginStripeWebhookEvent, {
      stripeEventId: "evt_1", eventType: "invoice.paid", now: 99_999_999,
    })).toBe("completed");
    const rows = await t.run((ctx) => ctx.db.query("stripeWebhookEvents").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "completed", attempts: 2 });
  });

  it("prevents older subscription events from overwriting newer lifecycle state", async () => {
    const t = makeTest();
    const companyId = await t.run((ctx) => ctx.db.insert("companies", {
      name: "Ordered",
      timezone: "America/New_York",
      stripeCustomerId: "cus_ordered",
    }));
    await t.mutation(billingApi.syncSubscription, {
      stripeCustomerId: "cus_ordered", stripeSubscriptionId: "sub_ordered",
      stripePriceId: "unknown", status: "active", currentPeriodEnd: 200,
      cancelAtPeriodEnd: false, eventCreated: 200,
    });
    await t.mutation(billingApi.syncSubscription, {
      stripeCustomerId: "cus_ordered", stripeSubscriptionId: "sub_ordered",
      stripePriceId: "unknown", status: "past_due", currentPeriodEnd: 100,
      cancelAtPeriodEnd: true, eventCreated: 100,
    });
    expect(await t.run((ctx) => ctx.db.get(companyId))).toMatchObject({
      subscriptionStatus: "active",
      currentPeriodEnd: 200,
      cancelAtPeriodEnd: false,
      stripeSubscriptionEventCreatedAt: 200,
    });
  });

  it("keeps signature verification and makes failed verified events retryable", () => {
    const root = process.cwd();
    const action = readFileSync(`${root}/convex/actions/publicBilling.ts`, "utf8");
    const webhook = readFileSync(`${root}/convex/http.ts`, "utf8");
    const setup = readFileSync(
      `${root}/packages/frontend/src/pages/public/PostCheckoutSetupPage.tsx`,
      "utf8"
    );
    const checkout = readFileSync(
      `${root}/packages/frontend/src/pages/public/GetStartedPage.tsx`,
      "utf8"
    );
    expect(action).toContain('session.metadata?.source !== "public_checkout"');
    expect(action).toContain("provisionPublicCheckout");
    expect(action).not.toContain("internal.authInternal.createCompany");
    expect(action).not.toContain("internal.authInternal.createUser");
    expect(action).toContain("idempotencyKey: `public-checkout:${checkoutAttemptId}:customer`");
    expect(action).toContain("idempotencyKey: `public-checkout:${checkoutAttemptId}:session`");
    expect(webhook).toContain("constructEventAsync");
    expect(webhook).toContain("beginStripeWebhookEvent");
    expect(webhook).toContain('status: 500');
    expect(setup).toContain("disabled={loading}");
    expect(setup).toContain("stripeSessionId: sessionId");
    expect(checkout).toContain("checkoutAttemptId: checkoutAttempt.current.id");
  });
});
