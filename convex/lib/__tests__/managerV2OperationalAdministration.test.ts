import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { readFileSync } from "node:fs";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

describe("Manager Experience V2 delegated operational administration", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "manager-v2-pr2-pepper";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  });

  it("authorizes each delegated domain independently and contracts immediately after revocation", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "PR2 Co", timezone: "America/New_York" });
      const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
      const owner = await ctx.db.insert("users", { email: "owner@pr2.test", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
      const makeManager = (email: string, capability: Record<string, boolean>) => ctx.db.insert("users", {
        email, passwordHash, name: email, companyId, role: "manager", status: "active", ...capability,
      });
      const clients = await makeManager("clients@pr2.test", { canManageClients: true });
      const sales = await makeManager("sales@pr2.test", { canManageSalesAndCommercial: true });
      const team = await makeManager("team@pr2.test", { canManageTeam: true });
      const documents = await makeManager("documents@pr2.test", { canManageDocuments: true });
      const configuration = await makeManager("configuration@pr2.test", { canManageBusinessConfiguration: true });
      return { companyId, otherCompanyId, owner, clients, sales, team, documents, configuration };
    });

    const signIn = async (email: string) => t.action(api.authActions.signIn, { email, password: PASSWORD });
    const ownerAuth = await signIn("owner@pr2.test");
    const clientsAuth = await signIn("clients@pr2.test");
    const salesAuth = await signIn("sales@pr2.test");
    const teamAuth = await signIn("team@pr2.test");
    const documentsAuth = await signIn("documents@pr2.test");
    const configurationAuth = await signIn("configuration@pr2.test");

    await expect(t.mutation(api.mutations.clientRelationships.create, {
      userId: seeded.clients, sessionToken: clientsAuth.sessionToken, displayName: "Client", clientType: "commercial", status: "active",
    })).resolves.toBeTruthy();
    await expect(t.mutation(api.mutations.clientRequests.createManualClientRequest, {
      userId: seeded.sales, sessionToken: salesAuth.sessionToken, requesterName: "Lead", requesterEmail: "lead@pr2.test", leadType: "commercial",
    })).resolves.toBeTruthy();
    await expect(t.mutation(api.mutations.teams.create, {
      userId: seeded.team, sessionToken: teamAuth.sessionToken, companyId: seeded.companyId, name: "Ops Team",
    })).resolves.toBeTruthy();
    await expect(t.action(api.employeeActions.inviteCleaner, {
      userId: seeded.team, sessionToken: teamAuth.sessionToken, companyId: seeded.companyId,
      email: "cleaner-invite@pr2.test", name: "Cleaner Invite", role: "cleaner",
    })).resolves.toMatchObject({ emailSent: true });
    await expect(t.action(api.employeeActions.inviteCleaner, {
      userId: seeded.team, sessionToken: teamAuth.sessionToken, companyId: seeded.companyId,
      email: "manager-invite@pr2.test", name: "Manager Invite", role: "manager",
    })).rejects.toThrow("Only owners can invite managers");
    await expect(t.mutation(api.mutations.documentTemplates.create, {
      userId: seeded.documents, sessionToken: documentsAuth.sessionToken, type: "proposal", name: "Proposal", body: "Terms",
    })).resolves.toBeTruthy();
    await expect(t.query(api.queries.inventoryTemplates.list, {
      userId: seeded.configuration, sessionToken: configurationAuth.sessionToken, companyId: seeded.companyId,
    })).resolves.toEqual([]);

    await expect(t.query(api.queries.clientRelationships.list, {
      userId: seeded.sales, sessionToken: salesAuth.sessionToken,
    })).rejects.toThrow("canManageClients permission required");
    await expect(t.query(api.queries.clientRequests.getCompanyRequests, {
      userId: seeded.clients, sessionToken: clientsAuth.sessionToken, companyId: seeded.companyId,
    })).rejects.toThrow("canManageSalesAndCommercial permission required");
    await expect(t.query(api.queries.inventoryTemplates.list, {
      userId: seeded.team, sessionToken: teamAuth.sessionToken, companyId: seeded.companyId,
    })).rejects.toThrow("canManageBusinessConfiguration permission required");
    await expect(t.query(api.queries.inventoryTemplates.list, {
      userId: seeded.configuration, sessionToken: configurationAuth.sessionToken, companyId: seeded.otherCompanyId,
    })).rejects.toThrow("Access denied");

    await expect(t.query(api.queries.clientRelationships.list, {
      userId: seeded.owner, sessionToken: ownerAuth.sessionToken,
    })).resolves.toHaveLength(1);

    await t.run((ctx) => ctx.db.patch(seeded.clients, { canManageClients: false }));
    await expect(t.query(api.queries.clientRelationships.list, {
      userId: seeded.clients, sessionToken: clientsAuth.sessionToken,
    })).rejects.toThrow("canManageClients permission required");
  });

  it("keeps delegated routes capability-aware and sensitive Owner controls unavailable", () => {
    const app = readFileSync("packages/frontend/src/App.tsx", "utf8");
    const employeePage = readFileSync("packages/frontend/src/pages/owner/EmployeeListPage.tsx", "utf8");
    const accountPage = readFileSync("packages/frontend/src/pages/owner/CommercialAccountDetailPage.tsx", "utf8");
    expect(app).toContain('user?.canManageClients && <Route path="/clients"');
    expect(app).toContain('user?.canManageSalesAndCommercial && <Route path="/commercial-accounts"');
    expect(app).toContain('user?.canManageTeam && <Route path="/employees"');
    expect(app).toContain('user?.canManageDocuments && <Route path="/owner/settings/documents"');
    expect(app).toContain('user?.canManageBusinessConfiguration && <Route path="/inventory-templates"');
    expect(employeePage).toContain("isOwner && emp.role === \"manager\"");
    expect(accountPage).toContain("canManageSchedule && <CollapsibleSection");
    expect(accountPage).toContain("canManageInvoices && <CollapsibleSection");
  });
});
