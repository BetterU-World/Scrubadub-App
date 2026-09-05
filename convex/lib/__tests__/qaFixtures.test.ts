import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { assertQaFixtureEnvironment, QA_FIXTURE_KEY, QA_PERSONAS } from "../qaFixture";

const modules = import.meta.glob("../../**/*.ts");
const seed = makeFunctionReference<"action">("qaFixtures:seed");
const reset = makeFunctionReference<"action">("qaFixtures:reset");
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

    for (const key of ["owner", "manager", "worker"] as const) {
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
      return { company, properties, jobs, relationships, manager, requests, proposals, forms };
    });
    expect(consistency.company?.qaFixtureKey).toBe(QA_FIXTURE_KEY);
    expect(consistency.properties).toHaveLength(4);
    expect(new Set(consistency.jobs.map((job) => job.status))).toEqual(new Set(["approved", "submitted", "in_progress", "scheduled", "rework_requested", "confirmed"]));
    expect(consistency.relationships).toHaveLength(3);
    expect(consistency.requests.map((request) => request.status).sort()).toEqual(["converted", "new"]);
    expect(consistency.proposals.map((proposal) => proposal.status).sort()).toEqual(["accepted", "draft"]);
    expect(new Set(consistency.forms.map((form) => form.status))).toEqual(new Set(["approved", "submitted", "in_progress", "rework_requested"]));
    expect(consistency.manager).toMatchObject({ canAssignCleaners: true, canManageClients: true, canViewFinancials: false, canManageTeam: false });
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
  }, 30_000);

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
