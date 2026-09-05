import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { assertQaFixtureEnvironment, QA_FIXTURE_KEY, QA_PERSONAS, QA_PUBLIC_PROPOSAL_TOKEN } from "../qaFixture";

const modules = import.meta.glob("../../**/*.ts");
const seed = makeFunctionReference<"action">("qaFixtures:seed");
const reset = makeFunctionReference<"action">("qaFixtures:reset");
const reseed = makeFunctionReference<"action">("qaFixtures:reseed");
const status = makeFunctionReference<"action">("qaFixtures:status");
const ORIGINAL_ENV = { ...process.env };

function safeEnv() {
  process.env.TOKEN_PEPPER = "qa-fixture-test-pepper";
  process.env.SCRUB_QA_ENABLED = "true";
  process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS = "true";
  process.env.APP_URL = "http://localhost:5173";
  process.env.CONVEX_DEPLOYMENT = "dev:majestic-turtle-198";
  for (const key of ["STRIPE_SECRET_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "BLOB_READ_WRITE_TOKEN"]) delete process.env[key];
}

describe("guarded QA fixtures", () => {
  beforeEach(safeEnv);
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of Object.keys(process.env)) if (!(key in ORIGINAL_ENV)) delete process.env[key];
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it("fails closed unless every server-side guard is satisfied", () => {
    const base = { SCRUB_QA_ENABLED: "true", SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS: "true", APP_URL: "http://localhost:5173", CONVEX_DEPLOYMENT: "dev:majestic-turtle-198" } as NodeJS.ProcessEnv;
    for (const broken of [
      { ...base, SCRUB_QA_ENABLED: undefined },
      { ...base, SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS: undefined },
      { ...base, APP_URL: "https://preview.example.test" },
      { ...base, CONVEX_DEPLOYMENT: "prod:production-deployment" },
    ]) expect(() => assertQaFixtureEnvironment(broken)).toThrow("QA fixtures refused");
    expect(assertQaFixtureEnvironment(base).deployment).toBe("majestic-turtle-198");
  });

  it("seeds idempotently, authenticates all personas, and never calls external fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const t = convexTest(schema, modules);
    const first: any = await t.action(seed, {});
    const second: any = await t.action(seed, {});
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.companyId).toBe(first.companyId);
    expect(second.personaIds).toEqual(first.personaIds);
    expect(fetchSpy).not.toHaveBeenCalled();

    for (const key of ["owner", "manager", "worker", "worker2"] as const) {
      const login = await t.action(api.authActions.signIn, { email: QA_PERSONAS[key].email, password: QA_PERSONAS[key].password });
      expect(login.userId).toBe(first.personaIds[key]);
    }
    const clientLogin = await t.action(api.clientAuthActions.signIn, { email: QA_PERSONAS.client.email, password: QA_PERSONAS.client.password });
    expect(clientLogin.clientUserId).toBe(first.personaIds.client);

    const consistency = await t.run(async (ctx) => {
      const company = await ctx.db.get(first.companyId);
      const properties = await ctx.db.query("properties").withIndex("by_companyId", (q) => q.eq("companyId", first.companyId)).collect();
      const jobs = await ctx.db.query("jobs").withIndex("by_companyId_scheduledDate", (q) => q.eq("companyId", first.companyId)).collect();
      const relationships = await ctx.db.query("clientRelationships").withIndex("by_companyId", (q) => q.eq("companyId", first.companyId)).collect();
      const manager = await ctx.db.get(first.personaIds.manager);
      const requests = await ctx.db.query("clientRequests").withIndex("by_companyId", (q) => q.eq("companyId", first.companyId)).collect();
      const proposals = await ctx.db.query("proposals").withIndex("by_companyId", (q) => q.eq("companyId", first.companyId)).collect();
      const forms = await ctx.db.query("forms").withIndex("by_companyId", (q) => q.eq("companyId", first.companyId)).collect();
      const scheduleProposals = await ctx.db.query("clientRequestScheduleProposals").withIndex("by_companyId", (q) => q.eq("companyId", first.companyId)).collect();
      const agreements = await ctx.db.query("serviceAgreements").withIndex("by_company", (q) => q.eq("companyId", first.companyId)).collect();
      const workers = await ctx.db.query("workerProfiles").withIndex("by_companyId", (q) => q.eq("companyId", first.companyId)).collect();
      return { company, properties, jobs, relationships, manager, requests, proposals, forms, scheduleProposals, agreements, workers };
    });
    expect(consistency.company?.qaFixtureKey).toBe(QA_FIXTURE_KEY);
    expect(consistency.properties).toHaveLength(4);
    expect(consistency.jobs).toHaveLength(7);
    expect(new Set(consistency.jobs.map((job) => job.status))).toEqual(new Set(["approved", "submitted", "in_progress", "scheduled", "rework_requested", "confirmed"]));
    expect(consistency.jobs.filter((job) => job.cleanerIds.length === 0)).toHaveLength(1);
    expect(consistency.relationships).toHaveLength(3);
    expect(consistency.requests.map((request) => request.status).sort()).toEqual(["contacted", "converted", "converted", "new"]);
    expect(consistency.proposals.map((proposal) => proposal.status).sort()).toEqual(["accepted", "accepted", "sent"]);
    expect(consistency.scheduleProposals.filter((proposal) => proposal.status === "pending")).toHaveLength(1);
    expect(consistency.agreements.map((agreement) => agreement.status).sort()).toEqual(["sent", "signed"]);
    expect(consistency.workers).toHaveLength(2);
    expect(new Set(consistency.forms.map((form) => form.status))).toEqual(new Set(["approved", "submitted", "in_progress", "rework_requested"]));
    expect(consistency.manager).toMatchObject({ canAssignCleaners: true, canManageClients: true, canViewFinancials: false, canManageTeam: false });

    const fixtureStatus: any = await t.action(status, {});
    expect(fixtureStatus).toMatchObject({ exists: true, companyId: first.companyId, personaIds: { worker2: first.personaIds.worker2 } });
    const publicProposal = await t.action(api.proposalDeliveryActions.getProposalByToken, { token: QA_PUBLIC_PROPOSAL_TOKEN });
    expect(publicProposal).toMatchObject({ proposal: { title: "Avery seasonal deep clean", status: "sent" } });
    const agreement = await t.query((api as any).queries.serviceAgreements.getForClient, { clientUserId: clientLogin.clientUserId, sessionToken: clientLogin.sessionToken, agreementId: first.fixtureIds.pendingAgreement });
    expect(agreement).toMatchObject({ title: "Pelican Loft monthly deep-clean agreement", status: "sent" });
  }, 30_000);

  it("reset removes only the marked workspace and preserves unrelated development data", async () => {
    const t = convexTest(schema, modules);
    const fixture: any = await t.action(seed, {});
    const unrelated = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Unrelated Dev Co", timezone: "America/New_York" });
      const propertyId = await ctx.db.insert("properties", { companyId, name: "Unrelated Property", type: "residential", address: "1 Safe Way", amenities: [], active: true });
      return { companyId, propertyId };
    });
    const result: any = await t.action(reset, {});
    expect(result.deleted).toBe(true);
    await expect(t.run((ctx) => ctx.db.get(fixture.companyId))).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.db.get(unrelated.companyId))).resolves.toMatchObject({ name: "Unrelated Dev Co" });
    await expect(t.run((ctx) => ctx.db.get(unrelated.propertyId))).resolves.toMatchObject({ name: "Unrelated Property" });
    const leftovers = await t.run(async (ctx) => ({
      redFlags: await ctx.db.query("redFlags").collect(),
      availability: await ctx.db.query("cleanerAvailability").collect(),
      overrides: await ctx.db.query("cleanerAvailabilityOverrides").collect(),
    }));
    expect(leftovers).toEqual({ redFlags: [], availability: [], overrides: [] });
  }, 30_000);

  it("reseed upgrades the old fixture and reconstructs deterministic business state without touching unrelated data", async () => {
    const t = convexTest(schema, modules);
    const initial: any = await t.action(seed, {});
    await t.run(async (ctx) => {
      const worker2 = await ctx.db.get(initial.personaIds.worker2);
      const profile = await ctx.db.query("workerProfiles").withIndex("by_userId", (q) => q.eq("userId", initial.personaIds.worker2)).unique();
      const availability = await ctx.db.query("cleanerAvailability").withIndex("by_cleanerId_dayOfWeek", (q) => q.eq("cleanerId", initial.personaIds.worker2)).collect();
      for (const row of availability) await ctx.db.delete(row._id);
      if (profile) await ctx.db.delete(profile._id);
      if (worker2) await ctx.db.delete(worker2._id);
      await ctx.db.insert("companies", { name: "Persistent Unrelated Co", timezone: "UTC" });
    });
    const upgraded: any = await t.action(reseed, {});
    await expect(t.run((ctx) => ctx.db.get(initial.companyId))).resolves.toBeNull();
    const businessState = () => t.run(async (ctx) => {
      const company = await ctx.db.query("companies").withIndex("by_qaFixtureKey", (q) => q.eq("qaFixtureKey", QA_FIXTURE_KEY)).unique();
      if (!company) throw new Error("Fixture missing");
      const users = await ctx.db.query("users").withIndex("by_companyId", (q) => q.eq("companyId", company._id)).collect();
      const jobs = await ctx.db.query("jobs").withIndex("by_companyId_scheduledDate", (q) => q.eq("companyId", company._id)).collect();
      const requests = await ctx.db.query("clientRequests").withIndex("by_companyId", (q) => q.eq("companyId", company._id)).collect();
      const proposals = await ctx.db.query("proposals").withIndex("by_companyId", (q) => q.eq("companyId", company._id)).collect();
      const agreements = await ctx.db.query("serviceAgreements").withIndex("by_company", (q) => q.eq("companyId", company._id)).collect();
      return {
        users: users.map((item) => `${item.role}:${item.name}`).sort(),
        jobs: jobs.map((item) => `${item.status}:${item.type}:${item.cleanerIds.length}:${item.notes}`).sort(),
        requests: requests.map((item) => `${item.status}:${item.requestedService}`).sort(),
        proposals: proposals.map((item) => `${item.status}:${item.title}`).sort(),
        agreements: agreements.map((item) => `${item.status}:${item.title}`).sort(),
      };
    });
    const firstBusinessState = await businessState();
    const again: any = await t.action(reseed, {});
    expect(upgraded.summary).toEqual(again.summary);
    expect(await businessState()).toEqual(firstBusinessState);
    expect(again.summary).toMatchObject({ workers: 2, jobs: 7, unassignedJobs: 1, pendingScheduleProposals: 1, sentProposals: 1, sentServiceAgreements: 1 });
    const unrelated = await t.run((ctx) => ctx.db.query("companies").filter((q) => q.eq(q.field("name"), "Persistent Unrelated Co")).collect());
    expect(unrelated).toHaveLength(1);
  }, 45_000);

  it("refuses reset atomically when a foreign company relationship exists", async () => {
    const t = convexTest(schema, modules);
    const fixture: any = await t.action(seed, {});
    await t.run(async (ctx) => {
      const foreignId = await ctx.db.insert("companies", { name: "Foreign Dev Co", timezone: "UTC" });
      await ctx.db.insert("ownerConnections", { companyAId: fixture.companyId, companyBId: foreignId, status: "active", createdAt: Date.now() });
    });
    await expect(t.action(reset, {})).rejects.toThrow("cross-company relationships");
    await expect(t.run((ctx) => ctx.db.get(fixture.companyId))).resolves.toMatchObject({ qaFixtureKey: QA_FIXTURE_KEY });
  }, 30_000);

  it("refuses an inconsistent marker or reserved persona collision", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("companies", { qaFixtureKey: QA_FIXTURE_KEY, name: "Renamed ambiguous company", timezone: "UTC" }));
    await expect(t.action(seed, {})).rejects.toThrow("missing or inconsistent");
  });
});
