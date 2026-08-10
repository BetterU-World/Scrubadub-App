import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const backend = () => convexTest(schema, modules);

async function seed(t: ReturnType<typeof backend>, tier: any = "scrub_pro") {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Role Co", timezone: "America/New_York", tier });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { email: "owner@roles.test", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
    const otherOwnerId = await ctx.db.insert("users", { email: "other@roles.test", passwordHash, name: "Other", companyId: otherCompanyId, role: "owner", status: "active" });
    const workerId = await ctx.db.insert("users", {
      email: "worker@roles.test", passwordHash, name: "Worker", companyId, role: "cleaner", status: "active",
      stripeConnectAccountId: "acct_preserved", stripeConnectOnboardingStatus: "complete", stripeConnectPayoutsEnabled: true,
    });
    const profileId = await ctx.db.insert("workerProfiles", {
      companyId, userId: workerId, workerType: "contractor_1099", workerStatus: "active", primaryRole: "cleaner",
      eligibleRoles: ["cleaner"], onboardingStatus: "complete", jobEligibilityStatus: "eligible",
      payProfile: { payType: "per_job", defaultRateCents: 5000, currency: "usd", stripeConnectEnabled: true, stripeConnectUserFieldSource: "users" },
      createdAt: 1, updatedAt: 1,
    });
    const propertyId = await ctx.db.insert("properties", { companyId, name: "Home", type: "residential", address: "1 Main", amenities: [], active: true });
    const jobId = await ctx.db.insert("jobs", { companyId, propertyId, cleanerIds: [workerId], assignedManagerId: workerId, type: "standard", status: "scheduled", scheduledDate: "2030-01-01", durationMinutes: 60, reworkCount: 0 });
    const paymentId = await ctx.db.insert("cleanerPayments", { companyId, jobId, cleanerUserId: workerId, amountCents: 5000, status: "OPEN", createdAt: 1 });
    const availabilityId = await ctx.db.insert("cleanerAvailability", { cleanerId: workerId, dayOfWeek: 1, startMinutes: 480, endMinutes: 1020, enabled: true });
    const documentId = await ctx.db.insert("workerDocuments", { companyId, workerProfileId: profileId, userId: workerId, documentType: "training_record", status: "reviewed", required: true, handledOffPlatform: true, createdAt: 1, updatedAt: 1 });
    const teamId = await ctx.db.insert("teams", { companyId, name: "Team", active: true, createdBy: ownerId, createdAt: 1, updatedAt: 1 });
    const membershipId = await ctx.db.insert("teamMembers", { companyId, teamId, userId: workerId, role: "member", active: true, addedAt: 1 });
    return { companyId, otherCompanyId, ownerId, otherOwnerId, workerId, profileId, jobId, paymentId, availabilityId, documentId, teamId, membershipId };
  });
}

async function login(t: ReturnType<typeof backend>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

describe("worker operational role management", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "role-management-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("supports all six transitions atomically while preserving identity-linked records and the active session", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner@roles.test");
    const worker = await login(t, "worker@roles.test");
    const sequence = ["manager", "maintenance", "cleaner", "maintenance", "manager", "cleaner"] as const;

    for (const role of sequence) {
      await expect(t.mutation((api as any).mutations.workers.changeOperationalRole, {
        userId: s.ownerId, sessionToken: owner.sessionToken, workerUserId: s.workerId, role,
      })).resolves.toMatchObject({ changed: true, role });
      await expect(t.query(api.authQueries.getCurrentUser, { sessionToken: worker.sessionToken })).resolves.toMatchObject({ _id: s.workerId, role });
      const state: any = await t.run(async (ctx) => ({
        user: await ctx.db.get(s.workerId), profile: await ctx.db.get(s.profileId), job: await ctx.db.get(s.jobId),
        payment: await ctx.db.get(s.paymentId), availability: await ctx.db.get(s.availabilityId), document: await ctx.db.get(s.documentId), membership: await ctx.db.get(s.membershipId),
      }));
      expect(state.user).toMatchObject({ role, stripeConnectAccountId: "acct_preserved", stripeConnectPayoutsEnabled: true });
      expect(state.profile).toMatchObject({ primaryRole: role, workerType: "contractor_1099", onboardingStatus: "complete", jobEligibilityStatus: "eligible" });
      expect(state.profile.eligibleRoles).toContain(role);
      expect(state.job.cleanerIds).toContain(s.workerId);
      expect(state.job.assignedManagerId).toBe(s.workerId);
      expect(state.payment.cleanerUserId).toBe(s.workerId);
      expect(state.availability.cleanerId).toBe(s.workerId);
      expect(state.document.workerProfileId).toBe(s.profileId);
      expect(state.membership).toMatchObject({ userId: s.workerId, active: true });
      for (const permission of [
        "canSeeAllJobs", "canManageClients", "canManageSalesAndCommercial", "canManageTeam",
        "canViewFinancials", "canManageInvoices", "canManageDocuments", "canViewAnalytics",
      ]) {
        if (role === "manager") expect(state.user[permission]).toBe(false);
        else expect(state.user[permission]).toBeUndefined();
      }
    }

    const audits = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audits.filter((event) => event.action === "change_worker_operational_role")).toHaveLength(6);
  });

  it("creates and synchronizes a missing profile without changing invitation state", async () => {
    const t = backend(); const s = await seed(t); const owner = await login(t, "owner@roles.test");
    const pendingId = await t.run((ctx) => ctx.db.insert("users", {
      email: "pending@roles.test", passwordHash: "", name: "Pending", companyId: s.companyId, role: "maintenance", status: "pending",
      invitationStatus: "pending", inviteTokenHash: "hash", inviteTokenExpiry: Date.now() + 60_000,
    }));
    await t.mutation((api as any).mutations.workers.changeOperationalRole, { userId: s.ownerId, sessionToken: owner.sessionToken, workerUserId: pendingId, role: "manager" });
    const state: any = await t.run(async (ctx) => ({ user: await ctx.db.get(pendingId), profiles: await ctx.db.query("workerProfiles").withIndex("by_userId", q => q.eq("userId", pendingId)).collect() }));
    expect(state.user).toMatchObject({ role: "manager", status: "pending", invitationStatus: "pending", inviteTokenHash: "hash" });
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]).toMatchObject({ primaryRole: "manager", workerStatus: "pending" });
  });

  it("rejects non-owners, cross-company targets, owner targets, and unsupported namespaces", async () => {
    const t = backend(); const s = await seed(t);
    const owner = await login(t, "owner@roles.test"); const worker = await login(t, "worker@roles.test"); const other = await login(t, "other@roles.test");
    await expect(t.mutation((api as any).mutations.workers.changeOperationalRole, { userId: s.workerId, sessionToken: worker.sessionToken, workerUserId: s.workerId, role: "manager" })).rejects.toThrow("Owner session required");
    await expect(t.mutation((api as any).mutations.workers.changeOperationalRole, { userId: s.otherOwnerId, sessionToken: other.sessionToken, workerUserId: s.workerId, role: "manager" })).rejects.toThrow("Worker user not found");
    await expect(t.mutation((api as any).mutations.workers.changeOperationalRole, { userId: s.ownerId, sessionToken: owner.sessionToken, workerUserId: s.ownerId, role: "manager" })).rejects.toThrow("Only cleaners");
  });

  it("enforces the existing active-cleaner plan cap", async () => {
    const t = backend(); const s = await seed(t, "scrub_solo"); const owner = await login(t, "owner@roles.test");
    const maintenanceId = await t.run((ctx) => ctx.db.insert("users", { email: "maintenance@roles.test", passwordHash: "hash", name: "Maintenance", companyId: s.companyId, role: "maintenance", status: "active" }));
    await expect(t.mutation((api as any).mutations.workers.changeOperationalRole, { userId: s.ownerId, sessionToken: owner.sessionToken, workerUserId: maintenanceId, role: "cleaner" })).rejects.toThrow("cleaner limit");
    await expect(t.run((ctx) => ctx.db.get(maintenanceId))).resolves.toMatchObject({ role: "maintenance" });
  });
});
