import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const makeTest = () => convexTest(schema, modules);

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword(PASSWORD);
  return t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "B", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { email: "owner@pr4.test", passwordHash, name: "Owner", companyId: companyA, role: "owner", status: "active" });
    const cleaner = await ctx.db.insert("users", { email: "cleaner@pr4.test", passwordHash, name: "Cleaner", companyId: companyA, role: "cleaner", status: "active" });
    const other = await ctx.db.insert("users", { email: "other@pr4.test", passwordHash, name: "Other", companyId: companyA, role: "cleaner", status: "active" });
    const maintenance = await ctx.db.insert("users", { email: "maintenance@pr4.test", passwordHash, name: "Maintenance", companyId: companyA, role: "maintenance", status: "active" });
    const crossCompany = await ctx.db.insert("users", { email: "cross@pr4.test", passwordHash, name: "Cross", companyId: companyB, role: "cleaner", status: "active" });
    const affiliate = await ctx.db.insert("users", { email: "affiliate@pr4.test", passwordHash, name: "Affiliate", role: "affiliate", status: "active", referralCode: "affiliate1" });
    const otherAffiliate = await ctx.db.insert("users", { email: "affiliate2@pr4.test", passwordHash, name: "Affiliate 2", role: "affiliate", status: "active", referralCode: "affiliate2" });
    const inactive = await ctx.db.insert("users", { email: "inactive@pr4.test", passwordHash, name: "Inactive", companyId: companyA, role: "cleaner", status: "inactive" });
    for (const userId of [cleaner, maintenance]) {
      await ctx.db.insert("workerProfiles", { companyId: companyA, userId, workerType: "contractor_1099", workerStatus: "active", primaryRole: "cleaner", eligibleRoles: ["cleaner"], onboardingStatus: "in_progress", jobEligibilityStatus: "eligible", createdAt: Date.now(), updatedAt: Date.now() });
    }
    const inactiveProfile = await ctx.db.insert("workerProfiles", { companyId: companyA, userId: other, workerType: "contractor_1099", workerStatus: "inactive", primaryRole: "cleaner", eligibleRoles: ["cleaner"], onboardingStatus: "in_progress", jobEligibilityStatus: "ineligible", createdAt: Date.now(), updatedAt: Date.now() });
    const onboardingItem = await ctx.db.insert("workerOnboardingItems", { companyId: companyA, workerProfileId: inactiveProfile, userId: other, itemKey: "policy", title: "Policy", status: "not_started", required: true, createdAt: Date.now(), updatedAt: Date.now() });
    const propertyA = await ctx.db.insert("properties", { companyId: companyA, name: "A", type: "residential", address: "1 Main", amenities: [], active: true });
    const propertyB = await ctx.db.insert("properties", { companyId: companyB, name: "B", type: "residential", address: "2 Main", amenities: [], active: true });
    const job = await ctx.db.insert("jobs", { companyId: companyA, propertyId: propertyA, cleanerIds: [cleaner], type: "standard", status: "scheduled", scheduledDate: "2026-07-12", durationMinutes: 60, reworkCount: 0 });
    const maintenanceJob = await ctx.db.insert("jobs", { companyId: companyA, propertyId: propertyA, cleanerIds: [maintenance], type: "maintenance", status: "scheduled", scheduledDate: "2026-07-12", durationMinutes: 60, reworkCount: 0 });
    const foreignJob = await ctx.db.insert("jobs", { companyId: companyB, propertyId: propertyB, cleanerIds: [crossCompany], type: "standard", status: "scheduled", scheduledDate: "2026-07-12", durationMinutes: 60, reworkCount: 0 });
    await ctx.db.insert("affiliateLedger", { referrerUserId: affiliate, periodType: "monthly", periodStart: 1, periodEnd: 2, attributedRevenueCents: 1000, commissionRate: .1, commissionCents: 100, status: "open", createdAt: Date.now() });
    return { companyA, companyB, owner, cleaner, other, maintenance, affiliate, otherAffiliate, inactive, job, maintenanceJob, foreignJob, onboardingItem };
  });
}

const login = (t: ReturnType<typeof convexTest>, email: string) => t.action(api.authActions.signIn, { email, password: PASSWORD });

describe("worker and affiliate session migration", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("allows assigned cleaner and maintenance workflows but rejects other workers", async () => {
    const t = makeTest(); const s = await seed(t);
    const cleaner = await login(t, "cleaner@pr4.test");
    await expect(t.query(api.queries.jobs.getForCleaner, { companyId: s.companyA, cleanerId: s.cleaner, userId: s.cleaner, sessionToken: cleaner.sessionToken })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.jobs.get, { jobId: s.maintenanceJob, userId: s.cleaner, sessionToken: cleaner.sessionToken })).resolves.toBeNull();
    const maintenance = await login(t, "maintenance@pr4.test");
    await expect(t.query(api.queries.jobs.get, { jobId: s.maintenanceJob, userId: s.maintenance, sessionToken: maintenance.sessionToken })).resolves.toMatchObject({ _id: s.maintenanceJob });
  });

  it("rejects legacy identity, mismatches, cross-company access, revoked and expired sessions", async () => {
    const t = makeTest(); const s = await seed(t); const auth = await login(t, "cleaner@pr4.test");
    await expect(t.query(api.queries.jobs.getForCleaner, { companyId: s.companyA, cleanerId: s.cleaner, userId: s.cleaner, sessionToken: "" })).rejects.toThrow("verified session is required");
    await expect(t.query(api.queries.jobs.getForCleaner, { companyId: s.companyA, cleanerId: s.other, userId: s.other, sessionToken: auth.sessionToken })).rejects.toThrow("does not match");
    await expect(t.query(api.queries.jobs.getForCleaner, { companyId: s.companyB, cleanerId: s.cleaner, userId: s.cleaner, sessionToken: auth.sessionToken })).rejects.toThrow("Access denied");
    await t.action((api as any).sessionActions.revokeCurrent, { sessionToken: auth.sessionToken });
    await expect(t.query(api.queries.jobs.get, { jobId: s.job, userId: s.cleaner, sessionToken: auth.sessionToken })).rejects.toThrow("verified session is required");
    const expired = await login(t, "cleaner@pr4.test");
    await t.run(async (ctx) => { const row = await ctx.db.query("authSessions").withIndex("by_tokenHash", q => q.eq("tokenHash", hashToken(expired.sessionToken))).unique(); await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 }); });
    await expect(t.query(api.queries.jobs.get, { jobId: s.job, userId: s.cleaner, sessionToken: expired.sessionToken })).rejects.toThrow("verified session is required");
  });

  it("blocks inactive users and inactive worker profiles", async () => {
    const t = makeTest(); const s = await seed(t);
    await expect(login(t, "inactive@pr4.test")).rejects.toThrow("Invalid email or password");
    const auth = await login(t, "other@pr4.test");
    await expect(t.mutation((api as any).mutations.workers.completeMyOnboardingItem, { userId: s.other, sessionToken: auth.sessionToken, onboardingItemId: s.onboardingItem })).rejects.toThrow("Active worker profile required");
  });

  it("derives affiliate dashboard and ledger identity from the session", async () => {
    const t = makeTest(); const s = await seed(t); const auth = await login(t, "affiliate@pr4.test");
    await expect(t.query(api.queries.affiliate.getMyReferrals, { userId: s.affiliate, sessionToken: auth.sessionToken })).resolves.toEqual([]);
    await expect(t.query(api.queries.affiliateLedger.getMyLedger, { userId: s.affiliate, sessionToken: auth.sessionToken })).resolves.toMatchObject({ rows: [{ commissionCents: 100 }] });
    await expect(t.query(api.queries.affiliateLedger.getMyLedger, { userId: s.otherAffiliate, sessionToken: auth.sessionToken })).rejects.toThrow("does not match");
    const owner = await login(t, "owner@pr4.test");
    await expect(t.query(api.queries.affiliate.getMyReferrals, { userId: s.owner, sessionToken: owner.sessionToken })).rejects.toThrow("Affiliate session required");
  });

  it("retains owner sessions, client compatibility, and public action contracts", async () => {
    const t = makeTest(); const s = await seed(t); const auth = await login(t, "owner@pr4.test");
    await expect(t.query(api.queries.jobs.list, { companyId: s.companyA, userId: s.owner, sessionToken: auth.sessionToken })).resolves.toHaveLength(2);
    await expect(t.query(api.authQueries.getCurrentUser, { userId: s.cleaner })).resolves.toMatchObject({ _id: s.cleaner });
    expect(typeof api.clientAuthActions.signIn).toBe("object");
    expect(typeof (api as any).inviteActions).toBe("object");
  });
});
