import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "Authorization A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "Authorization B", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { email: "owner@auth.test", passwordHash, name: "Owner", companyId: companyA, role: "owner", status: "active" });
    const manager = await ctx.db.insert("users", { email: "manager@auth.test", passwordHash, name: "Manager", companyId: companyA, role: "manager", status: "active", canManageSchedule: true });
    const cleaner = await ctx.db.insert("users", { email: "cleaner@auth.test", passwordHash, name: "Cleaner", companyId: companyA, role: "cleaner", status: "active" });
    const unassignedCleaner = await ctx.db.insert("users", { email: "unassigned-cleaner@auth.test", passwordHash, name: "Unassigned Cleaner", companyId: companyA, role: "cleaner", status: "active" });
    const unassignedManager = await ctx.db.insert("users", { email: "unassigned-manager@auth.test", passwordHash, name: "Unassigned Manager", companyId: companyA, role: "manager", status: "active" });
    const maintenance = await ctx.db.insert("users", { email: "maintenance@auth.test", passwordHash, name: "Maintenance", companyId: companyA, role: "maintenance", status: "active" });
    const foreignCleaner = await ctx.db.insert("users", { email: "foreign-cleaner@auth.test", passwordHash, name: "Foreign Cleaner", companyId: companyB, role: "cleaner", status: "active" });
    const propertyA = await ctx.db.insert("properties", { companyId: companyA, name: "Property A", address: "1 Main St", type: "residential", amenities: [], active: true });
    const propertyB = await ctx.db.insert("properties", { companyId: companyB, name: "Property B", address: "2 Main St", type: "residential", amenities: [], active: true });
    const account = await ctx.db.insert("commercialAccounts", { companyId: companyA, clientName: "Account", status: "active", createdAt: 1, updatedAt: 1 });
    const schedule = await ctx.db.insert("commercialSchedules", { companyId: companyA, commercialAccountId: account, propertyId: propertyA, title: "Weekly", status: "active", frequency: "weekly", createdAt: 1, updatedAt: 1 });
    const team = await ctx.db.insert("teams", { companyId: companyA, name: "Execution Team", active: true, createdBy: owner, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("teamMembers", { teamId: team, companyId: companyA, userId: unassignedCleaner, role: "member", active: true, addedAt: 1 });
    const cleanerJob = await ctx.db.insert("jobs", { companyId: companyA, propertyId: propertyA, cleanerIds: [cleaner], type: "standard", status: "in_progress", scheduledDate: "2030-01-01", durationMinutes: 60, reworkCount: 0 });
    const managerJob = await ctx.db.insert("jobs", { companyId: companyA, propertyId: propertyA, cleanerIds: [manager], type: "standard", status: "in_progress", scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0 });
    const teamJob = await ctx.db.insert("jobs", { companyId: companyA, propertyId: propertyA, cleanerIds: [], assignedTeamId: team, type: "standard", status: "in_progress", scheduledDate: "2030-01-03", durationMinutes: 60, reworkCount: 0 });
    const foreignJob = await ctx.db.insert("jobs", { companyId: companyB, propertyId: propertyB, cleanerIds: [foreignCleaner], type: "standard", status: "in_progress", scheduledDate: "2030-01-03", durationMinutes: 60, reworkCount: 0 });
    return { companyA, companyB, owner, manager, cleaner, unassignedCleaner, unassignedManager, maintenance, foreignCleaner, propertyA, propertyB, account, schedule, cleanerJob, managerJob, teamJob, foreignJob };
  });
}

const login = (t: ReturnType<typeof convexTest>, email: string) =>
  t.action(api.authActions.signIn, { email, password: PASSWORD });

describe("manager critical authorization hotfix", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "manager-critical-auth-pepper";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  });

  it("keeps commercial schedule management available to owners and managers", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    const ownerAuth = await login(t, "owner@auth.test");
    const managerAuth = await login(t, "manager@auth.test");

    await expect(t.query(api.queries.commercialSchedules.getById, { userId: s.owner, sessionToken: ownerAuth.sessionToken, scheduleId: s.schedule })).resolves.toMatchObject({ _id: s.schedule });
    await t.mutation(api.mutations.commercialSchedules.pause, { userId: s.owner, sessionToken: ownerAuth.sessionToken, scheduleId: s.schedule });
    await t.mutation(api.mutations.commercialSchedules.reactivate, { userId: s.manager, sessionToken: managerAuth.sessionToken, scheduleId: s.schedule });
    await expect(t.query(api.queries.commercialSchedules.getById, { userId: s.manager, sessionToken: managerAuth.sessionToken, scheduleId: s.schedule })).resolves.toMatchObject({ status: "active" });
    await t.run((ctx) => ctx.db.patch(s.manager, { canManageSchedule: false }));
    await expect(t.query(api.queries.commercialSchedules.getById, { userId: s.manager, sessionToken: managerAuth.sessionToken, scheduleId: s.schedule })).rejects.toThrow("Schedule management permission required");
  });

  it.each([
    ["cleaner", "cleaner@auth.test"],
    ["maintenance", "maintenance@auth.test"],
  ])("denies commercial schedule management to %s staff", async (_role, email) => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    const auth = await login(t, email);
    const userId = email.startsWith("cleaner") ? s.cleaner : s.maintenance;

    await expect(t.query(api.queries.commercialSchedules.getById, { userId, sessionToken: auth.sessionToken, scheduleId: s.schedule })).rejects.toThrow("Owner or manager");
    await expect(t.mutation(api.mutations.commercialSchedules.pause, { userId, sessionToken: auth.sessionToken, scheduleId: s.schedule })).rejects.toThrow("Owner or manager");
    await expect(t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, { userId, sessionToken: auth.sessionToken, commercialScheduleId: s.schedule, startDate: "2030-01-01", endDate: "2030-01-07" })).rejects.toThrow("Owner or manager");
  });

  it("allows assigned cleaner and manager executors to create red flags", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    for (const [email, userId, jobId] of [
      ["cleaner@auth.test", s.cleaner, s.cleanerJob],
      ["manager@auth.test", s.manager, s.managerJob],
      ["unassigned-cleaner@auth.test", s.unassignedCleaner, s.teamJob],
    ] as const) {
      const auth = await login(t, email);
      await expect(t.mutation(api.mutations.redFlags.create, {
        userId, sessionToken: auth.sessionToken, companyId: s.companyA, propertyId: s.propertyA,
        jobId, category: "damage", severity: "low", note: "Assigned executor finding",
      })).resolves.toBeDefined();
    }
  });

  it("denies unassigned cleaner and manager red-flag creation", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    for (const [email, userId] of [
      ["unassigned-cleaner@auth.test", s.unassignedCleaner],
      ["unassigned-manager@auth.test", s.unassignedManager],
    ] as const) {
      const auth = await login(t, email);
      await expect(t.mutation(api.mutations.redFlags.create, {
        userId, sessionToken: auth.sessionToken, companyId: s.companyA, propertyId: s.propertyA,
        jobId: s.cleanerJob, category: "damage", severity: "low", note: "Unauthorized finding",
      })).rejects.toThrow("Not assigned to perform this job");
    }
  });

  it("keeps cross-company red-flag creation denied", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    const auth = await login(t, "cleaner@auth.test");
    await expect(t.mutation(api.mutations.redFlags.create, {
      userId: s.cleaner, sessionToken: auth.sessionToken, companyId: s.companyA, propertyId: s.propertyB,
      jobId: s.foreignJob, category: "damage", severity: "low", note: "Foreign finding",
    })).rejects.toThrow("Access denied");
  });
});
