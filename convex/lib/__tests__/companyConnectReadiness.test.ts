import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";
import Stripe from "stripe";
import { canAcceptClientInvoicePayments, companyConnectState, snapshotFromStripeAccount } from "../companyConnectReadiness";

const modules = import.meta.glob("../../**/*.ts");
const now = Date.now();

describe("company Connect readiness", () => {
  it("requires both charge and payout capability", () => {
    expect(companyConnectState({}, now)).toBe("set_up");
    expect(companyConnectState({ stripeConnectAccountId: "acct_1" }, now)).toBe("checking");
    for (const [charges, payouts] of [[false, false], [true, false], [false, true]] as const) {
      const value = { stripeConnectAccountId: "acct_1", stripeConnectChargesEnabled: charges, stripeConnectPayoutsEnabled: payouts, stripeConnectLastSyncAt: now };
      expect(canAcceptClientInvoicePayments(value)).toBe(false);
      expect(companyConnectState(value, now)).toBe("continue_verification");
    }
    const ready = { stripeConnectAccountId: "acct_1", stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true, stripeConnectLastSyncAt: now };
    expect(canAcceptClientInvoicePayments(ready)).toBe(true);
    expect(companyConnectState(ready, now)).toBe("ready");
    expect(companyConnectState(ready, now + 25 * 60 * 60 * 1000)).toBe("checking");
    expect(companyConnectState({ ...ready, stripeConnectPayoutsEnabled: false, stripeConnectRequirementsDue: true }, now)).toBe("action_needed");
    expect(companyConnectState({ ...ready, stripeConnectChargesEnabled: false, stripeConnectDisabledReason: "requirements.past_due" }, now)).toBe("action_needed");
  });

  it("normalizes Stripe's capability and requirement fields", () => {
    expect(snapshotFromStripeAccount({ charges_enabled: true, payouts_enabled: false, details_submitted: true, requirements: { currently_due: ["business_profile.url"] } })).toEqual({
      chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true, requirementsDue: true, disabledReason: undefined,
    });
  });

  it("updates only the exact company account and ignores older observations", async () => {
    const t = convexTest(schema, modules);
    const [companyA, companyB] = await t.run(async ctx => [
      await ctx.db.insert("companies", { name: "A", timezone: "America/New_York", stripeConnectAccountId: "acct_a" }),
      await ctx.db.insert("companies", { name: "B", timezone: "America/New_York", stripeConnectAccountId: "acct_b" }),
    ]);
    const sync = internal.mutations.companyStripeConnect.syncCompanyStripeConnectStatus;
    const args = { stripeConnectAccountId: "acct_a", observedAt: 2000, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, requirementsDue: false };
    expect(await t.mutation(sync, args)).toBe(true);
    expect(await t.mutation(sync, { ...args, observedAt: 1000, chargesEnabled: false })).toBe(false);
    expect(await t.mutation(sync, { ...args, stripeConnectAccountId: "acct_worker" })).toBe(false);
    const [a, b] = await t.run(async ctx => [await ctx.db.get(companyA), await ctx.db.get(companyB)]);
    expect(a?.stripeConnectChargesEnabled).toBe(true);
    expect(a?.stripeConnectPayoutsEnabled).toBe(true);
    expect(b?.stripeConnectChargesEnabled).toBeUndefined();
  });

  it("refresh requires the owner session and does not create an account", async () => {
    process.env.TOKEN_PEPPER = "company-connect-test-pepper";
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword("test-password-123");
    const [companyId, ownerId, otherOwnerId] = await t.run(async ctx => {
      const company = await ctx.db.insert("companies", { name: "A", timezone: "America/New_York" });
      const other = await ctx.db.insert("companies", { name: "B", timezone: "America/New_York" });
      const owner = await ctx.db.insert("users", { name: "Owner", email: "connect-owner@test.dev", passwordHash, companyId: company, role: "owner", status: "active" });
      const otherOwner = await ctx.db.insert("users", { name: "Other", email: "connect-other@test.dev", passwordHash, companyId: other, role: "owner", status: "active" });
      return [company, owner, otherOwner];
    });
    const auth = await t.action(api.authActions.signIn, { email: "connect-owner@test.dev", password: "test-password-123" });
    await expect(t.action(api.actions.companyStripeConnect.refreshCompanyStripeConnectStatus, { userId: otherOwnerId, sessionToken: auth.sessionToken })).rejects.toThrow("does not match");
    expect(await t.action(api.actions.companyStripeConnect.refreshCompanyStripeConnectStatus, { userId: ownerId, sessionToken: auth.sessionToken })).toEqual({ refreshed: false });
    expect((await t.run(async ctx => ctx.db.get(companyId)))?.stripeConnectAccountId).toBeUndefined();
  });

  it("routes signed account.updated only to its company", async () => {
    process.env.APP_URL = "https://scrub.example";
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.STRIPE_WEBHOOK_CONNECT_SECRET = "whsec_company_test";
    const t = convexTest(schema, modules);
    const [companyA, companyB] = await t.run(async ctx => [
      await ctx.db.insert("companies", { name: "A", timezone: "America/New_York", stripeConnectAccountId: "acct_a" }),
      await ctx.db.insert("companies", { name: "B", timezone: "America/New_York", stripeConnectAccountId: "acct_b" }),
    ]);
    const event = { id: "evt_company_a", object: "event", type: "account.updated", created: Math.floor(Date.now() / 1000), data: { object: { id: "acct_a", object: "account", charges_enabled: true, payouts_enabled: false, details_submitted: true, requirements: { currently_due: ["external_account"] } } } };
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_CONNECT_SECRET });
    const response = await t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload });
    expect(response.status).toBe(200);
    const [a, b] = await t.run(async ctx => [await ctx.db.get(companyA), await ctx.db.get(companyB)]);
    expect(a?.stripeConnectChargesEnabled).toBe(true);
    expect(a?.stripeConnectPayoutsEnabled).toBe(false);
    expect(b?.stripeConnectChargesEnabled).toBeUndefined();
  });
});
