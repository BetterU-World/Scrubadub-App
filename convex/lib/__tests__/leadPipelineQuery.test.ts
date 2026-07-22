import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "pipeline-password-123";

describe("lead pipeline query", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "pipeline-test-pepper";
    process.env.STRIPE_SECRET_KEY = "stripe-test";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "stripe-webhook-test";
    process.env.RESEND_API_KEY = "resend-test";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("allows owners and managers, rejects workers, and scopes canonical projections to the company", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Pipeline Co", timezone: "America/New_York" });
      const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
      const passwordHash = await hashPassword(PASSWORD);
      const ownerId = await ctx.db.insert("users", { companyId, email: "owner@pipeline.test", name: "Owner", passwordHash, role: "owner", status: "active" });
      const managerId = await ctx.db.insert("users", { companyId, email: "manager@pipeline.test", name: "Manager", passwordHash, role: "manager", status: "active" });
      const cleanerId = await ctx.db.insert("users", { companyId, email: "cleaner@pipeline.test", name: "Cleaner", passwordHash, role: "cleaner", status: "active" });
      const requestId = await ctx.db.insert("clientRequests", { companyId, createdAt: Date.now(), status: "new", requesterName: "Pipeline Lead", requesterEmail: "lead@test.dev", propertySnapshot: {}, source: "manual" });
      await ctx.db.insert("clientRequests", { companyId: otherCompanyId, createdAt: Date.now(), status: "new", requesterName: "Foreign Lead", requesterEmail: "foreign@test.dev", propertySnapshot: {}, source: "manual" });
      await ctx.db.insert("proposals", { companyId, clientRequestId: requestId, createdByUserId: ownerId, title: "Proposal", clientName: "Pipeline Lead", status: "sent", createdAt: Date.now(), updatedAt: Date.now() });
      return { ownerId, managerId, cleanerId };
    });
    const login = (email: string) => t.action(api.authActions.signIn, { email, password: PASSWORD });
    const owner = await login("owner@pipeline.test");
    const manager = await login("manager@pipeline.test");
    const cleaner = await login("cleaner@pipeline.test");

    await expect(t.query(api.queries.clientRequests.listRequestsForPipeline, { userId: seeded.ownerId, sessionToken: owner.sessionToken })).resolves.toMatchObject([{ requesterName: "Pipeline Lead", pipeline: { stage: "decision" } }]);
    await expect(t.query(api.queries.clientRequests.listRequestsForPipeline, { userId: seeded.managerId, sessionToken: manager.sessionToken })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.clientRequests.listRequestsForPipeline, { userId: seeded.cleanerId, sessionToken: cleaner.sessionToken })).rejects.toThrow("Owner or manager");
  });
});
