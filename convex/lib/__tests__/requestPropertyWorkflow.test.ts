import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

function backend() {
  return convexTest(schema, modules);
}

async function seed(t: ReturnType<typeof backend>) {
  const passwordHash = await hashPassword(PASSWORD);
  return t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "Company A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "Company B", timezone: "America/New_York" });
    const ownerA = await ctx.db.insert("users", { email: "owner-a@property.test", passwordHash, name: "Owner A", companyId: companyA, role: "owner", status: "active" });
    const ownerB = await ctx.db.insert("users", { email: "owner-b@property.test", passwordHash, name: "Owner B", companyId: companyB, role: "owner", status: "active" });
    const managerA = await ctx.db.insert("users", { email: "manager-a@property.test", passwordHash, name: "Manager A", companyId: companyA, role: "manager", status: "active", canSeeAllJobs: true });
    const cleanerA = await ctx.db.insert("users", { email: "cleaner-a@property.test", passwordHash, name: "Cleaner A", companyId: companyA, role: "cleaner", status: "active" });
    const relationshipA = await ctx.db.insert("clientRelationships", { companyId: companyA, displayName: "Client A", clientType: "residential", status: "active", createdAt: Date.now(), updatedAt: Date.now() });
    const relationshipB = await ctx.db.insert("clientRelationships", { companyId: companyB, displayName: "Client B", clientType: "residential", status: "active", createdAt: Date.now(), updatedAt: Date.now() });
    return { companyA, companyB, ownerA, ownerB, managerA, cleanerA, relationshipA, relationshipB };
  });
}

async function login(t: ReturnType<typeof backend>, email: string) {
  return t.action(api.authActions.signIn, { email, password: PASSWORD });
}

async function request(
  t: ReturnType<typeof backend>,
  companyId: any,
  leadType: any,
  address: string | undefined = "  1 Main St  ",
  clientRelationshipId?: any
) {
  return t.run((ctx) => ctx.db.insert("clientRequests", {
    companyId,
    clientRelationshipId,
    createdAt: Date.now(),
    status: "new",
    requesterName: "Client",
    requesterEmail: "client@property.test",
    propertySnapshot: { name: "  Client Home  ", address, notes: "Approved request note" },
    source: "manual",
    leadType,
  }));
}

describe("request-to-property workflow", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("allows owners and links the expected company, type, and client", async () => {
    const t = backend();
    const s = await seed(t);
    const ownerAuth = await login(t, "owner-a@property.test");

    for (const [userId, sessionToken, leadType, expectedType] of [
      [s.ownerA, ownerAuth.sessionToken, "residential", "residential"],
      [s.ownerA, ownerAuth.sessionToken, "commercial", "commercial"],
      [s.ownerA, ownerAuth.sessionToken, "str_airbnb", "vacation_rental"],
    ] as const) {
      const requestId = await request(t, s.companyA, leadType, undefined, s.relationshipA);
      const result = await t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId, userId, sessionToken });
      expect(result.created).toBe(true);
      await expect(t.run((ctx) => ctx.db.get(result.propertyId))).resolves.toMatchObject({
        companyId: s.companyA,
        clientRelationshipId: s.relationshipA,
        name: "Client Home",
        address: "1 Main St",
        ownerNotes: "Approved request note",
        type: expectedType,
      });
      await expect(t.run((ctx) => ctx.db.get(requestId))).resolves.toMatchObject({ propertyId: result.propertyId });
    }
  });

  it("persists classification and supports immediate owner save-to-create", async () => {
    const t = backend();
    const s = await seed(t);
    const ownerAuth = await login(t, "owner-a@property.test");

    for (const [userId, sessionToken, leadType, expectedType] of [
      [s.ownerA, ownerAuth.sessionToken, "residential", "residential"],
      [s.ownerA, ownerAuth.sessionToken, "commercial", "commercial"],
      [s.ownerA, ownerAuth.sessionToken, "str_airbnb", "vacation_rental"],
    ] as const) {
      const requestId = await request(t, s.companyA, "booking_request");
      const saved = await t.mutation(api.mutations.clientRequests.updateLeadDetails, {
        requestId,
        userId,
        sessionToken,
        leadType,
      });
      expect(saved).toEqual({ leadType });
      await expect(t.query(api.queries.clientRequests.getRequestById, {
        id: requestId,
        userId,
        sessionToken,
      })).resolves.toMatchObject({ leadType });

      const created = await t.mutation(api.mutations.clientRequests.createPropertyFromRequest, {
        requestId,
        userId,
        sessionToken,
      });
      expect(created.created).toBe(true);
      await expect(t.run((ctx) => ctx.db.get(created.propertyId))).resolves.toMatchObject({ type: expectedType });
    }
  });

  it("rejects cross-company classification updates and keeps unsupported saved types ineligible", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t, "owner-a@property.test");
    const foreignRequest = await request(t, s.companyB, "booking_request");
    await expect(t.mutation(api.mutations.clientRequests.updateLeadDetails, {
      requestId: foreignRequest,
      userId: s.ownerA,
      sessionToken: auth.sessionToken,
      leadType: "residential",
    })).rejects.toThrow("Access denied");

    for (const leadType of ["booking_request", "other", "move_out", "post_construction"] as const) {
      const requestId = await request(t, s.companyA, "booking_request");
      await expect(t.mutation(api.mutations.clientRequests.updateLeadDetails, {
        requestId,
        userId: s.ownerA,
        sessionToken: auth.sessionToken,
        leadType,
      })).resolves.toEqual({ leadType });
      await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, {
        requestId,
        userId: s.ownerA,
        sessionToken: auth.sessionToken,
      })).rejects.toThrow("Classify this request as Residential, Commercial, or STR");
    }
  });

  it("requires explicit supported classification and a non-empty address", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t, "owner-a@property.test");
    for (const leadType of ["booking_request", "other", "move_out", "post_construction"] as const) {
      const requestId = await request(t, s.companyA, leadType);
      await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId, userId: s.ownerA, sessionToken: auth.sessionToken }))
        .rejects.toThrow("Classify this request as Residential, Commercial, or STR");
    }
    const missingAddressRequest = await t.run((ctx) => ctx.db.insert("clientRequests", {
      companyId: s.companyA,
      createdAt: Date.now(),
      status: "new",
      requesterName: "Client",
      requesterEmail: "client@property.test",
      propertySnapshot: {},
      source: "manual",
      leadType: "residential",
    }));
    await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId: missingAddressRequest, userId: s.ownerA, sessionToken: auth.sessionToken }))
      .rejects.toThrow("valid property address is required");
    for (const address of ["", "   "]) {
      const requestId = await request(t, s.companyA, "residential", address);
      await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId, userId: s.ownerA, sessionToken: auth.sessionToken }))
        .rejects.toThrow("valid property address is required");
    }
  });

  it("is idempotent for the same request and returns an already-linked result", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t, "owner-a@property.test");
    const requestId = await request(t, s.companyA, "residential");
    const first = await t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId, userId: s.ownerA, sessionToken: auth.sessionToken });
    const second = await t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId, userId: s.ownerA, sessionToken: auth.sessionToken });
    expect(first).toMatchObject({ created: true });
    expect(second).toEqual({ propertyId: first.propertyId, created: false });
    await expect(t.run((ctx) => ctx.db.query("properties").withIndex("by_companyId", (q) => q.eq("companyId", s.companyA)).collect())).resolves.toHaveLength(1);
  });

  it("rejects unsupported roles, cross-company access, mismatched principals, and invalid client links", async () => {
    const t = backend();
    const s = await seed(t);
    const ownerAuth = await login(t, "owner-a@property.test");
    const managerAuth = await login(t, "manager-a@property.test");
    const cleanerAuth = await login(t, "cleaner-a@property.test");
    const ownedRequest = await request(t, s.companyA, "residential");
    const foreignRequest = await request(t, s.companyB, "residential");
    const invalidRelationshipRequest = await request(t, s.companyA, "residential", undefined, s.relationshipB);

    await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId: ownedRequest, userId: s.cleanerA, sessionToken: cleanerAuth.sessionToken })).rejects.toThrow("Owner or manager session required");
    await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId: ownedRequest, userId: s.managerA, sessionToken: managerAuth.sessionToken })).rejects.toThrow("canManageSalesAndCommercial permission required");
    await expect(t.mutation(api.mutations.clientRequests.updateLeadDetails, { requestId: ownedRequest, userId: s.managerA, sessionToken: managerAuth.sessionToken, leadType: "residential" })).rejects.toThrow("canManageSalesAndCommercial permission required");
    await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId: foreignRequest, userId: s.ownerA, sessionToken: ownerAuth.sessionToken })).rejects.toThrow("Access denied");
    await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId: ownedRequest, userId: s.ownerB, sessionToken: ownerAuth.sessionToken })).rejects.toThrow("does not match");
    await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId: invalidRelationshipRequest, userId: s.ownerA, sessionToken: ownerAuth.sessionToken })).rejects.toThrow("Client relationship must belong");
  });

  it("rejects missing, revoked, and expired sessions", async () => {
    const t = backend();
    const s = await seed(t);
    const requestId = await request(t, s.companyA, "residential");
    await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId, userId: s.ownerA, sessionToken: "" })).rejects.toThrow("verified session is required");

    const revoked = await login(t, "owner-a@property.test");
    await t.action((api as any).sessionActions.revokeCurrent, { sessionToken: revoked.sessionToken });
    await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId, userId: s.ownerA, sessionToken: revoked.sessionToken })).rejects.toThrow("verified session is required");

    const expired = await login(t, "owner-a@property.test");
    await t.run(async (ctx) => {
      const session = await ctx.db.query("authSessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(expired.sessionToken))).unique();
      await ctx.db.patch(session!._id, { expiresAt: Date.now() - 1 });
    });
    await expect(t.mutation(api.mutations.clientRequests.createPropertyFromRequest, { requestId, userId: s.ownerA, sessionToken: expired.sessionToken })).rejects.toThrow("verified session is required");
  });
});
