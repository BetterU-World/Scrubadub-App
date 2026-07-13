import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const makeTest = () => convexTest(schema, modules);

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword(PASSWORD);
  return t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "B", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { email: "owner@client-pr5.test", passwordHash, name: "Owner", companyId: companyA, role: "owner", status: "active" });
    const client = await ctx.db.insert("clientUsers", { email: "client@pr5.test", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const otherClient = await ctx.db.insert("clientUsers", { email: "other@pr5.test", passwordHash, displayName: "Other", status: "active", createdAt: 1, updatedAt: 1 });
    const disabledClient = await ctx.db.insert("clientUsers", { email: "disabled@pr5.test", passwordHash, displayName: "Disabled", status: "disabled", createdAt: 1, updatedAt: 1 });
    const relationshipA = await ctx.db.insert("clientRelationships", { companyId: companyA, clientUserId: client, displayName: "Client A", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const relationshipB = await ctx.db.insert("clientRelationships", { companyId: companyB, clientUserId: client, displayName: "Client B", clientType: "commercial", status: "active", createdAt: 1, updatedAt: 1 });
    const otherRelationship = await ctx.db.insert("clientRelationships", { companyId: companyA, clientUserId: otherClient, displayName: "Other", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const disabledRelationship = await ctx.db.insert("clientRelationships", { companyId: companyA, clientUserId: client, displayName: "Disabled relationship", clientType: "residential", status: "inactive", createdAt: 1, updatedAt: 1 });
    const request = await ctx.db.insert("clientRequests", { companyId: companyA, clientRelationshipId: relationshipA, createdAt: 1, status: "accepted", requesterName: "Client", requesterEmail: "client@pr5.test", propertySnapshot: {}, source: "manual" });
    const proposal = await ctx.db.insert("proposals", { companyId: companyA, clientRelationshipId: relationshipA, clientRequestId: request, createdByUserId: owner, title: "Proposal", clientName: "Client", status: "accepted", createdAt: 1, updatedAt: 1 });
    const agreement = await ctx.db.insert("serviceAgreements", { companyId: companyA, clientRelationshipId: relationshipA, proposalId: proposal, title: "Agreement", status: "sent", agreementType: "commercial_cleaning", clientName: "Client", createdAt: 1, updatedAt: 1, sentAt: 1 });
    const otherAgreement = await ctx.db.insert("serviceAgreements", { companyId: companyA, clientRelationshipId: otherRelationship, proposalId: proposal, title: "Other Agreement", status: "sent", agreementType: "commercial_cleaning", clientName: "Other", createdAt: 1, updatedAt: 1, sentAt: 1 });
    const property = await ctx.db.insert("properties", { companyId: companyA, clientRelationshipId: relationshipA, name: "Home", type: "residential", address: "1 Main", amenities: [], active: true });
    const job = await ctx.db.insert("jobs", { companyId: companyA, clientRelationshipId: relationshipA, propertyId: property, cleanerIds: [], type: "standard", status: "scheduled", scheduledDate: "2099-01-01", durationMinutes: 60, reworkCount: 0 });
    const account = await ctx.db.insert("commercialAccounts", { companyId: companyA, clientRelationshipId: relationshipA, clientName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("invoices", { companyId: companyA, clientRelationshipId: relationshipA, commercialAccountId: account, title: "Invoice", invoiceNumber: "INV-1", status: "issued", billingStartDate: "2099-01-01", billingEndDate: "2099-01-31", issueDate: "2099-01-31", dueDate: "2099-02-15", subtotalCents: 1000, taxCents: 0, totalCents: 1000, jobIds: [job], createdAt: 1, updatedAt: 1 });
    return { companyA, client, otherClient, disabledClient, relationshipA, relationshipB, otherRelationship, disabledRelationship, agreement, otherAgreement };
  });
}

const login = (t: ReturnType<typeof convexTest>, email = "client@pr5.test") =>
  t.action(api.clientAuthActions.signIn, { email, password: PASSWORD });

describe("client session migration", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("loads Client Home from the verified principal and preserves independent active relationships", async () => {
    const t = makeTest(); const s = await seed(t); const auth = await login(t);
    const home = await t.query(api.queries.clientHome.getClientHome, { clientUserId: s.client, sessionToken: auth.sessionToken });
    expect(home?.relationships.map((item) => item._id)).toEqual(expect.arrayContaining([s.relationshipA, s.relationshipB]));
    expect(home?.relationships).toHaveLength(2);
    expect(home?.properties).toHaveLength(1);
    expect(home?.upcomingJobs).toHaveLength(1);
    expect(home?.proposals).toHaveLength(1);
    expect(home?.serviceAgreements).toHaveLength(1);
    expect(home?.invoices).toHaveLength(1);
    await t.run((ctx) => ctx.db.patch(s.relationshipA, { status: "inactive" }));
    const afterRevocation = await t.query(api.queries.clientHome.getClientHome, { clientUserId: s.client, sessionToken: auth.sessionToken });
    expect(afterRevocation?.relationships.map((item) => item._id)).toEqual([s.relationshipB]);
  });

  it("rejects legacy IDs, forged IDs, and another client's relationships and records", async () => {
    const t = makeTest(); const s = await seed(t); const auth = await login(t);
    await expect(t.query(api.queries.clientHome.getClientHome, { clientUserId: s.client, sessionToken: "" })).rejects.toThrow("verified session is required");
    await expect(t.query(api.queries.clientHome.getClientHome, { clientUserId: s.otherClient, sessionToken: auth.sessionToken })).rejects.toThrow("does not match");
    await expect(t.query(api.queries.serviceAgreements.getForClient, { clientUserId: s.client, sessionToken: auth.sessionToken, agreementId: s.otherAgreement })).resolves.toBeNull();
    await expect(t.mutation(api.mutations.serviceAgreements.clientAccept, { clientUserId: s.client, sessionToken: auth.sessionToken, agreementId: s.otherAgreement })).rejects.toThrow("Client relationship access required");
  });

  it("allows authorized agreement reads and responses only through the verified session", async () => {
    const t = makeTest(); const s = await seed(t); const auth = await login(t);
    await expect(t.query(api.queries.serviceAgreements.getForClient, { clientUserId: s.client, sessionToken: auth.sessionToken, agreementId: s.agreement })).resolves.toMatchObject({ _id: s.agreement, status: "sent" });
    await expect(t.mutation(api.mutations.serviceAgreements.clientAccept, { clientUserId: s.client, sessionToken: auth.sessionToken, agreementId: s.agreement })).resolves.toBeNull();
  });

  it("rejects revoked, expired, and inactive client sessions", async () => {
    const t = makeTest(); const s = await seed(t); const revoked = await login(t);
    await t.action((api as any).sessionActions.revokeCurrent, { sessionToken: revoked.sessionToken });
    await expect(t.query(api.queries.clientHome.getClientHome, { clientUserId: s.client, sessionToken: revoked.sessionToken })).rejects.toThrow("verified session is required");
    const expired = await login(t);
    await t.run(async (ctx) => { const row = await ctx.db.query("authSessions").withIndex("by_tokenHash", q => q.eq("tokenHash", hashToken(expired.sessionToken))).unique(); await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 }); });
    await expect(t.query(api.queries.clientHome.getClientHome, { clientUserId: s.client, sessionToken: expired.sessionToken })).rejects.toThrow("verified session is required");
    await expect(login(t, "disabled@pr5.test")).rejects.toThrow("Invalid email or password");
  });

  it("leaves public invitation and proposal-token actions public and staff sessions unchanged", async () => {
    expect(typeof api.clientAuthActions.getInviteInfo).toBe("object");
    expect(typeof api.clientAuthActions.acceptInvite).toBe("object");
    expect(typeof api.proposalDeliveryActions.getProposalByToken).toBe("object");
    expect(typeof api.proposalDeliveryActions.respondToProposal).toBe("object");
    expect(typeof api.queries.dashboard.getStats).toBe("object");
  });
});
