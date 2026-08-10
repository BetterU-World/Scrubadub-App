import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const makeTest = () => convexTest(schema, modules);

async function login(t: ReturnType<typeof convexTest>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "B", timezone: "America/New_York" });
    const manager = await ctx.db.insert("users", { email: "assigned@test.dev", passwordHash, name: "Assigned Manager", companyId: companyA, role: "manager", status: "active", canSeeAllJobs: true });
    const otherManager = await ctx.db.insert("users", { email: "other@test.dev", passwordHash, name: "Other Manager", companyId: companyA, role: "manager", status: "active", canSeeAllJobs: true });
    const owner = await ctx.db.insert("users", { email: "owner@test.dev", passwordHash, name: "Assigned Owner", companyId: companyA, role: "owner", status: "active" });
    const cleaner = await ctx.db.insert("users", { email: "cleaner@test.dev", passwordHash, name: "Cleaner", companyId: companyA, role: "cleaner", status: "active" });
    const maintenance = await ctx.db.insert("users", { email: "maintenance@test.dev", passwordHash, name: "Maintenance", companyId: companyA, role: "maintenance", status: "active" });
    const foreign = await ctx.db.insert("users", { email: "foreign@test.dev", passwordHash, name: "Foreign", companyId: companyB, role: "manager", status: "active", canSeeAllJobs: true });
    const managerJob = await ctx.db.insert("jobs", { companyId: companyA, cleanerIds: [manager], type: "standard", status: "confirmed", scheduledDate: "2026-08-10", durationMinutes: 60, reworkCount: 0 });
    const ownerJob = await ctx.db.insert("jobs", { companyId: companyA, cleanerIds: [owner], type: "standard", status: "confirmed", scheduledDate: "2026-08-11", durationMinutes: 60, reworkCount: 0 });
    const cleanerJob = await ctx.db.insert("jobs", { companyId: companyA, cleanerIds: [cleaner], type: "standard", status: "confirmed", scheduledDate: "2026-08-12", durationMinutes: 60, reworkCount: 0 });
    const maintenanceJob = await ctx.db.insert("jobs", { companyId: companyA, cleanerIds: [maintenance], type: "maintenance", status: "confirmed", scheduledDate: "2026-08-13", durationMinutes: 60, reworkCount: 0 });
    return { companyA, manager, otherManager, owner, cleaner, maintenance, foreign, managerJob, ownerJob, cleanerJob, maintenanceJob };
  });
}

describe("assigned manager job execution", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("lets an explicitly assigned manager use the canonical lifecycle without creating cleaner pay", async () => {
    const t = makeTest();
    const { companyA, manager, owner, managerJob } = await seed(t);
    const auth = await login(t, "assigned@test.dev");
    await t.run((ctx) => ctx.db.patch(owner, { email: "" }));

    await expect(t.query(api.queries.jobs.getForCleaner, { cleanerId: manager, companyId: companyA, userId: manager, sessionToken: auth.sessionToken })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.jobs.get, { jobId: managerJob, userId: manager, sessionToken: auth.sessionToken })).resolves.toMatchObject({ canCurrentUserExecute: true });
    await t.mutation(api.mutations.jobs.startJob, { jobId: managerJob, userId: manager, sessionToken: auth.sessionToken });
    await t.mutation(api.mutations.jobs.completeJob, { jobId: managerJob, notes: "Manager completed", userId: manager, sessionToken: auth.sessionToken });

    const state = await t.run(async (ctx) => ({ job: await ctx.db.get(managerJob), payments: await ctx.db.query("cleanerPayments").collect() }));
    expect(state.job).toMatchObject({ status: "submitted", notes: "Completion notes: Manager completed" });
    expect(state.payments).toHaveLength(0);
  });

  it("keeps oversight separate from execution and rejects cross-company claims", async () => {
    const t = makeTest();
    const { companyA, manager, otherManager, foreign, managerJob } = await seed(t);
    const otherAuth = await login(t, "other@test.dev");
    await expect(t.query(api.queries.jobs.get, { jobId: managerJob, userId: otherManager, sessionToken: otherAuth.sessionToken })).resolves.toMatchObject({ canCurrentUserExecute: false });
    await expect(t.mutation(api.mutations.jobs.startJob, { jobId: managerJob, userId: otherManager, sessionToken: otherAuth.sessionToken })).rejects.toThrow("Not assigned");

    const foreignAuth = await login(t, "foreign@test.dev");
    await expect(t.mutation(api.mutations.jobs.startJob, { jobId: managerJob, userId: foreign, sessionToken: foreignAuth.sessionToken })).rejects.toThrow("Access denied");
    await expect(t.query(api.queries.jobs.getForCleaner, { cleanerId: manager, companyId: companyA, userId: foreign, sessionToken: foreignAuth.sessionToken })).rejects.toThrow("Access denied");
  });

  it("supports assigned owners and existing workers while enforcing job-type compatibility", async () => {
    const t = makeTest();
    const { owner, cleaner, maintenance, ownerJob, cleanerJob, maintenanceJob } = await seed(t);
    const ownerAuth = await login(t, "owner@test.dev");
    await expect(t.mutation(api.mutations.jobs.startJob, { jobId: ownerJob, userId: owner, sessionToken: ownerAuth.sessionToken })).resolves.toBeNull();

    const cleanerAuth = await login(t, "cleaner@test.dev");
    await expect(t.mutation(api.mutations.jobs.startJob, { jobId: cleanerJob, userId: cleaner, sessionToken: cleanerAuth.sessionToken })).resolves.toBeNull();

    const maintenanceAuth = await login(t, "maintenance@test.dev");
    await expect(t.mutation(api.mutations.jobs.startJob, { jobId: maintenanceJob, userId: maintenance, sessionToken: maintenanceAuth.sessionToken })).resolves.toBeNull();
    await t.run((ctx) => ctx.db.patch(cleanerJob, { cleanerIds: [maintenance], status: "confirmed", startedAt: undefined }));
    await expect(t.mutation(api.mutations.jobs.startJob, { jobId: cleanerJob, userId: maintenance, sessionToken: maintenanceAuth.sessionToken })).rejects.toThrow("unavailable");
  });
});
