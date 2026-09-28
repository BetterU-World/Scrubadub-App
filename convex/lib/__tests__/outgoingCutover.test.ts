import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashToken } from "../tokens";
import { LEGACY_OUTGOING_RETIRED } from "../legacyOutgoingRetirement";

const stripe = vi.hoisted(() => ({
  client: vi.fn(), create: vi.fn(), link: vi.fn(), retrieve: vi.fn(),
}));
vi.mock("../stripe", () => ({ getStripeClientOrNull: stripe.client }));
const modules = import.meta.glob("../../**/*.ts");

async function setup(role: "owner" | "manager" | "cleaner" | "maintenance" | "affiliate", referralCode?: string) {
  const t = convexTest(schema, modules);
  const userId = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Own company", timezone: "America/New_York" });
    return ctx.db.insert("users", { role, companyId, name: role, email: `${role}@cutover.test`, status: "active", passwordHash: "unused", referralCode });
  });
  const sessionToken = `cutover-${userId}`;
  await t.run(ctx => ctx.db.insert("authSessions", { principalType: "staff", userId, tokenHash: hashToken(sessionToken), version: 1, createdAt: Date.now(), lastUsedAt: Date.now(), expiresAt: Date.now() + 3600000, idleExpiresAt: Date.now() + 3600000 }));
  return { t, userId, sessionToken };
}

describe("PR F Connect cutover", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_PEPPER", "test-token-pepper");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_mocked");
    vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
    vi.stubEnv("APP_URL", "https://cutover.test");
    vi.clearAllMocks();
    stripe.create.mockResolvedValue({ id: "acct_affiliate_only" });
    stripe.link.mockResolvedValue({ url: "https://stripe.test/affiliate" });
    stripe.client.mockReturnValue({ accounts: { create: stripe.create, retrieve: stripe.retrieve }, accountLinks: { create: stripe.link } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["cleaner", "maintenance", "manager", "owner", "affiliate"] as const)("retires the generic onboarding and refresh endpoints for %s before Stripe or account writes", async role => {
    const s = await setup(role);
    const before = await s.t.run(ctx => ctx.db.get(s.userId));
    for (const endpoint of [api.actions.stripeConnect.startStripeConnectOnboarding, api.actions.stripeConnect.syncMyStripeConnectStatus])
      await expect(s.t.action(endpoint, { userId: s.userId, sessionToken: s.sessionToken })).rejects.toThrow(LEGACY_OUTGOING_RETIRED);
    expect(stripe.client).not.toHaveBeenCalled();
    expect(stripe.create).not.toHaveBeenCalled();
    expect(stripe.link).not.toHaveBeenCalled();
    expect(await s.t.run(ctx => ctx.db.get(s.userId))).toEqual(before);
  });

  it.each(["cleaner", "maintenance", "manager", "owner"] as const)("denies unrelated %s on both current affiliate creation/link endpoints with no side effects", async role => {
    const s = await setup(role, role === "cleaner" || role === "maintenance" ? "historical-referral" : undefined);
    const before = await s.t.run(ctx => ctx.db.get(s.userId));
    for (const endpoint of [api.actions.affiliateStripeConnect.getOrCreateAffiliateStripeAccount, api.actions.affiliateStripeConnect.createAffiliateStripeAccountLink])
      await expect(s.t.action(endpoint, { userId: s.userId, sessionToken: s.sessionToken })).rejects.toThrow(/Affiliate.*required/);
    expect(stripe.client).not.toHaveBeenCalled();
    expect(stripe.create).not.toHaveBeenCalled();
    expect(stripe.link).not.toHaveBeenCalled();
    expect(await s.t.run(ctx => ctx.db.get(s.userId))).toEqual(before);
  });

  it.each(["affiliate", "owner", "manager"] as const)("preserves current %s affiliate context without writing legacy worker fields", async role => {
    const s = await setup(role, role === "affiliate" ? undefined : "legitimate-personal-referral");
    await expect(s.t.action(api.actions.affiliateStripeConnect.getOrCreateAffiliateStripeAccount, { userId: s.userId, sessionToken: s.sessionToken })).resolves.toBe("acct_affiliate_only");
    await expect(s.t.action(api.actions.affiliateStripeConnect.createAffiliateStripeAccountLink, { userId: s.userId, sessionToken: s.sessionToken })).resolves.toEqual({ url: "https://stripe.test/affiliate" });
    expect(stripe.create).toHaveBeenCalledTimes(1);
    expect(stripe.link).toHaveBeenCalledTimes(1);
    const user = await s.t.run(ctx => ctx.db.get(s.userId));
    expect(user?.affiliateStripeAccountId).toBe("acct_affiliate_only");
    expect(user?.stripeConnectAccountId).toBeUndefined();
  });

  it("rejects missing, invalid, deactivated and mismatched sessions across the full user onboarding surface", async () => {
    const s = await setup("affiliate");
    const other = await s.t.run(ctx => ctx.db.insert("users", { role: "affiliate", name: "Other", email: "other@cutover.test", status: "active", passwordHash: "unused" }));
    const endpoints = [api.actions.stripeConnect.startStripeConnectOnboarding, api.actions.stripeConnect.syncMyStripeConnectStatus, api.actions.cleanerStripeConnect.createCleanerStripeAccountLink, api.actions.affiliateStripeConnect.getOrCreateAffiliateStripeAccount, api.actions.affiliateStripeConnect.createAffiliateStripeAccountLink];
    for (const endpoint of endpoints) {
      await expect(s.t.action(endpoint, { userId: s.userId, sessionToken: "" })).rejects.toThrow();
      await expect(s.t.action(endpoint, { userId: s.userId, sessionToken: "invalid" })).rejects.toThrow();
      await expect(s.t.action(endpoint, { userId: other, sessionToken: s.sessionToken })).rejects.toThrow();
    }
    await s.t.run(ctx => ctx.db.patch(s.userId, { status: "inactive" }));
    const before = await s.t.run(ctx => ctx.db.get(s.userId));
    for (const endpoint of endpoints)
      await expect(s.t.action(endpoint, { userId: s.userId, sessionToken: s.sessionToken })).rejects.toThrow();
    expect(stripe.client).not.toHaveBeenCalled();
    expect(await s.t.run(ctx => ctx.db.get(s.userId))).toEqual(before);
  });

  it("fail-closes internal legacy account setters/refresh without altering historical metadata", async () => {
    const s = await setup("cleaner");
    await s.t.run(ctx => ctx.db.patch(s.userId, { stripeConnectAccountId: "acct_historical", stripeConnectOnboardingStatus: "complete" }));
    const before = await s.t.run(ctx => ctx.db.get(s.userId));
    await expect(s.t.mutation(internal.mutations.stripeConnect.setStripeConnectAccount, { userId: s.userId, stripeConnectAccountId: "acct_new" })).rejects.toThrow(LEGACY_OUTGOING_RETIRED);
    await expect(s.t.mutation(internal.mutations.cleanerStripeConnect.setCleanerStripeConnectAccount, { userId: s.userId, stripeConnectAccountId: "acct_new" })).rejects.toThrow(LEGACY_OUTGOING_RETIRED);
    await expect(s.t.mutation(internal.mutations.stripeConnect.syncStripeConnectFields, { userId: s.userId, payoutsEnabled: true, detailsSubmitted: true, requirementsDue: "", onboardingStatus: "complete" })).rejects.toThrow(LEGACY_OUTGOING_RETIRED);
    expect(await s.t.run(ctx => ctx.db.get(s.userId))).toEqual(before);
  });

  it("keeps worker historical reads within the authenticated current company", async () => {
    const s = await setup("cleaner");
    const ownId = await s.t.run(async ctx => {
      const worker = (await ctx.db.get(s.userId))!;
      const foreign = await ctx.db.insert("companies", { name: "Foreign", timezone: "UTC" });
      const jobId = await ctx.db.insert("jobs", { companyId: worker.companyId!, cleanerIds: [s.userId], status: "approved", type: "standard", scheduledDate: "2026-01-01", durationMinutes: 60, reworkCount: 0 });
      const ownId = await ctx.db.insert("cleanerPayments", { companyId: worker.companyId!, jobId, cleanerUserId: s.userId, status: "OPEN", createdAt: 1 });
      await ctx.db.insert("cleanerPayments", { companyId: foreign, jobId, cleanerUserId: s.userId, status: "OPEN", createdAt: 2 });
      return ownId;
    });
    expect(await s.t.query(api.queries.cleanerPayments.listMyCleanerPayments, { userId: s.userId, sessionToken: s.sessionToken })).toEqual([expect.objectContaining({ _id: ownId })]);
  });

  it("refuses oversized legacy histories rather than returning a partial financial view", async () => {
    const s = await setup("owner");
    const worker = await s.t.run(async ctx => {
      const owner = (await ctx.db.get(s.userId))!;
      const workerId = await ctx.db.insert("users", { role: "cleaner", companyId: owner.companyId, name: "Maya", email: "maya@cutover.test", status: "active", passwordHash: "unused" });
      const token = "history-worker";
      await ctx.db.insert("authSessions", { principalType: "staff", userId: workerId, tokenHash: hashToken(token), version: 1, createdAt: Date.now(), lastUsedAt: Date.now(), expiresAt: Date.now() + 3600000, idleExpiresAt: Date.now() + 3600000 });
      const partner = await ctx.db.insert("companies", { name: "Partner", timezone: "UTC" });
      const jobId = await ctx.db.insert("jobs", { companyId: owner.companyId!, cleanerIds: [workerId], status: "approved", type: "standard", scheduledDate: "2026-01-01", durationMinutes: 60, reworkCount: 0 });
      const paymentId = await ctx.db.insert("cleanerPayments", { companyId: owner.companyId!, jobId, cleanerUserId: workerId, status: "OPEN", createdAt: 0 });
      const batchId = await ctx.db.insert("settlementBatches", { fromCompanyId: owner.companyId!, toCompanyId: partner, totalAmountCents: 501, currency: "usd", status: "OPEN", createdAt: 0 });
      for (let i = 0; i < 501; i++) {
        await ctx.db.insert("cleanerPayments", { companyId: owner.companyId!, jobId, cleanerUserId: workerId, status: "OPEN", createdAt: i });
        const settlementId = await ctx.db.insert("companySettlements", { fromCompanyId: owner.companyId!, toCompanyId: partner, originalJobId: jobId, amountCents: 1, currency: "usd", status: "open", createdAt: i, updatedAt: i });
        await ctx.db.insert("cleanerPaymentJobs", { cleanerPaymentId: paymentId, jobId });
        await ctx.db.insert("settlementBatchItems", { batchId, settlementId });
      }
      return { userId: workerId, sessionToken: token, paymentId, batchId, jobId };
    });
    const owner = { userId: s.userId, sessionToken: s.sessionToken };
    await expect(s.t.query(api.queries.cleanerPayments.listCleanerPaymentsForCompany, owner)).rejects.toThrow("history is too large");
    await expect(s.t.query(api.queries.cleanerPayments.listMyCleanerPayments, { userId: worker.userId, sessionToken: worker.sessionToken })).rejects.toThrow("history is too large");
    await expect(s.t.query(api.queries.settlements.listMySettlements, { ...owner, status: "open" })).rejects.toThrow("history is too large");
    await expect(s.t.mutation(internal.mutations.cleanerPayments.markCleanerPaidViaStripe, { cleanerPaymentId: worker.paymentId, stripeCheckoutSessionId: "historical-evidence" })).rejects.toThrow("reconciliation required");
    await expect(s.t.mutation(internal.mutations.settlements.markSettlementBatchPaidViaStripe, { batchId: worker.batchId, stripeCheckoutSessionId: "historical-evidence" })).rejects.toThrow("reconciliation required");
    expect(await s.t.run(ctx => ctx.db.get(worker.paymentId))).toMatchObject({ status: "OPEN" });
    expect(await s.t.run(ctx => ctx.db.get(worker.batchId))).toMatchObject({ status: "OPEN" });
    expect((await s.t.run(ctx => ctx.db.get(worker.jobId)))?.cleanerPaymentId).toBeUndefined();
  });
});
