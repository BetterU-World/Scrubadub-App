import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

function backend() {
  return convexTest(schema, modules);
}

async function seedCompany(t: ReturnType<typeof backend>, suffix: string, role = "owner") {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: `Company ${suffix}`, timezone: "America/New_York" });
    const userId = await ctx.db.insert("users", {
      email: `${role}-${suffix}@example.com`, passwordHash, name: suffix,
      companyId, role: role as any, status: "active",
    });
    return { companyId, userId };
  });
}

async function seedClient(t: ReturnType<typeof backend>, companyId: any, suffix: string) {
  return await t.run((ctx) => ctx.db.insert("clientRelationships", {
    companyId, displayName: `Client ${suffix}`, clientType: "residential",
    status: "active", createdAt: 1, updatedAt: 1,
  }));
}

async function seedLead(t: ReturnType<typeof backend>, companyId: any, suffix: string, clientRelationshipId?: any, propertyId?: any) {
  return await t.run((ctx) => ctx.db.insert("clientRequests", {
    companyId, clientRelationshipId, propertyId, createdAt: 1, status: "new",
    requesterName: suffix, requesterEmail: `${suffix}@example.com`, propertySnapshot: {}, source: "manual",
  }));
}

async function seedProperty(t: ReturnType<typeof backend>, companyId: any, suffix: string, clientRelationshipId?: any) {
  return await t.run((ctx) => ctx.db.insert("properties", {
    companyId, clientRelationshipId, name: suffix, type: "residential",
    address: `${suffix} St`, amenities: [], active: true,
  }));
}

async function diagnostic(t: ReturnType<typeof backend>, userId: any) {
  const email = await t.run(async (ctx) => (await ctx.db.get(userId))!.email);
  const auth = await t.action(api.authActions.signIn, { email, password: PASSWORD });
  return await t.query(api.queries.relationshipDiagnostics.getSummary, {
    userId,
    sessionToken: auth.sessionToken,
  });
}

function sample(result: any, entity: string, recordId: any) {
  return result.entities[entity].samples.find((finding: any) => finding.recordId === recordId);
}

describe("historical relationship diagnostics", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("classifies a valid directly linked record as Healthy", async () => {
    const t = backend();
    const { companyId, userId } = await seedCompany(t, "healthy");
    const clientId = await seedClient(t, companyId, "healthy");
    await seedProperty(t, companyId, "healthy", clientId);

    const result = await diagnostic(t, userId);
    expect(result.entities.properties.counts.healthy).toBe(1);
    expect(result.entities.properties.samples).toEqual([]);
  });

  it("classifies a standalone Property as Intentionally Unlinked", async () => {
    const t = backend();
    const { companyId, userId } = await seedCompany(t, "unlinked");
    await seedProperty(t, companyId, "unlinked");

    const result = await diagnostic(t, userId);
    expect(result.entities.properties.counts.intentionally_unlinked).toBe(1);
    expect(result.entities.properties.counts.historical_omission).toBe(0);
  });

  it("finds a Lead-linked Property with one missing Client", async () => {
    const t = backend();
    const { companyId, userId } = await seedCompany(t, "lead-property");
    const clientId = await seedClient(t, companyId, "lead-property");
    const propertyId = await seedProperty(t, companyId, "lead-property");
    const leadId = await seedLead(t, companyId, "lead-property", clientId, propertyId);

    const finding = sample(await diagnostic(t, userId), "properties", propertyId);
    expect(finding).toMatchObject({
      classification: "historical_omission",
      reasonCode: "lead_property_missing_client",
      candidateClientRelationshipId: clientId,
      sourceIds: [leadId],
    });
  });

  it("finds a historical calendar Job omission from its creation source", async () => {
    const t = backend();
    const { companyId, userId } = await seedCompany(t, "calendar");
    const clientId = await seedClient(t, companyId, "calendar");
    const propertyId = await seedProperty(t, companyId, "calendar", clientId);
    const jobId = await t.run((ctx) => ctx.db.insert("jobs", {
      companyId, propertyId, cleanerIds: [], type: "standard", status: "scheduled",
      scheduledDate: "2030-01-01", durationMinutes: 60, reworkCount: 0, source: "calendar_sync",
    }));

    expect(sample(await diagnostic(t, userId), "jobs", jobId)).toMatchObject({
      classification: "historical_omission",
      reasonCode: "calendar_job_missing_client",
      candidateClientRelationshipId: clientId,
    });
  });

  it("finds a historical Red Flag maintenance Job omission from its source", async () => {
    const t = backend();
    const { companyId, userId } = await seedCompany(t, "red-flag");
    const clientId = await seedClient(t, companyId, "red-flag");
    const propertyId = await seedProperty(t, companyId, "red-flag", clientId);
    const sourceJobId = await t.run((ctx) => ctx.db.insert("jobs", {
      companyId, propertyId, clientRelationshipId: clientId, cleanerIds: [], type: "standard", status: "approved",
      scheduledDate: "2030-01-01", durationMinutes: 60, reworkCount: 0,
    }));
    const maintenanceJobId = await t.run((ctx) => ctx.db.insert("jobs", {
      companyId, propertyId, cleanerIds: [], type: "maintenance", status: "scheduled",
      scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0,
    }));
    await t.run((ctx) => ctx.db.insert("redFlags", {
      companyId, propertyId, jobId: sourceJobId, maintenanceJobId,
      category: "maintenance", severity: "high", note: "Repair", status: "in_progress",
    }));

    expect(sample(await diagnostic(t, userId), "jobs", maintenanceJobId)).toMatchObject({
      classification: "historical_omission",
      reasonCode: "red_flag_job_missing_client",
      candidateClientRelationshipId: clientId,
    });
  });

  it("finds a pipeline record with one consistent source Client", async () => {
    const t = backend();
    const { companyId, userId } = await seedCompany(t, "pipeline");
    const clientId = await seedClient(t, companyId, "pipeline");
    const leadId = await seedLead(t, companyId, "pipeline", clientId);
    const proposalId = await t.run((ctx) => ctx.db.insert("proposals", {
      companyId, clientRequestId: leadId, createdByUserId: userId, title: "Historical",
      clientName: "Client", status: "draft", createdAt: 1, updatedAt: 1,
    }));

    expect(sample(await diagnostic(t, userId), "proposals", proposalId)).toMatchObject({
      classification: "historical_omission",
      reasonCode: "pipeline_missing_client",
      candidateClientRelationshipId: clientId,
    });
  });

  it("classifies conflicting authoritative sources as Needs Review", async () => {
    const t = backend();
    const { companyId, userId } = await seedCompany(t, "conflict");
    const clientA = await seedClient(t, companyId, "conflict-a");
    const clientB = await seedClient(t, companyId, "conflict-b");
    const leadId = await seedLead(t, companyId, "conflict", clientA);
    const proposalId = await t.run((ctx) => ctx.db.insert("proposals", {
      companyId, clientRelationshipId: clientB, clientRequestId: leadId, createdByUserId: userId,
      title: "Conflict", clientName: "Client", status: "draft", createdAt: 1, updatedAt: 1,
    }));
    const walkthroughId = await t.run((ctx) => ctx.db.insert("walkthroughs", {
      companyId, clientRequestId: leadId, proposalId, title: "Conflict", walkthroughType: "residential",
      status: "draft", createdAt: 1, updatedAt: 1,
    }));

    const finding = sample(await diagnostic(t, userId), "walkthroughs", walkthroughId);
    expect(finding.classification).toBe("needs_review");
    expect(finding.reasonCode).toBe("conflicting_clients");
    expect(new Set(finding.conflictingClientRelationshipIds)).toEqual(new Set([clientA, clientB]));
  });

  it("never uses a cross-company candidate", async () => {
    const t = backend();
    const local = await seedCompany(t, "local");
    const foreign = await seedCompany(t, "foreign");
    const foreignClient = await seedClient(t, foreign.companyId, "foreign");
    const propertyId = await seedProperty(t, local.companyId, "foreign-reference", foreignClient);

    const finding = sample(await diagnostic(t, local.userId), "properties", propertyId);
    expect(finding).toMatchObject({ classification: "needs_review", reasonCode: "cross_company_evidence" });
    expect(finding.candidateClientRelationshipId).toBeUndefined();
  });

  it("reports a dangling direct Client safely", async () => {
    const t = backend();
    const { companyId, userId } = await seedCompany(t, "dangling");
    const deletedClientId = await seedClient(t, companyId, "deleted");
    const propertyId = await seedProperty(t, companyId, "dangling", deletedClientId);
    await t.run((ctx) => ctx.db.delete(deletedClientId));

    expect(sample(await diagnostic(t, userId), "properties", propertyId)).toMatchObject({
      classification: "needs_review", reasonCode: "dangling_client",
    });
  });

  it("never modifies an existing non-empty Client ID", async () => {
    const t = backend();
    const { companyId, userId } = await seedCompany(t, "preserve");
    const clientA = await seedClient(t, companyId, "preserve-a");
    const clientB = await seedClient(t, companyId, "preserve-b");
    const propertyId = await seedProperty(t, companyId, "preserve", clientA);
    await seedLead(t, companyId, "preserve", clientB, propertyId);

    await diagnostic(t, userId);
    const property = await t.run((ctx) => ctx.db.get(propertyId));
    expect(property?.clientRelationshipId).toBe(clientA);
  });

  it("rejects non-owners and never exposes another company's records", async () => {
    const t = backend();
    const owner = await seedCompany(t, "owner");
    const worker = await seedCompany(t, "worker", "cleaner");
    const clientId = await seedClient(t, owner.companyId, "private");
    await seedProperty(t, owner.companyId, "private", clientId);

    await expect(diagnostic(t, worker.userId)).rejects.toThrow("Owner session required");
    const otherOwner = await seedCompany(t, "other-owner");
    const result = await diagnostic(t, otherOwner.userId);
    expect(result.entities.properties.counts.healthy).toBe(0);
  });

  it("performs no database writes", async () => {
    const t = backend();
    const { companyId, userId } = await seedCompany(t, "read-only");
    const clientId = await seedClient(t, companyId, "read-only");
    const propertyId = await seedProperty(t, companyId, "read-only");
    await seedLead(t, companyId, "read-only", clientId, propertyId);
    const before = await t.run(async (ctx) => ({
      property: await ctx.db.get(propertyId),
      auditCount: (await ctx.db.query("auditLog").collect()).length,
    }));

    await diagnostic(t, userId);
    const after = await t.run(async (ctx) => ({
      property: await ctx.db.get(propertyId),
      auditCount: (await ctx.db.query("auditLog").collect()).length,
    }));
    expect(after).toEqual(before);
  });
});
