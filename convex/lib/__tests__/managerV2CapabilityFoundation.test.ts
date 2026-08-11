import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hasManagerPermission, hasOwnerOrManagerPermission } from "../auth";
import { readFileSync } from "node:fs";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const newCapabilities = {
  canManageClients: true,
  canManageSalesAndCommercial: false,
  canManageTeam: true,
  canViewFinancials: false,
  canManageInvoices: true,
  canManageDocuments: false,
  canViewAnalytics: true,
};

describe("Manager Experience V2 capability foundation", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "manager-v2-foundation-pepper";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  });

  it("defaults invited Managers to false and round-trips every new capability reactively", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "V2 Co", timezone: "America/New_York" });
      const owner = await ctx.db.insert("users", { email: "owner@v2.test", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
      return { companyId, owner };
    });
    const ownerAuth = await t.action(api.authActions.signIn, { email: "owner@v2.test", password: PASSWORD });
    const invited = await (async () => {
      vi.useFakeTimers();
      try {
        const result = await t.action(api.employeeActions.inviteCleaner, {
          companyId: seeded.companyId, email: "manager@v2.test", name: "Manager", role: "manager",
          userId: seeded.owner, sessionToken: ownerAuth.sessionToken,
        });
        await t.finishAllScheduledFunctions(vi.runAllTimers);
        return result;
      } finally {
        vi.useRealTimers();
      }
    })();
    const initial = await t.run((ctx) => ctx.db.get(invited.userId));
    for (const key of Object.keys(newCapabilities) as Array<keyof typeof newCapabilities>) expect(initial?.[key]).toBe(false);

    await t.mutation(api.mutations.employees.updateManagerPermissions, {
      employeeId: invited.userId, userId: seeded.owner, sessionToken: ownerAuth.sessionToken,
      canSeeAllJobs: false, canCreateJobs: false, canAssignCleaners: false, canRequestRework: false,
      canApproveForms: false, canManageSchedule: false, canResolveRedFlags: false,
      canManageBusinessConfiguration: false, ...newCapabilities,
    });
    const directory = await t.query(api.queries.employees.list, { companyId: seeded.companyId, userId: seeded.owner, sessionToken: ownerAuth.sessionToken });
    expect(directory.find((user) => user._id === invited.userId)).toMatchObject(newCapabilities);

    await t.action(api.employeeActions.acceptInvite, { token: invited.token, password: PASSWORD });
    const managerAuth = await t.action(api.authActions.signIn, { email: "manager@v2.test", password: PASSWORD });
    expect(await t.query(api.authQueries.getCurrentUser, { sessionToken: managerAuth.sessionToken })).toMatchObject(newCapabilities);

    await t.mutation(api.mutations.employees.updateManagerPermissions, {
      employeeId: invited.userId, userId: seeded.owner, sessionToken: ownerAuth.sessionToken,
      canSeeAllJobs: false, canCreateJobs: false, canAssignCleaners: false, canRequestRework: false,
      canApproveForms: false, canManageSchedule: false, canResolveRedFlags: false,
      canManageBusinessConfiguration: false, ...newCapabilities, canManageClients: false,
    });
    expect(await t.query(api.authQueries.getCurrentUser, { sessionToken: managerAuth.sessionToken })).toMatchObject({ canManageClients: false });
  });

  it("recognizes new fields through canonical authorization helpers without implicit owner coupling", () => {
    const manager = { role: "manager", canManageClients: true, canViewFinancials: false, canManageInvoices: true };
    expect(hasManagerPermission(manager, "canManageClients")).toBe(true);
    expect(hasManagerPermission(manager, "canViewFinancials")).toBe(false);
    expect(hasManagerPermission(manager, "canManageInvoices")).toBe(true);
    expect(hasOwnerOrManagerPermission({ role: "owner" }, "canManageClients")).toBe(true);
  });

  it("keeps every V2 field in the invite and edit permission-editor round trip", () => {
    const editor = readFileSync("packages/frontend/src/pages/owner/EmployeeListPage.tsx", "utf8");
    const app = readFileSync("packages/frontend/src/App.tsx", "utf8");
    for (const key of Object.keys(newCapabilities)) {
      expect(editor).toContain(`["${key}"`);
      expect(editor).toContain(`${key}: false`);
      expect(editor).toContain(`${key}: !!(emp as any).${key}`);
    }
    for (const key of ["canManageClients", "canManageSalesAndCommercial", "canManageTeam", "canManageDocuments"]) {
      expect(app).toContain(`user?.${key} && <Route`);
    }
    expect(app).toContain("user?.canViewFinancials && <Route");
    expect(app).toContain("user?.canManageInvoices || user?.canViewFinancials");
    expect(app).toContain("user?.canViewAnalytics && <Route");
    expect(editor).toContain("...editPerms");
    expect(editor).toContain("Manage Operational Settings");
  });

  it("closes residual request, analytics, team, and red-flag assignment exposures", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const s = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Cleanup Co", timezone: "America/New_York" });
      const owner = await ctx.db.insert("users", { email: "owner@cleanup.test", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
      const manager = await ctx.db.insert("users", { email: "manager@cleanup.test", passwordHash, name: "Manager", companyId, role: "manager", status: "active" });
      const cleaner = await ctx.db.insert("users", { email: "cleaner@cleanup.test", passwordHash, name: "Cleaner", companyId, role: "cleaner", status: "active" });
      const outsider = await ctx.db.insert("users", { email: "outsider@cleanup.test", passwordHash, name: "Outsider", companyId, role: "cleaner", status: "active" });
      const propertyId = await ctx.db.insert("properties", { companyId, name: "Property", address: "1 Main", type: "residential", amenities: [], active: true });
      const requestId = await ctx.db.insert("clientRequests", { companyId, createdAt: 1, status: "new", requesterName: "Lead", requesterEmail: "lead@test.dev", propertySnapshot: { address: "1 Main" }, leadType: "residential", source: "manual" });
      const teamId = await ctx.db.insert("teams", { companyId, name: "Team", active: true, createdBy: owner, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("teamMembers", { teamId, companyId, userId: manager, role: "member", active: true, addedAt: 1 });
      const directJob = await ctx.db.insert("jobs", { companyId, propertyId, cleanerIds: [manager], type: "standard", status: "scheduled", scheduledDate: "2030-01-01", durationMinutes: 60, reworkCount: 0 });
      const teamJob = await ctx.db.insert("jobs", { companyId, propertyId, cleanerIds: [], assignedTeamId: teamId, type: "standard", status: "scheduled", scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0 });
      const otherJob = await ctx.db.insert("jobs", { companyId, propertyId, cleanerIds: [cleaner], type: "standard", status: "scheduled", scheduledDate: "2030-01-03", durationMinutes: 60, reworkCount: 0 });
      for (const jobId of [directJob, teamJob, otherJob]) await ctx.db.insert("redFlags", { companyId, propertyId, jobId, category: "damage", severity: "low", note: "Flag", status: "open" });
      return { companyId, owner, manager, cleaner, outsider, propertyId, requestId, teamId, directJob, teamJob };
    });
    const managerAuth = await t.action(api.authActions.signIn, { email: "manager@cleanup.test", password: PASSWORD });
    const cleanerAuth = await t.action(api.authActions.signIn, { email: "cleaner@cleanup.test", password: PASSWORD });
    const outsiderAuth = await t.action(api.authActions.signIn, { email: "outsider@cleanup.test", password: PASSWORD });
    const managerSession = { userId: s.manager, sessionToken: managerAuth.sessionToken };

    await expect(t.query(api.queries.clientRequests.getCompanyRequests, { ...managerSession, companyId: s.companyId })).rejects.toThrow("canManageSalesAndCommercial permission required");
    await expect(t.query(api.queries.clientRequests.getRequestById, { ...managerSession, id: s.requestId })).rejects.toThrow("canManageSalesAndCommercial permission required");
    await expect(t.mutation(api.mutations.clientRequests.updateLeadDetails, { ...managerSession, requestId: s.requestId, leadType: "residential" })).rejects.toThrow("canManageSalesAndCommercial permission required");
    await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { ...managerSession, requestId: s.requestId })).rejects.toThrow("canManageSalesAndCommercial permission required");
    await expect(t.query(api.queries.performance.getLeaderboard, { ...managerSession, companyId: s.companyId })).rejects.toThrow("canViewAnalytics permission required");
    await expect(t.query(api.queries.performance.getWorkerSummary, { ...managerSession, companyId: s.companyId, workerUserId: s.cleaner })).rejects.toThrow("canViewAnalytics permission required");
    await expect(t.query(api.queries.performance.getCleanerStats, { userId: s.cleaner, sessionToken: cleanerAuth.sessionToken, companyId: s.companyId, cleanerId: s.cleaner })).resolves.toBeTruthy();

    await expect(t.query(api.queries.teams.get, { ...managerSession, teamId: s.teamId })).resolves.toMatchObject({ _id: s.teamId });
    await expect(t.query(api.queries.teams.get, { userId: s.outsider, sessionToken: outsiderAuth.sessionToken, teamId: s.teamId })).rejects.toThrow("Access denied");
    const flags = await t.query(api.queries.redFlags.listForManager, { ...managerSession, companyId: s.companyId });
    expect(flags).toHaveLength(2);
    await expect(t.query(api.queries.redFlags.listByJob, { ...managerSession, jobId: s.directJob })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.redFlags.listByJob, { ...managerSession, jobId: s.teamJob })).resolves.toHaveLength(1);
  });
});
