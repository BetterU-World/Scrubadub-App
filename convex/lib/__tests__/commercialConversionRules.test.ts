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

async function seed(t: ReturnType<typeof backend>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "Company A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "Company B", timezone: "America/New_York" });
    const ownerA = await ctx.db.insert("users", { email: "owner-a@conversion.test", passwordHash, name: "Owner A", companyId: companyA, role: "owner", status: "active" });
    const ownerB = await ctx.db.insert("users", { email: "owner-b@conversion.test", passwordHash, name: "Owner B", companyId: companyB, role: "owner", status: "active" });
    return { companyA, companyB, ownerA, ownerB };
  });
}

async function login(t: ReturnType<typeof backend>, email = "owner-a@conversion.test") {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

async function requestAndProposal(
  t: ReturnType<typeof backend>,
  seedData: Awaited<ReturnType<typeof seed>>,
  options: { leadType?: any; propertyType?: any; company?: "A" | "B" } = {}
) {
  return await t.run(async (ctx) => {
    const companyId = options.company === "B" ? seedData.companyB : seedData.companyA;
    const ownerId = options.company === "B" ? seedData.ownerB : seedData.ownerA;
    const propertyId = options.propertyType
      ? await ctx.db.insert("properties", {
          companyId,
          name: "Service location",
          type: options.propertyType,
          address: "1 Main St",
          amenities: [],
          active: true,
        })
      : undefined;
    const requestId = await ctx.db.insert("clientRequests", {
      companyId,
      createdAt: Date.now(),
      status: "accepted",
      requesterName: "Client",
      requesterEmail: "client@conversion.test",
      propertySnapshot: { address: "1 Main St" },
      source: "manual",
      leadType: options.leadType,
      propertyId,
    });
    const proposalId = await ctx.db.insert("proposals", {
      companyId,
      clientRequestId: requestId,
      createdByUserId: ownerId,
      title: "Accepted proposal",
      clientName: "Client",
      status: "accepted",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { requestId, proposalId, propertyId };
  });
}

function createArgs(ownerId: any, sessionToken: string, source: Awaited<ReturnType<typeof requestAndProposal>>) {
  return {
    userId: ownerId,
    sessionToken,
    clientRequestId: source.requestId,
    sourceLeadId: source.requestId,
    sourceProposalId: source.proposalId,
    clientName: "Client",
    status: "active" as const,
  };
}

describe("commercial conversion rules", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("uses a linked property as the authoritative classification", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t);
    const commercial = await requestAndProposal(t, s, { leadType: "residential", propertyType: "commercial" });
    const residential = await requestAndProposal(t, s, { leadType: "commercial", propertyType: "residential" });

    await expect(t.query((api as any).queries.commercialAccounts.getEligibilityForRequest, {
      userId: s.ownerA, sessionToken: auth.sessionToken, clientRequestId: commercial.requestId,
    })).resolves.toMatchObject({ eligible: true, source: "property", classification: "commercial" });
    await expect(t.mutation((api as any).mutations.commercialAccounts.create, createArgs(s.ownerA, auth.sessionToken, commercial))).resolves.toBeTruthy();

    await expect(t.query((api as any).queries.commercialAccounts.getEligibilityForRequest, {
      userId: s.ownerA, sessionToken: auth.sessionToken, clientRequestId: residential.requestId,
    })).resolves.toMatchObject({ eligible: false, source: "property", reason: "non_commercial" });
    await expect(t.mutation((api as any).mutations.commercialAccounts.create, createArgs(s.ownerA, auth.sessionToken, residential))).rejects.toThrow("classified as commercial");
  });

  it("uses request lead type only when no property is linked", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t);
    const commercial = await requestAndProposal(t, s, { leadType: "commercial" });
    const residential = await requestAndProposal(t, s, { leadType: "residential" });
    const missing = await requestAndProposal(t, s);

    await expect(t.mutation((api as any).mutations.commercialAccounts.create, createArgs(s.ownerA, auth.sessionToken, commercial))).resolves.toBeTruthy();
    await expect(t.mutation((api as any).mutations.commercialAccounts.create, createArgs(s.ownerA, auth.sessionToken, residential))).rejects.toThrow("classified as commercial");
    await expect(t.mutation((api as any).mutations.commercialAccounts.create, createArgs(s.ownerA, auth.sessionToken, missing))).rejects.toThrow("Classify the request");
  });

  it("preserves ownership protection and idempotent valid conversion", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t);
    const owned = await requestAndProposal(t, s, { leadType: "commercial" });
    const foreign = await requestAndProposal(t, s, { leadType: "commercial", company: "B" });

    const first = await t.mutation((api as any).mutations.commercialAccounts.create, createArgs(s.ownerA, auth.sessionToken, owned));
    const second = await t.mutation((api as any).mutations.commercialAccounts.create, createArgs(s.ownerA, auth.sessionToken, owned));
    expect(second).toBe(first);
    await expect(t.mutation((api as any).mutations.commercialAccounts.create, createArgs(s.ownerA, auth.sessionToken, foreign))).rejects.toThrow("Access denied");
  });

  it("maps supported request classifications when creating properties and fails closed otherwise", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t);
    for (const [leadType, expectedType] of [
      ["commercial", "commercial"],
      ["residential", "residential"],
      ["str_airbnb", "vacation_rental"],
    ] as const) {
      const source = await requestAndProposal(t, s, { leadType });
      const result = await t.mutation((api as any).mutations.clientRequests.createPropertyFromRequest, {
        requestId: source.requestId, userId: s.ownerA, sessionToken: auth.sessionToken,
      });
      expect(result.created).toBe(true);
      await expect(t.run((ctx) => ctx.db.get(result.propertyId))).resolves.toMatchObject({ type: expectedType });
    }

    const missing = await requestAndProposal(t, s);
    await expect(t.mutation((api as any).mutations.clientRequests.createPropertyFromRequest, {
      requestId: missing.requestId, userId: s.ownerA, sessionToken: auth.sessionToken,
    })).rejects.toThrow("Classify this request");
  });
});
