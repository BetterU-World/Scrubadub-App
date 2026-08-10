import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const SESSION_ERROR = "verified session is required";

function backend() {
  return convexTest(schema, modules);
}

async function seed(t: ReturnType<typeof backend>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "PR 6C A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "PR 6C B", timezone: "America/New_York" });
    const ownerA = await ctx.db.insert("users", { email: "owner-a@pr6c.test", passwordHash, name: "Owner A", companyId: companyA, role: "owner", status: "active" });
    const ownerB = await ctx.db.insert("users", { email: "owner-b@pr6c.test", passwordHash, name: "Owner B", companyId: companyB, role: "owner", status: "active" });
    const managerA = await ctx.db.insert("users", { email: "manager-a@pr6c.test", passwordHash, name: "Manager A", companyId: companyA, role: "manager", status: "active", canManageSchedule: true });
    const cleanerA = await ctx.db.insert("users", { email: "cleaner-a@pr6c.test", passwordHash, name: "Cleaner A", companyId: companyA, role: "cleaner", status: "active" });
    const maintenanceA = await ctx.db.insert("users", { email: "maintenance-a@pr6c.test", passwordHash, name: "Maintenance A", companyId: companyA, role: "maintenance", status: "active" });
    const affiliate = await ctx.db.insert("users", { email: "affiliate@pr6c.test", passwordHash, name: "Affiliate", role: "affiliate", status: "active" });
    const clientUser = await ctx.db.insert("clientUsers", { email: "client@pr6c.test", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const accountA = await ctx.db.insert("commercialAccounts", { companyId: companyA, clientName: "Account A", status: "active", createdAt: 1, updatedAt: 1 });
    const accountB = await ctx.db.insert("commercialAccounts", { companyId: companyB, clientName: "Account B", status: "active", createdAt: 1, updatedAt: 1 });
    const scheduleA = await ctx.db.insert("commercialSchedules", { companyId: companyA, commercialAccountId: accountA, title: "Schedule A", status: "active", frequency: "weekly", createdAt: 1, updatedAt: 1 });
    const invoiceA = await ctx.db.insert("invoices", {
      companyId: companyA, commercialAccountId: accountA, title: "Invoice A", invoiceNumber: "INV-00001", status: "draft",
      billingStartDate: "2026-07-01", billingEndDate: "2026-07-31", issueDate: "2026-07-31", dueDate: "2026-08-30",
      subtotalCents: 10000, taxCents: 0, totalCents: 10000, jobIds: [], createdAt: 1, updatedAt: 1,
    });
    const requestA = await ctx.db.insert("clientRequests", {
      companyId: companyA, createdAt: 1, status: "new", requesterName: "Client A", requesterEmail: "client@pr6c.test", propertySnapshot: {}, source: "manual",
    });
    const relationshipA = await ctx.db.insert("clientRelationships", {
      companyId: companyA, clientUserId: clientUser, displayName: "Client A", clientType: "commercial", email: "client@pr6c.test", status: "active", sourceClientRequestId: requestA, createdAt: 1, updatedAt: 1,
    });
    const proposalA = await ctx.db.insert("proposals", {
      companyId: companyA, clientRelationshipId: relationshipA, clientRequestId: requestA, createdByUserId: ownerA, title: "Proposal A", clientName: "Client A", status: "sent",
      proposalTokenHash: hashToken("public-proposal-token"), proposalTokenCreatedAt: Date.now(), createdAt: 1, updatedAt: 1,
    });
    const agreementA = await ctx.db.insert("serviceAgreements", {
      companyId: companyA, clientRelationshipId: relationshipA, proposalId: proposalA, clientRequestId: requestA, title: "Agreement A", status: "draft", agreementType: "commercial_cleaning", createdAt: 1, updatedAt: 1,
    });
    const contactA = await ctx.db.insert("partnerContacts", { companyId: companyA, name: "Partner", email: "partner@pr6c.test", createdAt: 1 });
    return { companyA, companyB, ownerA, ownerB, managerA, cleanerA, maintenanceA, affiliate, accountA, accountB, scheduleA, invoiceA, proposalA, agreementA, contactA };
  });
}

async function login(t: ReturnType<typeof backend>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

describe("PR 6C commercial and collaboration session migration", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("allows verified callers while preserving the existing role boundaries", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner-a@pr6c.test");
    const manager = await login(t, "manager-a@pr6c.test");

    await expect(t.query(api.queries.commercialSchedules.getById, { userId: s.managerA, sessionToken: manager.sessionToken, scheduleId: s.scheduleA })).resolves.toMatchObject({ _id: s.scheduleA });
    await expect(t.query(api.queries.invoices.getById, { userId: s.ownerA, sessionToken: owner.sessionToken, invoiceId: s.invoiceA })).resolves.toMatchObject({ _id: s.invoiceA });
    await expect(t.query(api.queries.companyOnboardingDocuments.listForOwner, { userId: s.ownerA, sessionToken: owner.sessionToken })).resolves.toHaveLength(8);
    await expect(t.query(api.queries.partners.listContacts, { userId: s.ownerA, sessionToken: owner.sessionToken })).resolves.toHaveLength(1);

    await expect(t.query(api.queries.invoices.getById, { userId: s.managerA, sessionToken: manager.sessionToken, invoiceId: s.invoiceA })).rejects.toThrow("Owner session required");
    await expect(t.query(api.queries.partners.listContacts, { userId: s.managerA, sessionToken: manager.sessionToken })).rejects.toThrow("Owner session required");
  });

  it("preserves schedule, document, invoice, partner, and worker-document behavior", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner-a@pr6c.test");
    const cleaner = await login(t, "cleaner-a@pr6c.test");
    const common = { userId: s.ownerA, sessionToken: owner.sessionToken };

    await t.mutation(api.mutations.commercialSchedules.pause, { ...common, scheduleId: s.scheduleA });
    await expect(t.query(api.queries.commercialSchedules.getById, { ...common, scheduleId: s.scheduleA })).resolves.toMatchObject({ status: "paused", frequency: "weekly" });
    await t.mutation(api.mutations.companyOnboardingDocuments.upsertMetadata, {
      ...common, documentKey: "safety_handbook", title: "Safety Handbook", required: true, roleVisibility: "both", status: "active",
    });
    await expect(t.query(api.queries.companyOnboardingDocuments.listForWorker, { userId: s.cleanerA, sessionToken: cleaner.sessionToken })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ documentKey: "safety_handbook", title: "Safety Handbook" })]));

    await t.mutation(api.mutations.invoices.updateDraft, { ...common, invoiceId: s.invoiceA, notes: "Preserved note" });
    await t.mutation(api.mutations.invoices.markIssued, { ...common, invoiceId: s.invoiceA });
    await expect(t.query(api.queries.invoices.getById, { ...common, invoiceId: s.invoiceA })).resolves.toMatchObject({ status: "issued", totalCents: 10000, notes: "Preserved note" });
    await expect(t.mutation(api.mutations.invoices.updateDraft, { ...common, invoiceId: s.invoiceA, notes: "Too late" })).rejects.toThrow("Only draft invoices can be edited");

    await t.mutation(api.mutations.partners.removeContact, { ...common, contactId: s.contactA });
    await expect(t.query(api.queries.partners.listContacts, common)).resolves.toHaveLength(0);
  });

  it("rejects every non-owner principal from owner-only families", async () => {
    const t = backend();
    const s = await seed(t);
    for (const [email, userId] of [
      ["manager-a@pr6c.test", s.managerA], ["cleaner-a@pr6c.test", s.cleanerA],
      ["maintenance-a@pr6c.test", s.maintenanceA], ["affiliate@pr6c.test", s.affiliate],
    ] as const) {
      const auth = await login(t, email);
      await expect(t.query(api.queries.companyOnboardingDocuments.listForOwner, { userId, sessionToken: auth.sessionToken })).rejects.toThrow("Owner session required");
    }
    const client = await t.action(api.clientAuthActions.signIn, { email: "client@pr6c.test", password: PASSWORD });
    await expect(t.query(api.queries.invoices.listByCompany, { userId: s.ownerA, sessionToken: client.sessionToken })).rejects.toThrow(SESSION_ERROR);
  });

  it("rejects forged principals and cross-company resources", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner-a@pr6c.test");

    await expect(t.query(api.queries.invoices.getById, { userId: s.ownerB, sessionToken: owner.sessionToken, invoiceId: s.invoiceA })).rejects.toThrow("does not match");
    await expect(t.query(api.queries.commercialSchedules.getByCommercialAccount, { userId: s.ownerA, sessionToken: owner.sessionToken, commercialAccountId: s.accountB })).rejects.toThrow("Access denied");
  });

  it("fails closed for missing, invalid, revoked, and expired sessions", async () => {
    for (const variant of ["missing", "invalid", "revoked", "idle", "expired"] as const) {
      const t = backend();
      const s = await seed(t);
      const auth = await login(t, "owner-a@pr6c.test");
      let token = auth.sessionToken;
      if (variant === "missing") token = "";
      if (variant === "invalid") token = "not-a-session";
      if (variant === "revoked" || variant === "idle" || variant === "expired") {
        await t.run(async (ctx) => {
          const session = await ctx.db.query("authSessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(auth.sessionToken))).unique();
          if (variant === "revoked") await ctx.db.patch(session!._id, { revokedAt: Date.now() });
          if (variant === "idle") await ctx.db.patch(session!._id, { idleExpiresAt: Date.now() - 1 });
          if (variant === "expired") await ctx.db.patch(session!._id, { expiresAt: Date.now() - 1 });
        });
      }
      await expect(t.query(api.queries.partners.listConnections, { userId: s.ownerA, sessionToken: token })).rejects.toThrow(SESSION_ERROR);
    }
  }, 15_000);

  it("authenticates delivery actions before resolving their target records", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner-a@pr6c.test");
    const manager = await login(t, "manager-a@pr6c.test");
    await expect(t.action(api.proposalDeliveryActions.sendProposal, { userId: s.ownerB, sessionToken: owner.sessionToken, proposalId: s.proposalA })).rejects.toThrow("does not match");
    await expect(t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { userId: s.managerA, sessionToken: manager.sessionToken, agreementId: s.agreementA })).rejects.toThrow("Owner session required");
  });

  it("preserves owned delivery responses and public proposal-token access", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner-a@pr6c.test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "email-id" }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(t.action(api.proposalDeliveryActions.sendProposal, { userId: s.ownerA, sessionToken: owner.sessionToken, proposalId: s.proposalA })).resolves.toMatchObject({ success: true });
    await expect(t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { userId: s.ownerA, sessionToken: owner.sessionToken, agreementId: s.agreementA })).resolves.toMatchObject({ success: true });
    await expect(t.run(async (ctx) => ctx.db.get(s.agreementA))).resolves.toMatchObject({ status: "sent", sentAt: expect.any(Number) });

    const publicT = backend();
    await seed(publicT);
    await expect(publicT.action(api.proposalDeliveryActions.getProposalByToken, { token: "public-proposal-token" })).resolves.toMatchObject({ proposal: { title: "Proposal A", status: "sent" } });
    await expect(publicT.action(api.proposalDeliveryActions.respondToProposal, { token: "public-proposal-token", decision: "accepted" })).resolves.toMatchObject({ proposal: { status: "accepted" } });
  });

  it("rejects proposal links 60 days after token creation for viewing and responses", async () => {
    const t = backend();
    const s = await seed(t);
    await t.run((ctx) => ctx.db.patch(s.proposalA, {
      proposalTokenCreatedAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    }));

    await expect(
      t.action(api.proposalDeliveryActions.getProposalByToken, { token: "public-proposal-token" })
    ).resolves.toBeNull();
    await expect(
      t.action(api.proposalDeliveryActions.respondToProposal, {
        token: "public-proposal-token",
        decision: "accepted",
      })
    ).rejects.toThrow("Proposal link unavailable or expired");
  });

  it("keeps all 39 scoped entry points session-verified and preserves exact frontend skip branches", () => {
    const backendFiles = [
      "queries/commercialSchedules.ts", "mutations/commercialSchedules.ts", "queries/companyOnboardingDocuments.ts", "mutations/companyOnboardingDocuments.ts",
      "queries/invoices.ts", "mutations/invoices.ts", "queries/partners.ts", "mutations/partners.ts",
      "proposalDeliveryActions.ts", "serviceAgreementDeliveryActions.ts",
    ];
    const backendSource = backendFiles.map((path) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8")).join("\n");
    expect((backendSource.match(/sessionToken:\s*v\.string\(\)/g) ?? [])).toHaveLength(40); // 39 migrated + existing worker document listing
    expect(backendSource).not.toMatch(/\b(assertOwnerRole|getSessionUser|requireOwner)\s*\(/);

    const frontendFiles = [
      "components/owner/CommercialScheduleCard.tsx", "components/owner/CommercialInvoiceCard.tsx", "components/owner/ServiceAgreementCard.tsx",
      "pages/owner/CommercialAccountDetailPage.tsx", "pages/owner/CommercialInvoiceDetailPage.tsx", "pages/owner/CommercialInvoiceListPage.tsx",
      "pages/owner/CompanyDocumentsPage.tsx", "pages/owner/CompanyOnboardingDocumentsPage.tsx", "pages/owner/JobDetailPage.tsx",
      "pages/owner/JobFormPage.tsx", "pages/owner/PartnersPage.tsx", "pages/owner/RequestDetailPage.tsx",
    ];
    const frontendSource = frontendFiles.map((path) => readFileSync(fileURLToPath(new URL(`../../../packages/frontend/src/${path}`, import.meta.url)), "utf8")).join("\n");
    expect(frontendSource).toContain("user && sessionToken ? { userId: user._id, sessionToken, commercialAccountId }");
    expect(frontendSource).toContain("uid && sessionToken ? { userId: uid, sessionToken } : \"skip\"");
    expect(frontendSource).toContain("sendProposalEmail({ userId: user!._id, sessionToken, proposalId: proposal._id })");
    expect(frontendSource).toContain("sendAgreement({ userId: user._id, sessionToken, agreementId: agreement._id })");
    expect(frontendSource).not.toContain('sessionToken: ""');

    const proposalDelivery = readFileSync(fileURLToPath(new URL("../../proposalDeliveryActions.ts", import.meta.url)), "utf8");
    expect(proposalDelivery.match(/export const getProposalByToken[\s\S]*?\n\}\);/)?.[0]).not.toContain("sessionToken");
    expect(proposalDelivery.match(/export const respondToProposal[\s\S]*?\n\}\);/)?.[0]).not.toContain("sessionToken");
  });
});
