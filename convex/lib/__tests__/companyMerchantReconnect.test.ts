import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";

const mocks = vi.hoisted(() => ({ create: vi.fn(), checkout: vi.fn(), link: vi.fn(), readiness: vi.fn(), retrieve: vi.fn(), expire: vi.fn() }));
vi.mock("../companyStripeMerchant", async importOriginal => {
  const original = await importOriginal<typeof import("../companyStripeMerchant")>();
  return { ...original, getCompanyMerchantClient: () => ({ v2: { core: { accounts: { create: mocks.create }, accountLinks: { create: mocks.link } } } }), retrieveCompanyMerchantReadiness: mocks.readiness };
});
vi.mock("../stripe", () => ({ getStripeClientOrNull: () => ({ checkout: { sessions: { create: mocks.checkout, retrieve: mocks.retrieve, expire: mocks.expire } } }) }));
const modules = import.meta.glob("../../**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword("password-123-test");
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Migration", timezone: "America/New_York", stripeConnectAccountId: "acct_legacy" });
    const ownerId = await ctx.db.insert("users", { name: "Owner", email: "migration@test.dev", passwordHash, role: "owner", status: "active", companyId });
    const managerId = await ctx.db.insert("users", { name: "Manager", email: "manager@test.dev", passwordHash, role: "manager", status: "active", companyId });
    const staffId = await ctx.db.insert("users", { name: "Staff", email: "staff@test.dev", passwordHash, role: "cleaner", status: "active", companyId });
    return { companyId, ownerId, managerId, staffId };
  });
  const auth = await t.action(api.authActions.signIn, { email: "migration@test.dev", password: "password-123-test" });
  return { t, ...ids, ownerArgs: { userId: ids.ownerId, sessionToken: auth.sessionToken } };
}
async function readyPending(s: Awaited<ReturnType<typeof setup>>) {
  await s.t.action(api.actions.companyStripeConnect.createCompanyStripeAccountLink, s.ownerArgs);
  const company = (await s.t.run(ctx => ctx.db.get(s.companyId)))!;
  mocks.readiness.mockResolvedValue({ account: { id: "acct_modern", metadata: { convexCompanyId: String(s.companyId), scrubOnboardingFlowId: String(company.stripeConnectFlowId) } }, ready: true, snapshot: { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, requirementsDue: false, modernReady: true } });
  return company;
}
async function legacyAttempt(s: Awaited<ReturnType<typeof setup>>) {
  return s.t.run(async ctx => {
    const client = await ctx.db.insert("clientUsers", { email: "old@test.dev", displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const relationship = await ctx.db.insert("clientRelationships", { companyId: s.companyId, clientUserId: client, displayName: "Client", clientType: "commercial", status: "active", createdAt: 1, updatedAt: 1 });
    const commercial = await ctx.db.insert("commercialAccounts", { companyId: s.companyId, clientRelationshipId: relationship, clientName: "Client", contractAmountCents: 50000, status: "active", createdAt: 1, updatedAt: 1 });
    const invoice = await ctx.db.insert("invoices", { companyId: s.companyId, clientRelationshipId: relationship, commercialAccountId: commercial, invoiceType: "commercial", title: "Cleaning", invoiceNumber: "INV-old", status: "issued", billingStartDate: "2030-01-01", billingEndDate: "2030-01-31", issueDate: "2030-02-01", dueDate: "2030-03-01", subtotalCents: 50000, totalCents: 50000, taxCents: 0, jobIds: [], createdAt: 1, updatedAt: 1 });
    return await ctx.db.insert("invoicePaymentAttempts", { companyId: s.companyId, invoiceId: invoice, invoiceType: "commercial", clientRelationshipId: relationship, amountCents: 50000, currency: "usd", destinationStripeAccountId: "acct_legacy", platformFeeCents: 200, status: "open", stripeCheckoutSessionId: "cs_old", createdAt: 1, updatedAt: 1 });
  });
}
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://scrub.test"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_mock");
  mocks.create.mockReset().mockResolvedValue({ id: "acct_modern" }); mocks.link.mockReset().mockResolvedValue({ url: "https://connect.stripe.test/onboard" });
  mocks.readiness.mockReset().mockResolvedValue({ ready: false }); mocks.retrieve.mockReset().mockResolvedValue({ status: "open" }); mocks.expire.mockReset().mockResolvedValue({ status: "expired" });
  mocks.checkout.mockReset().mockResolvedValue({ id: "cs_new", url: "https://checkout.stripe.test/new" });
  vi.stubEnv("SCRUB_ENABLE_LIVE_INVOICE_PAYMENTS", ""); vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("controlled owner Merchant reconnect", () => {
  it("checks live readiness before Checkout despite cached Ready, reuses direct Sessions, and gates live keys", async () => {
    const s = await setup(); await readyPending(s); await s.t.action(api.actions.companyStripeConnect.refreshCompanyStripeConnectStatus, s.ownerArgs);
    const oldId = await legacyAttempt(s);
    const old = (await s.t.run(ctx => ctx.db.get(oldId)))!;
    const clientId = (await s.t.run(ctx => ctx.db.get(old.clientRelationshipId)))!.clientUserId!;
    await s.t.run(async ctx => { await ctx.db.patch(clientId, { passwordHash: await hashPassword("client-password-test") }); await ctx.db.patch(oldId, { status: "expired" }); });
    const auth = await s.t.action(api.clientAuthActions.signIn, { email: "old@test.dev", password: "client-password-test" });
    const args = { clientUserId: clientId, sessionToken: auth.sessionToken, invoiceId: old.invoiceId };
    mocks.readiness.mockResolvedValue({ account: { id: "acct_modern" }, ready: false, snapshot: { chargesEnabled: false, payoutsEnabled: true, detailsSubmitted: true, requirementsDue: false, modernReady: false } });
    await expect(s.t.action(api.invoiceActions.createInvoiceCheckout, args)).rejects.toThrow("cannot accept online payments");
    expect(mocks.checkout).not.toHaveBeenCalled();
    mocks.readiness.mockResolvedValue({ account: { id: "acct_modern" }, ready: true, snapshot: { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, requirementsDue: false, modernReady: true } });
    await s.t.action(api.invoiceActions.createInvoiceCheckout, args);
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ payment_intent_data: expect.objectContaining({ application_fee_amount: 200 }) }), expect.objectContaining({ stripeAccount: "acct_modern" }));
    expect(mocks.checkout.mock.calls[0][0].payment_intent_data).not.toHaveProperty("transfer_data");
    mocks.retrieve.mockResolvedValue({ status: "open", url: "https://checkout.stripe.test/new" });
    await s.t.action(api.invoiceActions.createInvoiceCheckout, args);
    expect(mocks.checkout).toHaveBeenCalledTimes(1); expect(mocks.retrieve).toHaveBeenCalledWith("cs_new", {}, { stripeAccount: "acct_modern" });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_mock"); mocks.readiness.mockClear();
    await expect(s.t.action(api.invoiceActions.createInvoiceCheckout, args)).rejects.toThrow("not enabled");
    expect(mocks.readiness).not.toHaveBeenCalled();
  });
  it("keeps the old account active during idempotent hosted onboarding, then atomically activates and audits", async () => {
    const s = await setup(); const pending = await readyPending(s);
    await s.t.action(api.actions.companyStripeConnect.createCompanyStripeAccountLink, s.ownerArgs);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(pending.stripeConnectAccountId).toBe("acct_legacy"); expect(pending.stripeConnectPendingAccountId).toBe("acct_modern");
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({ account: "acct_modern", use_case: { type: "account_onboarding", account_onboarding: { configurations: ["merchant"], refresh_url: "https://scrub.test/owner/settings/billing?stripe=refresh", return_url: "https://scrub.test/owner/settings/billing?stripe=return" } } }));
    await s.t.action(api.actions.companyStripeConnect.refreshCompanyStripeConnectStatus, s.ownerArgs);
    const company = await s.t.run(ctx => ctx.db.get(s.companyId));
    expect(company).toMatchObject({ stripeConnectAccountId: "acct_modern", stripeConnectArchitecture: "merchant_direct_v2", stripeConnectModernReady: true });
    expect(company?.stripeConnectPendingAccountId).toBeUndefined();
    expect(await s.t.run(ctx => ctx.db.query("companyConnectFlows").collect())).toMatchObject([{ previousAccountId: "acct_legacy", accountId: "acct_modern", ownerId: s.ownerId, status: "active" }]);
  });
  it("expires old platform Sessions before activation and preserves frozen history", async () => {
    const s = await setup(); const id = await legacyAttempt(s); await readyPending(s);
    await s.t.action(api.actions.companyStripeConnect.refreshCompanyStripeConnectStatus, s.ownerArgs);
    expect(mocks.retrieve).toHaveBeenCalledWith("cs_old", {}, {}); expect(mocks.expire).toHaveBeenCalledWith("cs_old", {}, {});
    expect(await s.t.run(ctx => ctx.db.get(id))).toMatchObject({ status: "expired", destinationStripeAccountId: "acct_legacy" });
  });
  it.each(["completed", "uncertain", "creating"])("blocks activation with %s old payment evidence", async condition => {
    const s = await setup(); const id = await legacyAttempt(s); await readyPending(s);
    if (condition === "completed") mocks.retrieve.mockResolvedValue({ status: "complete" });
    if (condition === "uncertain") mocks.expire.mockRejectedValue(new Error("network error"));
    if (condition === "creating") await s.t.run(ctx => ctx.db.patch(id, { status: "creating", stripeCheckoutSessionId: undefined }));
    await expect(s.t.action(api.actions.companyStripeConnect.refreshCompanyStripeConnectStatus, s.ownerArgs)).rejects.toThrow();
    expect((await s.t.run(ctx => ctx.db.get(s.companyId)))?.stripeConnectAccountId).toBe("acct_legacy");
  });
  it("does not treat return or stale cached readiness as proof of completion", async () => {
    const s = await setup(); await readyPending(s); mocks.readiness.mockResolvedValue({ ready: false });
    await s.t.action(api.actions.companyStripeConnect.refreshCompanyStripeConnectStatus, s.ownerArgs);
    expect((await s.t.run(ctx => ctx.db.get(s.companyId)))?.stripeConnectAccountId).toBe("acct_legacy");
  });
  it("rejects account/flow metadata mismatch and arbitrary activation", async () => {
    const s = await setup(); const pending = await readyPending(s); mocks.readiness.mockResolvedValue({ ready: true, account: { metadata: { convexCompanyId: "other" } } });
    await expect(s.t.action(api.actions.companyStripeConnect.refreshCompanyStripeConnectStatus, s.ownerArgs)).rejects.toThrow("identity mismatch");
    await expect(s.t.mutation(internal.mutations.companyStripeConnect.activateCompanyMerchant, { companyId: s.companyId, ownerId: s.ownerId, flowId: pending.stripeConnectFlowId!, accountId: "acct_arbitrary", observedAt: Date.now() })).rejects.toThrow("identity changed");
  });
  it.each(["manager", "staff"])("denies %s reconnect and internal account swapping", async role => {
    const s = await setup(); const auth = await s.t.action(api.authActions.signIn, { email: role === "manager" ? "manager@test.dev" : "staff@test.dev", password: "password-123-test" });
    const userId = role === "manager" ? s.managerId : s.staffId;
    await expect(s.t.action(api.actions.companyStripeConnect.createCompanyStripeAccountLink, { userId, sessionToken: auth.sessionToken })).rejects.toThrow();
    await expect(s.t.mutation(internal.mutations.companyStripeConnect.reserveCompanyConnectFlow, { companyId: s.companyId, ownerId: userId })).rejects.toThrow("Owner access");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
