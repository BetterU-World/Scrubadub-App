import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

beforeEach(() => {
  process.env.TOKEN_PEPPER = "recurring-add-on-pepper";
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.APP_URL = "http://localhost:5173";
});

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Schedule Co", timezone: "America/New_York", subscriptionStatus: "active" });
    const partnerCompanyId = await ctx.db.insert("companies", { name: "Partner Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { email: "schedule-owner@test.dev", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
    const cleanerId = await ctx.db.insert("users", { email: "schedule-cleaner@test.dev", passwordHash, name: "Cleaner", companyId, role: "cleaner", status: "active" });
    const partnerOwnerId = await ctx.db.insert("users", { email: "partner-owner", passwordHash, name: "Partner", companyId: partnerCompanyId, role: "owner", status: "active" });
    const relationshipId = await ctx.db.insert("clientRelationships", { companyId, displayName: "Commercial Client", clientType: "commercial", status: "active", createdAt: 1, updatedAt: 1 });
    const propertyId = await ctx.db.insert("properties", { companyId, clientRelationshipId: relationshipId, name: "Office", type: "commercial", address: "1 Work Way", amenities: [], active: true });
    const requestId = await ctx.db.insert("clientRequests", { companyId, clientRelationshipId: relationshipId, propertyId, createdAt: 1, status: "accepted", requesterName: "Client", requesterEmail: "client@test.dev", propertySnapshot: {}, source: "manual", leadType: "commercial", leadStage: "accepted" });
    const proposalId = await ctx.db.insert("proposals", {
      companyId, clientRelationshipId: relationshipId, clientRequestId: requestId, createdByUserId: ownerId, title: "Accepted", clientName: "Client", status: "accepted", monthlyPriceCents: 10000,
      addOnLineItems: [
        { lineItemId: "every", sourceType: "custom", name: "Restock soap", pricingMethod: "flat", unitPriceCents: 500, billingCadence: "monthly" },
        { lineItemId: "first", sourceType: "custom", name: "Initial setup", pricingMethod: "flat", unitPriceCents: 2500, billingCadence: "one_time" },
      ], createdAt: 1, updatedAt: 1,
    });
    const accountId = await ctx.db.insert("commercialAccounts", { companyId, clientRelationshipId: relationshipId, clientRequestId: requestId, sourceProposalId: proposalId, clientName: "Commercial Client", status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("ownerConnections", { companyAId: companyId, companyBId: partnerCompanyId, initiatorCompanyId: companyId, status: "active", createdAt: 1 });
    return { companyId, partnerCompanyId, ownerId, cleanerId, partnerOwnerId, relationshipId, propertyId, proposalId, accountId };
  });
  const ownerSession = await t.action(api.authActions.signIn, { email: "schedule-owner@test.dev", password: PASSWORD });
  const cleanerSession = await t.action(api.authActions.signIn, { email: "schedule-cleaner@test.dev", password: PASSWORD });
  return { t, ...ids, ownerAuth: { userId: ids.ownerId, sessionToken: ownerSession.sessionToken }, cleanerAuth: { userId: ids.cleanerId, sessionToken: cleanerSession.sessionToken } };
}

async function createSchedule(s: Awaited<ReturnType<typeof setup>>, addOnSelections?: any[]) {
  return await s.t.mutation(api.mutations.commercialSchedules.create, {
    ...s.ownerAuth, commercialAccountId: s.accountId, propertyId: s.propertyId, title: "Weekly", frequency: "weekly", daysOfWeek: [1], startDate: "2030-01-07", assignedCleanerId: s.cleanerId, addOnSelections,
  });
}

describe("recurring schedule and shared-job add-on propagation", () => {
  it("copies schedule-owned snapshots and applies first-job work exactly once out of order", async () => {
    const s = await setup();
    const scheduleId = await createSchedule(s, [
      { sourceProposalLineItemId: "every", executionApplicability: "every_job" },
      { sourceProposalLineItemId: "first", executionApplicability: "first_job" },
    ]);
    await s.t.run((ctx) => ctx.db.patch(s.proposalId, { addOnLineItems: [] }));

    await s.t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, { ...s.ownerAuth, commercialScheduleId: scheduleId, startDate: "2030-01-14", endDate: "2030-01-21" });
    let jobs: any[] = await s.t.run((ctx) => ctx.db.query("jobs").withIndex("by_commercialSchedule", (q) => q.eq("commercialScheduleId", scheduleId)).collect());
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.acceptedProposalAddOnSnapshots.map((item: any) => item.name).join() === "Restock soap")).toBe(true);

    await s.t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, { ...s.ownerAuth, commercialScheduleId: scheduleId, startDate: "2030-01-07", endDate: "2030-01-21" });
    await s.t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, { ...s.ownerAuth, commercialScheduleId: scheduleId, startDate: "2030-01-07", endDate: "2030-01-07" });
    jobs = await s.t.run((ctx) => ctx.db.query("jobs").withIndex("by_commercialSchedule", (q) => q.eq("commercialScheduleId", scheduleId)).collect());
    const firstJobs = jobs.filter((job) => job.acceptedProposalAddOnSnapshots?.some((item: any) => item.executionApplicability === "first_job"));
    expect(jobs).toHaveLength(3);
    expect(firstJobs).toHaveLength(1);
    expect(firstJobs[0].scheduledDate).toBe("2030-01-07");
    const schedule: any = await s.t.run((ctx) => ctx.db.get(scheduleId));
    expect(schedule.firstJobAddOnsAppliedToJobId).toBe(firstJobs[0]._id);
    expect(schedule.acceptedProposalAddOnSnapshots).toHaveLength(2);
  });

  it("keeps legacy schedules empty and requires deliberate, valid applicability", async () => {
    const s = await setup();
    const legacyId = await createSchedule(s);
    await s.t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, { ...s.ownerAuth, commercialScheduleId: legacyId, startDate: "2030-01-07", endDate: "2030-01-07" });
    const legacyJob: any = (await s.t.run((ctx) => ctx.db.query("jobs").collect()))[0];
    expect(legacyJob.acceptedProposalAddOnSnapshots).toBeUndefined();
    await expect(createSchedule(s, [{ sourceProposalLineItemId: "missing", executionApplicability: "every_job" }])).rejects.toThrow("accepted proposal");
    expect((await s.t.run((ctx) => ctx.db.query("commercialSchedules").collect()))).toHaveLength(1);
  });

  it("sanitizes add-ons across company boundaries while preserving shared job traceability", async () => {
    const s = await setup();
    const scheduleId = await createSchedule(s, [{ sourceProposalLineItemId: "every", executionApplicability: "every_job" }]);
    await s.t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, { ...s.ownerAuth, commercialScheduleId: scheduleId, startDate: "2030-01-07", endDate: "2030-01-07" });
    const original: any = (await s.t.run((ctx) => ctx.db.query("jobs").collect()))[0];
    const shared = await s.t.mutation(api.mutations.partners.shareJob, { ...s.ownerAuth, jobId: original._id, toCompanyId: s.partnerCompanyId, sharePackage: false });
    const copied: any = await s.t.run((ctx) => ctx.db.get(shared.copiedJobId));
    expect(copied.sharedFromJobId).toBe(original._id);
    expect(copied.requiredAddOnSnapshots[0]).toMatchObject({ name: "Restock soap", executionRequirement: "every_job" });
    expect(copied.acceptedProposalAddOnSnapshots).toBeUndefined();
    expect(copied.sourceProposalId).toBeUndefined();
    expect(JSON.stringify(copied.requiredAddOnSnapshots)).not.toMatch(/price|source|billing/i);
  });

  it("keeps worker projections operational, localized, accessible, and responsive", async () => {
    const s = await setup();
    const scheduleId = await createSchedule(s, [{ sourceProposalLineItemId: "every", executionApplicability: "every_job" }]);
    await s.t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, { ...s.ownerAuth, commercialScheduleId: scheduleId, startDate: "2030-01-07", endDate: "2030-01-07" });
    const job: any = (await s.t.run((ctx) => ctx.db.query("jobs").collect()))[0];
    const worker: any = await s.t.query(api.queries.jobs.get, { ...s.cleanerAuth, jobId: job._id });
    expect(worker.requiredAddOns[0]).toEqual(expect.objectContaining({ name: "Restock soap", executionRequirement: "every_job" }));
    expect(JSON.stringify(worker)).not.toMatch(/unitPriceCents|sourceProposalLineItemId|sourceCompanyAddOnId/);

    const component = readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/components/AddOnSnapshotList.tsx", import.meta.url)), "utf8");
    const en = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/i18n/en/common.json", import.meta.url)), "utf8"));
    const es = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/i18n/es/common.json", import.meta.url)), "utf8"));
    expect(component).toContain("aria-labelledby");
    expect(component).toContain("sm:flex-row");
    expect(en.addOnPropagation.every_job).toBeTruthy();
    expect(es.addOnPropagation.first_job).toBeTruthy();
  });
});
