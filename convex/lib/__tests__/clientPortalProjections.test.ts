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
});
