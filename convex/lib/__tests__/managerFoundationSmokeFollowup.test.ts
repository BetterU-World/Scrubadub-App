import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

describe("manager foundation smoke follow-up", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "manager-foundation-followup-pepper";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  });

  it("round-trips every submitted manager permission through the owner directory immediately", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Permission Co", timezone: "America/New_York" });
      const owner = await ctx.db.insert("users", { email: "owner@permissions.test", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
      const manager = await ctx.db.insert("users", { email: "manager@permissions.test", passwordHash, name: "Manager", companyId, role: "manager", status: "active", canManageBusinessConfiguration: true });
      return { companyId, owner, manager };
    });
    const auth = await t.action(api.authActions.signIn, { email: "owner@permissions.test", password: PASSWORD });
    const queryArgs = { companyId: seeded.companyId, userId: seeded.owner, sessionToken: auth.sessionToken };
    expect((await t.query(api.queries.employees.list, queryArgs)).find((employee) => employee._id === seeded.manager)?.canManageBusinessConfiguration).toBe(true);

    await t.mutation(api.mutations.employees.updateManagerPermissions, {
      employeeId: seeded.manager,
      userId: seeded.owner,
      sessionToken: auth.sessionToken,
      canSeeAllJobs: true,
      canCreateJobs: false,
      canAssignCleaners: true,
      canRequestRework: false,
      canApproveForms: true,
      canManageSchedule: false,
      canResolveRedFlags: true,
      canManageBusinessConfiguration: false,
      canManageClients: true,
      canManageSalesAndCommercial: false,
      canManageTeam: true,
      canViewFinancials: false,
      canManageInvoices: true,
      canManageDocuments: false,
      canViewAnalytics: true,
    });

    expect((await t.query(api.queries.employees.list, queryArgs)).find((employee) => employee._id === seeded.manager)).toMatchObject({
      canSeeAllJobs: true,
      canCreateJobs: false,
      canAssignCleaners: true,
      canRequestRework: false,
      canApproveForms: true,
      canManageSchedule: false,
      canResolveRedFlags: true,
      canManageBusinessConfiguration: false,
      canManageClients: true,
      canManageSalesAndCommercial: false,
      canManageTeam: true,
      canViewFinancials: false,
      canManageInvoices: true,
      canManageDocuments: false,
      canViewAnalytics: true,
    });
    expect(await t.query(api.authQueries.getCurrentUser, { sessionToken: (await t.action(api.authActions.signIn, { email: "manager@permissions.test", password: PASSWORD })).sessionToken })).toMatchObject({
      canManageBusinessConfiguration: false,
      canResolveRedFlags: true,
    });
  });

  it("marks manager personal jobs with existing direct, oversight, and team assignment rules", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Scope Co", timezone: "America/New_York" });
      const owner = await ctx.db.insert("users", { email: "owner@scope.test", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
      const manager = await ctx.db.insert("users", { email: "manager@scope.test", passwordHash, name: "Manager", companyId, role: "manager", status: "active", canSeeAllJobs: true });
      const cleaner = await ctx.db.insert("users", { email: "cleaner@scope.test", passwordHash, name: "Cleaner", companyId, role: "cleaner", status: "active" });
      const propertyId = await ctx.db.insert("properties", { companyId, name: "Property", address: "1 Main", type: "residential", amenities: [], active: true });
      const teamId = await ctx.db.insert("teams", { companyId, name: "Team", active: true, createdBy: owner, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("teamMembers", { teamId, companyId, userId: manager, role: "member", active: true, addedAt: 1 });
      const base = { companyId, propertyId, type: "standard" as const, status: "scheduled" as const, durationMinutes: 60, reworkCount: 0 };
      await ctx.db.insert("jobs", { ...base, cleanerIds: [manager], scheduledDate: "2030-01-01" });
      await ctx.db.insert("jobs", { ...base, cleanerIds: [cleaner], assignedManagerId: manager, scheduledDate: "2030-01-02" });
      await ctx.db.insert("jobs", { ...base, cleanerIds: [], assignedTeamId: teamId, scheduledDate: "2030-01-03" });
      await ctx.db.insert("jobs", { ...base, cleanerIds: [cleaner], scheduledDate: "2030-01-04" });
      return { companyId, manager };
    });
    const auth = await t.action(api.authActions.signIn, { email: "manager@scope.test", password: PASSWORD });
    const common = { companyId: seeded.companyId, userId: seeded.manager, sessionToken: auth.sessionToken };
    const list = await t.query(api.queries.jobs.getForManager, common);
    expect(list.filter((job) => job.isAssignedToCurrentUser)).toHaveLength(3);
    const calendar = await t.query(api.queries.jobs.getCalendarJobs, { ...common, startDate: "2030-01-01", endDate: "2030-01-31" });
    expect(calendar.filter((job) => job.isAssignedToCurrentUser)).toHaveLength(3);
  });
});
