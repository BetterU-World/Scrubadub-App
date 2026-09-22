import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

describe("client portal page projections", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "client-portal-projection-pepper";
    process.env.RESEND_API_KEY = "test";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
    process.env.STRIPE_SECRET_KEY = "test";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test";
  });

  it("derives access from the verified principal and active relationships", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const company = await ctx.db.insert("companies", { name: "Visible Co", timezone: "America/New_York" });
      const otherCompany = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
      const client = await ctx.db.insert("clientUsers", { email: "portal@test.dev", passwordHash, displayName: "Portal Client", status: "active", createdAt: 1, updatedAt: 1 });
      const otherClient = await ctx.db.insert("clientUsers", { email: "other@test.dev", passwordHash, displayName: "Other Client", status: "active", createdAt: 1, updatedAt: 1 });
      const active = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Active", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
      const inactive = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Inactive", clientType: "residential", status: "inactive", createdAt: 1, updatedAt: 1 });
      const foreign = await ctx.db.insert("clientRelationships", { companyId: otherCompany, clientUserId: otherClient, displayName: "Foreign", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("properties", { companyId: company, clientRelationshipId: active, name: "Visible Home", type: "residential", address: "1 Main St", amenities: [], active: true });
      await ctx.db.insert("properties", { companyId: company, clientRelationshipId: inactive, name: "Inactive Home", type: "residential", address: "2 Main St", amenities: [], active: true });
      await ctx.db.insert("properties", { companyId: otherCompany, clientRelationshipId: foreign, name: "Foreign Home", type: "residential", address: "3 Main St", amenities: [], active: true });
      return { client, otherClient };
    });
    const auth = await t.action(api.clientAuthActions.signIn, { email: "portal@test.dev", password: PASSWORD });
    const projectionApi = (api as any).queries.clientPortal;
    const locations = await t.query(projectionApi.getClientLocations, { clientUserId: seeded.client, sessionToken: auth.sessionToken });
    expect(locations.properties.map((item: any) => item.name)).toEqual(["Visible Home"]);
    await expect(t.query(projectionApi.getClientLocations, { clientUserId: seeded.otherClient, sessionToken: auth.sessionToken })).rejects.toThrow("does not match");
    await expect(t.query(projectionApi.getClientLocations, { clientUserId: seeded.client, sessionToken: "forged" })).rejects.toThrow("verified session");
  });

  it("shows only client-visible proposal statuses within active company relationships", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const company = await ctx.db.insert("companies", { name: "Visible Co", timezone: "America/New_York" });
      const otherCompany = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
      const owner = await ctx.db.insert("users", { email: "proposal-owner@test.dev", passwordHash, name: "Owner", companyId: company, role: "owner", status: "active" });
      const client = await ctx.db.insert("clientUsers", { email: "proposal@test.dev", passwordHash, displayName: "Portal Client", status: "active", createdAt: 1, updatedAt: 1 });
      const otherClient = await ctx.db.insert("clientUsers", { email: "proposal-other@test.dev", passwordHash, displayName: "Other Client", status: "active", createdAt: 1, updatedAt: 1 });
      const active = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Active", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
      const inactive = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Inactive", clientType: "residential", status: "inactive", createdAt: 1, updatedAt: 1 });
      const otherRelationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: otherClient, displayName: "Other Relationship", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
      const foreign = await ctx.db.insert("clientRelationships", { companyId: otherCompany, clientUserId: otherClient, displayName: "Foreign", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });

      const requestFor = async (companyId: typeof company, clientRelationshipId: typeof active) =>
        ctx.db.insert("clientRequests", {
          companyId, clientRelationshipId, createdAt: 1, status: "new",
          requesterName: "Portal Client", requesterEmail: "proposal@test.dev",
          propertySnapshot: {}, source: "manual",
        });
      const activeRequest = await requestFor(company, active);
      const inactiveRequest = await requestFor(company, inactive);
      const otherRequest = await requestFor(company, otherRelationship);
      const foreignRequest = await requestFor(otherCompany, foreign);
      const proposalFor = async (companyId: typeof company, clientRelationshipId: typeof active, clientRequestId: typeof activeRequest, title: string, status: "draft" | "sent" | "accepted" | "declined") =>
        ctx.db.insert("proposals", {
          companyId, clientRelationshipId, clientRequestId, createdByUserId: owner,
          title, clientName: "Portal Client", monthlyPriceCents: 25000,
          status, createdAt: 1, updatedAt: 1,
        });
      await proposalFor(company, active, activeRequest, "Internal draft", "draft");
      await proposalFor(company, active, activeRequest, "Sent proposal", "sent");
      await proposalFor(company, active, activeRequest, "Accepted proposal", "accepted");
      await proposalFor(company, active, activeRequest, "Declined proposal", "declined");
      await proposalFor(company, inactive, inactiveRequest, "Inactive relationship", "sent");
      await proposalFor(company, otherRelationship, otherRequest, "Other client", "sent");
      await proposalFor(otherCompany, foreign, foreignRequest, "Other company", "sent");
      return { client, activeRequest, otherRequest, foreignRequest };
    });

    const auth = await t.action(api.clientAuthActions.signIn, { email: "proposal@test.dev", password: PASSWORD });
    const projectionApi = (api as any).queries.clientPortal;
    const args = { clientUserId: seeded.client, sessionToken: auth.sessionToken };
    const documents = await t.query(projectionApi.getClientDocuments, args);
    expect(documents.proposals.map((proposal: any) => [proposal.title, proposal.status])).toEqual([
      ["Sent proposal", "sent"],
      ["Accepted proposal", "accepted"],
      ["Declined proposal", "declined"],
    ]);
    expect(documents.proposals.every((proposal: any) => proposal.providerName === "Visible Co")).toBe(true);

    const home = await t.query(api.queries.clientHome.getClientHome, args);
    expect(home.proposals.map((proposal: any) => [proposal.title, proposal.status])).toEqual([
      ["Sent proposal", "sent"],
      ["Accepted proposal", "accepted"],
      ["Declined proposal", "declined"],
    ]);

    const detail = await t.query(projectionApi.getClientRequestDetail, { ...args, requestId: seeded.activeRequest });
    expect(detail.request.proposals.map((proposal: any) => proposal.title)).toEqual([
      "Sent proposal", "Accepted proposal", "Declined proposal",
    ]);
    expect(detail.request.timelineFacts.proposals.map((proposal: any) => proposal.status)).toEqual([
      "sent", "accepted", "declined",
    ]);
    const requests = await t.query(projectionApi.listClientRequests, args);
    expect(requests.requests.flatMap((request: any) => request.timelineFacts.proposals.map((proposal: any) => proposal.status))).toEqual([
      "sent", "accepted", "declined",
    ]);
    expect((await t.query(projectionApi.getClientRequestDetail, { ...args, requestId: seeded.otherRequest })).request).toBeNull();
    expect((await t.query(projectionApi.getClientRequestDetail, { ...args, requestId: seeded.foreignRequest })).request).toBeNull();
  });
});
