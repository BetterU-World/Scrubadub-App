import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");

beforeEach(() => {
  process.env.TOKEN_PEPPER = "test-token-pepper";
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.APP_URL = "http://localhost:5173";
});

async function seedCompany(t: ReturnType<typeof convexTest>, suffix: string) {
  const passwordHash = await hashPassword("test-password-123");
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: `Company ${suffix}`,
      timezone: "America/New_York",
    });
    const ownerId = await ctx.db.insert("users", {
      email: `owner-${suffix}@example.com`,
      passwordHash,
      name: `Owner ${suffix}`,
      companyId,
      role: "owner",
      status: "active",
    });
    return { companyId, ownerId };
  });
}

async function seedClient(
  t: ReturnType<typeof convexTest>,
  companyId: any,
  suffix: string,
  email = `client-${suffix}@example.com`
) {
  return await t.run((ctx) => ctx.db.insert("clientRelationships", {
    companyId,
    displayName: `Client ${suffix}`,
    clientType: "residential",
    email,
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

async function seedProperty(
  t: ReturnType<typeof convexTest>,
  companyId: any,
  suffix: string,
  clientRelationshipId?: any
) {
  return await t.run((ctx) => ctx.db.insert("properties", {
    companyId,
    clientRelationshipId,
    name: `Property ${suffix}`,
    type: "residential",
    address: `${suffix} Main St`,
    amenities: [],
    active: true,
  }));
}

async function seedLead(
  t: ReturnType<typeof convexTest>,
  companyId: any,
  suffix: string,
  options: { propertyId?: any; clientRelationshipId?: any; email?: string } = {}
) {
  return await t.run((ctx) => ctx.db.insert("clientRequests", {
    companyId,
    clientRelationshipId: options.clientRelationshipId,
    propertyId: options.propertyId,
    createdAt: Date.now(),
    status: "new",
    requesterName: `Lead ${suffix}`,
    requesterEmail: options.email ?? `lead-${suffix}@example.com`,
    propertySnapshot: { name: `Property ${suffix}`, address: `${suffix} Main St` },
    source: "manual",
    leadType: "residential",
    leadStage: "new",
  }));
}

async function createWalkthrough(t: ReturnType<typeof convexTest>, ownerId: any, leadId: any) {
  const owner = await t.run((ctx) => ctx.db.get(ownerId));
  const auth = await t.action(api.authActions.signIn, {
    email: owner!.email,
    password: "test-password-123",
  });
  return await t.mutation(api.mutations.walkthroughs.createFromClientRequest, {
    userId: ownerId,
    sessionToken: auth.sessionToken,
    clientRequestId: leadId,
    scheduledDate: "2030-01-10",
    scheduledStartTime: "09:00",
  });
}

async function seedCalendarSource(
  t: ReturnType<typeof convexTest>,
  companyId: any,
  ownerId: any,
  propertyId: any,
  suffix: string
) {
  return await t.run(async (ctx) => {
    const connectionId = await ctx.db.insert("calendarConnections", {
      companyId,
      propertyId,
      platform: "airbnb",
      icalUrl: `https://example.com/${suffix}.ics`,
      enabled: true,
      lastSyncStatus: "pending",
      initialSyncCutoff: "2029-12-31",
      consecutiveErrors: 0,
      createdAt: Date.now(),
      createdBy: ownerId,
    });
    await ctx.db.insert("jobAutomationRules", {
      companyId,
      propertyId,
      enabled: true,
      jobType: "turnover",
      defaultDurationMinutes: 120,
    });
    return connectionId;
  });
}

describe("relationship propagation", () => {
  it("creates a Client for a Lead, backfills its empty Property, and preserves proposal propagation", async () => {
    const t = convexTest(schema, modules);
    const { companyId, ownerId } = await seedCompany(t, "lead-create");
    const propertyId = await seedProperty(t, companyId, "lead-create");
    const leadId = await seedLead(t, companyId, "lead-create", { propertyId });

    const walkthroughId = await createWalkthrough(t, ownerId, leadId);
    const auth = await t.action(api.authActions.signIn, {
      email: "owner-lead-create@example.com",
      password: "test-password-123",
    });
    const proposalId = await t.mutation(api.mutations.proposals.createProposalFromLead, {
      userId: ownerId,
      sessionToken: auth.sessionToken,
      clientRequestId: leadId,
    });

    const result = await t.run(async (ctx) => ({
      lead: await ctx.db.get(leadId),
      property: await ctx.db.get(propertyId),
      walkthrough: await ctx.db.get(walkthroughId),
      proposal: await ctx.db.get(proposalId),
    }));
    expect(result.lead?.clientRelationshipId).toBeDefined();
    expect(result.property?.clientRelationshipId).toBe(result.lead?.clientRelationshipId);
    expect(result.walkthrough?.clientRelationshipId).toBe(result.lead?.clientRelationshipId);
    expect(result.walkthrough?.propertyId).toBe(propertyId);
    expect(result.proposal?.clientRelationshipId).toBe(result.lead?.clientRelationshipId);
  });

  it("reuses a company-scoped Client and backfills the linked Property", async () => {
    const t = convexTest(schema, modules);
    const { companyId, ownerId } = await seedCompany(t, "lead-reuse");
    const email = "existing@example.com";
    const clientId = await seedClient(t, companyId, "existing", email);
    const propertyId = await seedProperty(t, companyId, "lead-reuse");
    const leadId = await seedLead(t, companyId, "lead-reuse", { propertyId, email });

    await createWalkthrough(t, ownerId, leadId);
    const result = await t.run(async (ctx) => ({
      lead: await ctx.db.get(leadId),
      property: await ctx.db.get(propertyId),
    }));
    expect(result.lead?.clientRelationshipId).toBe(clientId);
    expect(result.property?.clientRelationshipId).toBe(clientId);
  });

  it("never overwrites a non-empty Property Client", async () => {
    const t = convexTest(schema, modules);
    const { companyId, ownerId } = await seedCompany(t, "no-overwrite");
    const existingClientId = await seedClient(t, companyId, "property-owner");
    const propertyId = await seedProperty(t, companyId, "no-overwrite", existingClientId);
    const leadId = await seedLead(t, companyId, "no-overwrite", { propertyId });

    await createWalkthrough(t, ownerId, leadId);
    const result = await t.run(async (ctx) => ({
      lead: await ctx.db.get(leadId),
      property: await ctx.db.get(propertyId),
    }));
    expect(result.lead?.clientRelationshipId).not.toBe(existingClientId);
    expect(result.property?.clientRelationshipId).toBe(existingClientId);
  });

  it("does not propagate cross-company Property or Client relationships", async () => {
    const t = convexTest(schema, modules);
    const companyA = await seedCompany(t, "cross-a");
    const companyB = await seedCompany(t, "cross-b");
    const foreignPropertyId = await seedProperty(t, companyB.companyId, "foreign-property");
    const leadWithForeignProperty = await seedLead(t, companyA.companyId, "foreign-property", {
      propertyId: foreignPropertyId,
    });

    await createWalkthrough(t, companyA.ownerId, leadWithForeignProperty);
    const foreignProperty = await t.run((ctx) => ctx.db.get(foreignPropertyId));
    expect(foreignProperty?.clientRelationshipId).toBeUndefined();

    const foreignClientId = await seedClient(t, companyB.companyId, "foreign-client");
    const localPropertyId = await seedProperty(t, companyA.companyId, "local-property");
    const leadWithForeignClient = await seedLead(t, companyA.companyId, "foreign-client", {
      propertyId: localPropertyId,
      clientRelationshipId: foreignClientId,
    });
    await expect(createWalkthrough(t, companyA.ownerId, leadWithForeignClient)).rejects.toThrow(
      "lead's company"
    );
    const localProperty = await t.run((ctx) => ctx.db.get(localPropertyId));
    expect(localProperty?.clientRelationshipId).toBeUndefined();
  });

  it.each([true, false])("calendar-sync Job snapshots an optional Property Client (%s)", async (linked) => {
    const t = convexTest(schema, modules);
    const { companyId, ownerId } = await seedCompany(t, `calendar-${linked}`);
    const clientId = linked ? await seedClient(t, companyId, `calendar-${linked}`) : undefined;
    const propertyId = await seedProperty(t, companyId, `calendar-${linked}`, clientId);
    const connectionId = await seedCalendarSource(t, companyId, ownerId, propertyId, String(linked));

    await t.mutation(internal.mutations.calendarSync.processSyncResults, {
      connectionId,
      reservations: [{
        uid: `reservation-${linked}`,
        checkIn: "2030-01-09",
        checkOut: "2030-01-10",
        rawHash: `hash-${linked}`,
      }],
      totalEvents: 1,
      skipped: 0,
    });
    const job = await t.run((ctx) => ctx.db.query("jobs").first());
    expect(job).not.toBeNull();
    expect(job?.propertyId).toBe(propertyId);
    expect(job?.clientRelationshipId).toBe(clientId);
  });

  it.each([true, false])("Red Flag maintenance Job snapshots an optional Property Client (%s)", async (linked) => {
    const t = convexTest(schema, modules);
    const { companyId, ownerId } = await seedCompany(t, `maintenance-${linked}`);
    const clientId = linked ? await seedClient(t, companyId, `maintenance-${linked}`) : undefined;
    const propertyId = await seedProperty(t, companyId, `maintenance-${linked}`, clientId);
    const flagId = await t.run(async (ctx) => {
      const sourceJobId = await ctx.db.insert("jobs", {
        companyId,
        propertyId,
        cleanerIds: [],
        type: "standard",
        status: "approved",
        scheduledDate: "2030-01-01",
        durationMinutes: 60,
        reworkCount: 0,
      });
      return await ctx.db.insert("redFlags", {
        companyId,
        propertyId,
        jobId: sourceJobId,
        category: "maintenance",
        severity: "medium",
        note: "Repair needed",
        status: "open",
      });
    });

    const auth = await t.action(api.authActions.signIn, {
      email: `owner-maintenance-${linked}@example.com`,
      password: "test-password-123",
    });
    const maintenanceJobId = await t.mutation(api.mutations.redFlags.createMaintenanceJob, {
      userId: ownerId,
      sessionToken: auth.sessionToken,
      flagId,
      scheduledDate: "2030-01-12",
      cleanerIds: [],
    });
    const job = await t.run((ctx) => ctx.db.get(maintenanceJobId));
    expect(job?.propertyId).toBe(propertyId);
    expect(job?.clientRelationshipId).toBe(clientId);
  });

  it("does not rewrite a historical Job after later Property relinking", async () => {
    const t = convexTest(schema, modules);
    const { companyId } = await seedCompany(t, "history");
    const originalClientId = await seedClient(t, companyId, "history-original");
    const replacementClientId = await seedClient(t, companyId, "history-replacement");
    const propertyId = await seedProperty(t, companyId, "history", originalClientId);
    const jobId = await t.run((ctx) => ctx.db.insert("jobs", {
      companyId,
      clientRelationshipId: originalClientId,
      propertyId,
      cleanerIds: [],
      type: "standard",
      status: "scheduled",
      scheduledDate: "2030-01-15",
      durationMinutes: 60,
      reworkCount: 0,
    }));

    await t.run((ctx) => ctx.db.patch(propertyId, { clientRelationshipId: replacementClientId }));
    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(job?.clientRelationshipId).toBe(originalClientId);
  });
});
