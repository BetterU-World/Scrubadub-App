import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

function makeTest() {
  return convexTest(schema, modules);
}

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "B", timezone: "America/New_York" });
    const ownerA = await ctx.db.insert("users", { email: "owner-a@pr3.test", passwordHash, name: "Owner A", companyId: companyA, role: "owner", status: "active" });
    const ownerB = await ctx.db.insert("users", { email: "owner-b@pr3.test", passwordHash, name: "Owner B", companyId: companyB, role: "owner", status: "active" });
    const managerA = await ctx.db.insert("users", { email: "manager-a@pr3.test", passwordHash, name: "Manager A", companyId: companyA, role: "manager", status: "active", canSeeAllJobs: true });
    const managerB = await ctx.db.insert("users", { email: "manager-b@pr3.test", passwordHash, name: "Manager B", companyId: companyB, role: "manager", status: "active", canSeeAllJobs: true });
    const workerA = await ctx.db.insert("users", { email: "worker-a@pr3.test", passwordHash, name: "Worker A", companyId: companyA, role: "cleaner", status: "active" });
    const affiliate = await ctx.db.insert("users", { email: "affiliate@pr3.test", passwordHash, name: "Affiliate", role: "affiliate", status: "active" });
    const propertyA = await ctx.db.insert("properties", { companyId: companyA, name: "A Property", type: "residential", address: "1 Main", amenities: [], active: true });
    const propertyB = await ctx.db.insert("properties", { companyId: companyB, name: "B Property", type: "residential", address: "2 Main", amenities: [], active: true });
    const jobA = await ctx.db.insert("jobs", { companyId: companyA, propertyId: propertyA, cleanerIds: [workerA], type: "standard", status: "scheduled", scheduledDate: "2026-07-12", durationMinutes: 60, reworkCount: 0 });
    return { companyA, companyB, ownerA, ownerB, managerA, managerB, workerA, affiliate, propertyA, propertyB, jobA };
  });
}

async function login(t: ReturnType<typeof convexTest>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

describe("owner and manager session migration", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("derives owner identity and company from the verified session", async () => {
    const t = makeTest();
    const { companyA, ownerA, ownerB, propertyA } = await seed(t);
    const auth = await login(t, "owner-a@pr3.test");
    await expect(t.query(api.queries.dashboard.getStats, { companyId: companyA, userId: ownerA, sessionToken: auth.sessionToken })).resolves.toMatchObject({ propertyCount: 1 });
    await expect(t.query(api.queries.properties.get, { propertyId: propertyA, userId: ownerB, sessionToken: auth.sessionToken })).rejects.toThrow("does not match");
  });

  it("loads the owner worker roster only from a verified owner session", async () => {
    const t = makeTest();
    const { companyA, ownerA, ownerB } = await seed(t);
    const auth = await login(t, "owner-a@pr3.test");
    const listWorkersForCompany = (api as any).queries.workers.listWorkersForCompany;

    await expect(t.query(listWorkersForCompany, {
      companyId: companyA,
      userId: ownerA,
      sessionToken: auth.sessionToken,
      includeArchived: true,
    })).resolves.toEqual([]);

    await expect(t.query(listWorkersForCompany, {
      companyId: companyA,
      userId: ownerB,
      sessionToken: auth.sessionToken,
      includeArchived: true,
    })).rejects.toThrow("does not match");

    await expect(t.query(listWorkersForCompany, {
      companyId: companyA,
      userId: ownerA,
      sessionToken: "",
      includeArchived: true,
    })).rejects.toThrow("verified session is required");
  });

  it("rejects cross-company owner access and legacy owner identity", async () => {
    const t = makeTest();
    const { companyB, ownerA, propertyB } = await seed(t);
    const auth = await login(t, "owner-a@pr3.test");
    await expect(t.query(api.queries.properties.list, { companyId: companyB, userId: ownerA, sessionToken: auth.sessionToken })).rejects.toThrow("Access denied");
    await expect(t.query(api.queries.properties.get, { propertyId: propertyB, userId: ownerA, sessionToken: "" })).rejects.toThrow("verified session is required");
  });

  it("preserves manager visibility without granting owner-only operations", async () => {
    const t = makeTest();
    const { companyA, companyB, managerA, propertyA } = await seed(t);
    const auth = await login(t, "manager-a@pr3.test");
    await expect(t.query(api.queries.jobs.getForManager, { companyId: companyA, userId: managerA, sessionToken: auth.sessionToken })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.jobs.getForManager, { companyId: companyB, userId: managerA, sessionToken: auth.sessionToken })).rejects.toThrow("Access denied");
    await expect(t.mutation(api.mutations.properties.toggleActive, { propertyId: propertyA, userId: managerA, sessionToken: auth.sessionToken })).rejects.toThrow("Owner session required");
  });

  it("rejects revoked and expired owner sessions", async () => {
    const t = makeTest();
    const { companyA, ownerA } = await seed(t);
    const revoked = await login(t, "owner-a@pr3.test");
    await t.action((api as any).sessionActions.revokeCurrent, { sessionToken: revoked.sessionToken });
    await expect(t.query(api.queries.dashboard.getStats, { companyId: companyA, userId: ownerA, sessionToken: revoked.sessionToken })).rejects.toThrow("verified session is required");
    const expired = await login(t, "owner-a@pr3.test");
    await t.run(async (ctx) => {
      const session = await ctx.db.query("authSessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(expired.sessionToken))).unique();
      await ctx.db.patch(session!._id, { expiresAt: Date.now() - 1 });
    });
    await expect(t.query(api.queries.dashboard.getStats, { companyId: companyA, userId: ownerA, sessionToken: expired.sessionToken })).rejects.toThrow("verified session is required");
  });

  it("requires worker sessions while retaining client compatibility", async () => {
    const t = makeTest();
    const { companyA, workerA, affiliate } = await seed(t);
    await expect(t.query(api.queries.jobs.list, { companyId: companyA, userId: workerA, sessionToken: "" })).rejects.toThrow("verified session is required");
    const affiliateAuth = await login(t, "affiliate@pr3.test");
    await expect(t.query(api.authQueries.getCurrentUser, { sessionToken: affiliateAuth.sessionToken })).resolves.toMatchObject({ _id: affiliate });
    expect(typeof api.clientAuthActions.signIn).toBe("object");
  });
});
