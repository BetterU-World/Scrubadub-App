import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const password = "quick-test-password";

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(password);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Quick Co", timezone: "America/New_York", subscriptionStatus: "active" });
    const ownerId = await ctx.db.insert("users", { companyId, name: "Owner", email: "quick-owner@test.dev", passwordHash, role: "owner", status: "active" });
    const managerId = await ctx.db.insert("users", { companyId, name: "Manager", email: "quick-manager@test.dev", passwordHash, role: "manager", status: "active", canCreateJobs: true, canManageClients: true, canAssignCleaners: true });
    const cleanerId = await ctx.db.insert("users", { companyId, name: "Cleaner", email: "quick-cleaner@test.dev", passwordHash, role: "cleaner", status: "active" });
    const clientUserId = await ctx.db.insert("clientUsers", { email: "quick-client@test.dev", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const clientId = await ctx.db.insert("clientRelationships", { companyId, clientUserId, displayName: "Client", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    return { companyId, ownerId, managerId, cleanerId, clientId, clientUserId };
  });
  const ownerAuth = await t.action(api.authActions.signIn, { email: "quick-owner@test.dev", password });
  const managerAuth = await t.action(api.authActions.signIn, { email: "quick-manager@test.dev", password });
    const cleanerAuth = await t.action(api.authActions.signIn, { email: "quick-cleaner@test.dev", password });
    const clientAuth = await t.action(api.clientAuthActions.signIn, { email: "quick-client@test.dev", password });
  const base = { companyId: ids.companyId, type: "standard" as const, scheduledDate: "2030-01-01", startTime: "10:00", durationMinutes: 120, cleanerIds: [] as typeof ids.cleanerId[] };
  return { t, ...ids, ownerAuth, managerAuth, cleanerAuth, clientAuth, base };
}

describe("quick jobs V1", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "quick-jobs-test-pepper";
    process.env.RESEND_API_KEY = "test";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("creates and reuses one unmanaged property, snapshots contact, and preserves history on conversion", async () => {
    const s = await setup();
    const auth = { userId: s.ownerId, sessionToken: s.ownerAuth.sessionToken };
    const firstId = await s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, newProperty: { address: "1 Main St", type: "residential" }, contact: { name: "Jane" }, customerChargeCents: 18000 });
    const first = await s.t.run(ctx => ctx.db.get(firstId));
    const propertyId = first!.propertyId!;
    expect(first).toMatchObject({ customerChargeCents: 18000, serviceContactSnapshot: { name: "Jane" } });
    expect(await s.t.run(ctx => ctx.db.get(propertyId))).toMatchObject({ managementStatus: "unmanaged", contactName: "Jane", name: "1 Main St" });
    const secondId = await s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, propertyId, contact: { name: "Bob" }, customerChargeCents: 0 });
    expect((await s.t.run(ctx => ctx.db.get(secondId)))?.propertyId).toEqual(propertyId);
    expect((await s.t.run(ctx => ctx.db.get(propertyId)))?.contactName).toBe("Jane");
    const portalAuth = { clientUserId: s.clientUserId, sessionToken: s.clientAuth.sessionToken };
    expect((await s.t.query(api.queries.clientPortal.getClientLocations, portalAuth)).properties).toHaveLength(0);
    await s.t.mutation(api.mutations.properties.manage, { ...auth, propertyId, clientRelationshipId: s.clientId });
    expect(await s.t.run(ctx => ctx.db.get(propertyId))).toMatchObject({ managementStatus: "managed", clientRelationshipId: s.clientId });
    expect((await s.t.run(ctx => ctx.db.get(firstId)))?.clientRelationshipId).toBeUndefined();
    const locations = await s.t.query(api.queries.clientPortal.getClientLocations, portalAuth);
    expect(locations.properties).toMatchObject([{ _id: propertyId }]);
    expect(locations.properties[0]).not.toHaveProperty("contactName");
    const servicesBefore = await s.t.query(api.queries.clientPortal.getClientServices, portalAuth);
    expect(JSON.stringify(servicesBefore)).not.toContain(String(firstId));
    const thirdId = await s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, propertyId });
    expect((await s.t.run(ctx => ctx.db.get(thirdId)))?.clientRelationshipId).toEqual(s.clientId);
    const history = await s.t.query(api.queries.properties.getHistory, { ...auth, propertyId });
    expect(history.totalJobs).toBe(3);
  });

  it("composes manager permissions and rolls back a failed new-location Job", async () => {
    const s = await setup();
    const auth = { userId: s.managerId, sessionToken: s.managerAuth.sessionToken };
    const newProperty = { address: "2 Main St", type: "residential" as const };
    const id = await s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, newProperty });
    const propertyId = (await s.t.run(ctx => ctx.db.get(id)))!.propertyId!;
    await s.t.run(ctx => ctx.db.patch(s.managerId, { canManageClients: false }));
    await expect(s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, newProperty })).rejects.toThrow("Property management");
    await expect(s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, propertyId, updatePropertyContact: true })).rejects.toThrow("Property management");
    await s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, propertyId });
    await s.t.run(ctx => ctx.db.patch(s.managerId, { canManageClients: true, canAssignCleaners: false, canManageSchedule: false }));
    await s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, newProperty: { address: "3 Main", type: "residential" } });
    await expect(s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, propertyId, cleanerIds: [s.cleanerId] })).rejects.toThrow("assignment");
    await expect(s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, newProperty: { address: "bad", type: "residential" }, durationMinutes: 0 })).rejects.toThrow("schedule");
    const properties = await s.t.query(api.queries.properties.list, { ...auth, companyId: s.companyId });
    expect(properties.some(p => p.address === "bad")).toBe(false);
    await s.t.run(ctx => ctx.db.patch(s.managerId, { canCreateJobs: false }));
    await expect(s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, propertyId })).rejects.toThrow("Job creation");
  });

  it("separates manager Property reading from management", async () => {
    const s = await setup();
    const auth = { userId: s.managerId, sessionToken: s.managerAuth.sessionToken };
    const propertyId = await s.t.run(ctx => ctx.db.insert("properties", { companyId: s.companyId, name: "Existing", address: "6 Main", type: "residential", amenities: [], active: true }));
    for (const capabilities of [
      { canCreateJobs: true, canManageSchedule: false, canManageClients: false },
      { canCreateJobs: false, canManageSchedule: true, canManageClients: false },
      { canCreateJobs: false, canManageSchedule: false, canManageClients: true },
    ]) {
      await s.t.run(ctx => ctx.db.patch(s.managerId, capabilities));
      expect(await s.t.query(api.queries.properties.list, { ...auth, companyId: s.companyId })).toHaveLength(1);
      expect((await s.t.query(api.queries.properties.get, { ...auth, propertyId }))?._id).toEqual(propertyId);
      if (!capabilities.canManageClients) {
        await expect(s.t.mutation(api.mutations.properties.toggleActive, { ...auth, propertyId })).rejects.toThrow("canManageClients");
      } else {
        await s.t.mutation(api.mutations.properties.toggleActive, { ...auth, propertyId });
        expect((await s.t.run(ctx => ctx.db.get(propertyId)))?.active).toBe(false);
      }
    }
    await s.t.run(ctx => ctx.db.patch(s.managerId, { canCreateJobs: false, canManageSchedule: false, canManageClients: false }));
    await expect(s.t.query(api.queries.properties.list, { ...auth, companyId: s.companyId })).rejects.toThrow("Property directory permission required");
    await expect(s.t.query(api.queries.properties.get, { ...auth, propertyId })).rejects.toThrow("Property access permission required");
  });

  it("rejects a mismatched red flag and keeps worker job results free of charge and contact", async () => {
    const s = await setup();
    const auth = { userId: s.ownerId, sessionToken: s.ownerAuth.sessionToken };
    const id = await s.t.mutation(api.mutations.jobs.createQuick, { ...auth, ...s.base, newProperty: { address: "4 Main", type: "residential" }, contact: { name: "Jane" }, customerChargeCents: 10000 });
    await s.t.run(ctx => ctx.db.patch(id, { cleanerIds: [s.cleanerId] }));
    const propertyId = (await s.t.run(ctx => ctx.db.get(id)))!.propertyId!;
    const otherId = await s.t.run(ctx => ctx.db.insert("properties", { companyId: s.companyId, name: "Other", address: "5 Main", type: "residential", amenities: [], active: true }));
    const worker = { userId: s.cleanerId, sessionToken: s.cleanerAuth.sessionToken, companyId: s.companyId, jobId: id, category: "damage" as const, severity: "low" as const, note: "Issue" };
    await expect(s.t.mutation(api.mutations.redFlags.create, { ...worker, propertyId: otherId })).rejects.toThrow("does not match");
    await s.t.mutation(api.mutations.redFlags.create, { ...worker, propertyId });
    const shown = await s.t.query(api.queries.jobs.get, { userId: s.cleanerId, sessionToken: s.cleanerAuth.sessionToken, jobId: id });
    expect(shown).not.toHaveProperty("customerChargeCents");
    expect(shown).not.toHaveProperty("serviceContactSnapshot");
    expect(shown?.property).not.toHaveProperty("contactName");
  });
});
