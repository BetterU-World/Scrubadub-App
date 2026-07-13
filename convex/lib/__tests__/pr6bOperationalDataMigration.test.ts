import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const SESSION_ERROR = "verified session is required";

function backend() {
  return convexTest(schema, modules);
}

async function seed(t: ReturnType<typeof backend>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", {
      name: "PR 6B A",
      timezone: "America/New_York",
      publicRequestToken: "public-request-a",
    });
    const companyB = await ctx.db.insert("companies", {
      name: "PR 6B B",
      timezone: "America/New_York",
      publicRequestToken: "public-request-b",
    });
    const ownerA = await ctx.db.insert("users", { email: "owner-a@pr6b.test", passwordHash, name: "Owner A", companyId: companyA, role: "owner", status: "active" });
    const ownerB = await ctx.db.insert("users", { email: "owner-b@pr6b.test", passwordHash, name: "Owner B", companyId: companyB, role: "owner", status: "active" });
    const managerA = await ctx.db.insert("users", { email: "manager-a@pr6b.test", passwordHash, name: "Manager A", companyId: companyA, role: "manager", status: "active" });
    const cleanerA = await ctx.db.insert("users", { email: "cleaner-a@pr6b.test", passwordHash, name: "Cleaner A", companyId: companyA, role: "cleaner", status: "active" });
    const maintenanceA = await ctx.db.insert("users", { email: "maintenance-a@pr6b.test", passwordHash, name: "Maintenance A", companyId: companyA, role: "maintenance", status: "active" });
    const propertyA = await ctx.db.insert("properties", { companyId: companyA, name: "A Property", type: "residential", address: "1 Main", amenities: [], active: true });
    const propertyB = await ctx.db.insert("properties", { companyId: companyB, name: "B Property", type: "residential", address: "2 Main", amenities: [], active: true });
    const requestA = await ctx.db.insert("clientRequests", {
      companyId: companyA, createdAt: 1, status: "new", requesterName: "Client A",
      requesterEmail: "client-a@pr6b.test", propertySnapshot: {}, source: "manual",
      portalToken: "portal-a", portalEnabled: true,
    });
    const leadA = await ctx.db.insert("cleanerLeads", { companyId: companyA, createdAt: 1, status: "new", name: "Lead A", email: "lead-a@pr6b.test" });
    const siteA = await ctx.db.insert("companySites", { companyId: companyA, slug: "pr6b-a", templateId: "A", brandName: "PR 6B", bio: "Bio", serviceArea: "Area" });
    const templateA = await ctx.db.insert("inventoryTemplates", {
      companyId: companyA, name: "Default", items: [{ name: "Soap", category: "Supplies", parLevel: 1, required: true }], isDefault: true, createdAt: 1,
    });
    await ctx.db.insert("auditLog", { companyId: companyA, userId: ownerA, action: "seed", entityType: "test", entityId: ownerA, timestamp: 1 });
    const connectionA = await ctx.db.insert("calendarConnections", {
      companyId: companyA, propertyId: propertyA, platform: "airbnb", icalUrl: "https://example.test/a.ics",
      enabled: true, lastSyncStatus: "success", initialSyncCutoff: "2026-01-01", consecutiveErrors: 0, createdAt: 1, createdBy: ownerA,
    });
    await ctx.db.insert("calendarReservations", {
      companyId: companyA, connectionId: connectionA, propertyId: propertyA, externalUid: "reservation-a",
      checkIn: "2026-07-01", checkOut: "2026-07-02", rawHash: "hash", status: "active", firstSeenAt: 1, lastSeenAt: 1,
    });
    await ctx.db.insert("jobAutomationRules", { companyId: companyA, propertyId: propertyA, enabled: true, jobType: "standard", defaultDurationMinutes: 60 });
    return { companyA, companyB, ownerA, ownerB, managerA, cleanerA, maintenanceA, propertyA, propertyB, requestA, leadA, siteA, templateA };
  });
}

async function login(t: ReturnType<typeof backend>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

describe("PR 6B ordinary operational data migration", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("allows verified same-company staff reads across every shared operational family", async () => {
    const t = backend();
    const s = await seed(t);
    const manager = await login(t, "manager-a@pr6b.test");
    const common = { companyId: s.companyA, userId: s.managerA, sessionToken: manager.sessionToken };

    await expect(t.query(api.queries.employees.list, common)).resolves.toHaveLength(4);
    await expect(t.query(api.queries.clientRequests.getCompanyRequests, common)).resolves.toHaveLength(1);
    await expect(t.query(api.queries.calendarConnections.listByProperty, { ...common, propertyId: s.propertyA })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.calendarReservations.listByProperty, { ...common, propertyId: s.propertyA })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.jobAutomationRules.getByProperty, { ...common, propertyId: s.propertyA })).resolves.toMatchObject({ propertyId: s.propertyA });
    await expect(t.query(api.queries.inventoryTemplates.list, common)).resolves.toHaveLength(1);
    await expect(t.query(api.queries.performance.getLeaderboard, common)).resolves.toEqual([{ cleanerId: s.cleanerA, cleanerName: "Cleaner A", totalJobs: 0, averageScore: 0, averageTimeMinutes: 0, redFlagCount: 0, consistencyScore: 0 }]);
  });

  it("derives owner identity for owner-only families and rejects mismatches and lower roles", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner-a@pr6b.test");
    const manager = await login(t, "manager-a@pr6b.test");
    const cleaner = await login(t, "cleaner-a@pr6b.test");
    const maintenance = await login(t, "maintenance-a@pr6b.test");

    await expect(t.query(api.queries.cleanerLeads.getCompanyCleanerLeads, { userId: s.ownerA, sessionToken: owner.sessionToken })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.clientRequests.listRequestsForPipeline, { userId: s.ownerA, sessionToken: owner.sessionToken })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.companySites.getMySite, { companyId: s.companyA, userId: s.ownerA, sessionToken: owner.sessionToken })).resolves.toMatchObject({ _id: s.siteA });
    await expect(t.query(api.queries.auditLog.list, { companyId: s.companyA, userId: s.ownerA, sessionToken: owner.sessionToken })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.relationshipDiagnostics.getSummary, { userId: s.ownerA, sessionToken: owner.sessionToken })).resolves.toHaveProperty("entities");

    await expect(t.query(api.queries.cleanerLeads.getCompanyCleanerLeads, { userId: s.ownerB, sessionToken: owner.sessionToken })).rejects.toThrow("does not match");
    await expect(t.mutation(api.mutations.employees.updateEmployeeStatus, { employeeId: s.cleanerA, status: "inactive", userId: s.managerA, sessionToken: manager.sessionToken })).rejects.toThrow("Owner session required");
    await expect(t.query(api.queries.auditLog.list, { companyId: s.companyA, userId: s.cleanerA, sessionToken: cleaner.sessionToken })).rejects.toThrow("Owner session required");
    await expect(t.query(api.queries.relationshipDiagnostics.getSummary, { userId: s.maintenanceA, sessionToken: maintenance.sessionToken })).rejects.toThrow("Owner session required");
  });

  it("fails closed for missing, invalid, revoked, idle-expired, and absolute-expired sessions", async () => {
    const variants: Array<"missing" | "invalid" | "revoked" | "idle" | "absolute"> = ["missing", "invalid", "revoked", "idle", "absolute"];
    for (const variant of variants) {
      const t = backend();
      const s = await seed(t);
      const auth = await login(t, "owner-a@pr6b.test");
      let token = auth.sessionToken;
      if (variant === "missing") token = "";
      if (variant === "invalid") token = "not-a-session";
      if (variant === "revoked" || variant === "idle" || variant === "absolute") {
        await t.run(async (ctx) => {
          const session = await ctx.db.query("authSessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(auth.sessionToken))).unique();
          if (variant === "revoked") await ctx.db.patch(session!._id, { revokedAt: Date.now() });
          if (variant === "idle") await ctx.db.patch(session!._id, { idleExpiresAt: Date.now() - 1 });
          if (variant === "absolute") await ctx.db.patch(session!._id, { expiresAt: Date.now() - 1 });
        });
      }
      await expect(t.query(api.queries.employees.list, { companyId: s.companyA, userId: s.ownerA, sessionToken: token })).rejects.toThrow(SESSION_ERROR);
    }
  }, 15_000);

  it("rejects wrong-company and cross-company target resources without treating targets as callers", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner-a@pr6b.test");
    const common = { companyId: s.companyA, userId: s.ownerA, sessionToken: owner.sessionToken };

    await expect(t.query(api.queries.employees.list, { ...common, companyId: s.companyB })).rejects.toThrow("Access denied");
    await expect(t.query(api.queries.clientRequests.getRequestById, { id: s.requestA, userId: s.ownerB, sessionToken: owner.sessionToken })).rejects.toThrow("does not match");
    await expect(t.query(api.queries.calendarConnections.listByProperty, { ...common, propertyId: s.propertyB })).rejects.toThrow("Access denied");
    await expect(t.query(api.queries.inventoryTemplates.get, { templateId: s.templateA, userId: s.ownerB, sessionToken: owner.sessionToken })).rejects.toThrow("does not match");
  });

  it("preserves intentional public routes without a human session", async () => {
    const t = backend();
    await seed(t);
    await expect(t.query(api.queries.companySites.getBySlug, { slug: "pr6b-a" })).resolves.toMatchObject({ slug: "pr6b-a" });
    await expect(t.query(api.queries.clientRequests.getCompanyByRequestToken, { token: "public-request-a" })).resolves.toEqual({ companyName: "PR 6B A" });
    await expect(t.query(api.queries.clientRequests.getClientPortalByToken, { token: "portal-a" })).resolves.toMatchObject({ requesterName: "Client A" });
    await expect(t.mutation(api.mutations.cleanerLeads.createCleanerLeadBySlug, { slug: "pr6b-a", name: "Public Lead", email: "public-lead@pr6b.test" })).resolves.toEqual({ ok: true });
  });

  it("keeps every approved public function session-verified while leaving public and internal entry points unchanged", () => {
    const backendFiles = [
      "queries/employees.ts", "mutations/employees.ts", "queries/cleanerLeads.ts", "mutations/cleanerLeads.ts",
      "queries/clientRequests.ts", "mutations/clientRequests.ts", "queries/companySites.ts", "mutations/companySites.ts",
      "queries/calendarConnections.ts", "queries/calendarReservations.ts", "mutations/calendarConnections.ts", "mutations/calendarSync.ts",
      "queries/jobAutomationRules.ts", "mutations/jobAutomationRules.ts", "queries/inventoryTemplates.ts", "mutations/inventoryTemplates.ts",
      "queries/performance.ts", "queries/auditLog.ts", "queries/relationshipDiagnostics.ts",
    ];
    const source = backendFiles.map((path) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8")).join("\n");
    expect(source).not.toMatch(/\b(requireAuth|assertCompanyAccess|requireOwner)\s*\(/);
    expect((source.match(/sessionToken:\s*v\.string\(\)/g) ?? [])).toHaveLength(49);

    const cleanerLeads = readFileSync(fileURLToPath(new URL("../../mutations/cleanerLeads.ts", import.meta.url)), "utf8");
    const companySites = readFileSync(fileURLToPath(new URL("../../queries/companySites.ts", import.meta.url)), "utf8");
    const clientRequests = readFileSync(fileURLToPath(new URL("../../queries/clientRequests.ts", import.meta.url)), "utf8");
    const calendarSync = readFileSync(fileURLToPath(new URL("../../mutations/calendarSync.ts", import.meta.url)), "utf8");
    expect(cleanerLeads.match(/export const createCleanerLeadBySlug[\s\S]*?\n\}\);/)?.[0]).not.toContain("sessionToken");
    expect(companySites.match(/export const getBySlug[\s\S]*?\n\}\);/)?.[0]).not.toContain("sessionToken");
    expect(clientRequests.match(/export const getCompanyByRequestToken[\s\S]*?\n\}\);/)?.[0]).not.toContain("sessionToken");
    expect(calendarSync.match(/export const processSyncResults[\s\S]*?\n\}\);/)?.[0]).not.toContain("sessionToken");
  });
});
