import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");

beforeEach(() => {
  process.env.TOKEN_PEPPER = "test-token-pepper";
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.APP_URL = "http://localhost:5173";
});

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword("test-password-123");
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Source Co", timezone: "America/New_York" });
    const foreignCompanyId = await ctx.db.insert("companies", { name: "Foreign Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { companyId, role: "owner", status: "active", name: "Owner", email: "source-owner@example.com", passwordHash });
    const foreignOwnerId = await ctx.db.insert("users", { companyId: foreignCompanyId, role: "owner", status: "active", name: "Foreign", email: "foreign-owner@example.com", passwordHash });
    const cleanerId = await ctx.db.insert("users", { companyId, role: "cleaner", status: "active", name: "Cleaner", email: "source-cleaner@example.com", passwordHash });
    const requestId = await ctx.db.insert("clientRequests", { companyId, requesterName: "Client", requesterEmail: "client@example.com", propertySnapshot: {}, requestedService: "Lead scope", source: "manual", status: "new", createdAt: 1 });
    const otherRequestId = await ctx.db.insert("clientRequests", { companyId, requesterName: "Other", requesterEmail: "other@example.com", propertySnapshot: {}, source: "manual", status: "new", createdAt: 1 });
    const sourceId = await ctx.db.insert("walkthroughs", { companyId, clientRequestId: requestId, title: "Chosen assessment", walkthroughType: "commercial", status: "completed", appointmentStatus: "completed", completedAt: 10, address: "Source address", scopeNotes: "INTERNAL SCOPE SECRET", proposalNotes: "INTERNAL PROPOSAL SECRET", accessNotes: "ALARM CODE SECRET", createdAt: 1, updatedAt: 10 });
    const secondId = await ctx.db.insert("walkthroughs", { companyId, clientRequestId: requestId, title: "Other assessment", walkthroughType: "commercial", status: "completed", appointmentStatus: "completed", completedAt: 20, address: "Other address", createdAt: 2, updatedAt: 20 });
    const incompleteId = await ctx.db.insert("walkthroughs", { companyId, clientRequestId: requestId, title: "Incomplete", walkthroughType: "commercial", status: "draft", appointmentStatus: "scheduled", createdAt: 3, updatedAt: 30 });
    const archivedId = await ctx.db.insert("walkthroughs", { companyId, clientRequestId: requestId, title: "Archived", walkthroughType: "commercial", status: "archived", appointmentStatus: "completed", createdAt: 4, updatedAt: 40 });
    const wrongRequestId = await ctx.db.insert("walkthroughs", { companyId, clientRequestId: otherRequestId, title: "Other lead", walkthroughType: "commercial", status: "completed", createdAt: 5, updatedAt: 50 });
    const foreignId = await ctx.db.insert("walkthroughs", { companyId: foreignCompanyId, clientRequestId: requestId, title: "Foreign", walkthroughType: "commercial", status: "completed", createdAt: 6, updatedAt: 60 });
    return { companyId, foreignCompanyId, ownerId, foreignOwnerId, cleanerId, requestId, sourceId, secondId, incompleteId, archivedId, wrongRequestId, foreignId };
  });
  const signIn = async (email: string) => (await t.action(api.authActions.signIn, { email, password: "test-password-123" })).sessionToken;
  return { t, ...ids, ownerAuth: { userId: ids.ownerId, sessionToken: await signIn("source-owner@example.com") }, foreignAuth: { userId: ids.foreignOwnerId, sessionToken: await signIn("foreign-owner@example.com") }, cleanerAuth: { userId: ids.cleanerId, sessionToken: await signIn("source-cleaner@example.com") } };
}

describe("explicit proposal provenance", () => {
  it("links exactly the selected completed assessment and never rewrites it on duplicate creation", async () => {
    const s = await setup();
    const args = { ...s.ownerAuth, clientRequestId: s.requestId };
    const proposalId = await s.t.mutation(api.mutations.proposals.createProposalFromLead, { ...args, sourceWalkthroughId: s.sourceId });
    const initial = await s.t.run(async (ctx) => ({ proposal: await ctx.db.get(proposalId), source: await ctx.db.get(s.sourceId), other: await ctx.db.get(s.secondId) }));
    expect(initial.proposal?.sourceWalkthroughId).toBe(s.sourceId);
    expect(initial.proposal?.scopeOfWork).toBe("Lead scope");
    expect(initial.proposal?.monthlyPriceCents).toBeUndefined();
    expect(initial.source?.proposalId).toBe(proposalId);
    expect(initial.other?.proposalId).toBeUndefined();
    expect(await s.t.mutation(api.mutations.proposals.createProposalFromLead, { ...args, sourceWalkthroughId: s.secondId })).toBe(proposalId);
    await s.t.run((ctx) => ctx.db.patch(s.sourceId, { status: "archived", address: "Changed after creation", proposalNotes: "NEW SECRET", updatedAt: 100 }));
    expect((await s.t.query(api.queries.proposals.getProposalByClientRequest, args))?.sourceWalkthroughId).toBe(s.sourceId);
    expect((await s.t.run((ctx) => ctx.db.get(proposalId)))?.propertyAddress).toBeUndefined();
  });

  it("rejects incomplete, archived, mismatched, foreign, and unauthorized source selections", async () => {
    const s = await setup();
    const create = (auth: typeof s.ownerAuth, sourceWalkthroughId: typeof s.sourceId) => s.t.mutation(api.mutations.proposals.createProposalFromLead, { ...auth, clientRequestId: s.requestId, sourceWalkthroughId });
    await expect(create(s.ownerAuth, s.incompleteId)).rejects.toThrow("Complete");
    await expect(create(s.ownerAuth, s.archivedId)).rejects.toThrow("Complete");
    await expect(create(s.ownerAuth, s.wrongRequestId)).rejects.toThrow("match the lead");
    await expect(create(s.ownerAuth, s.foreignId)).rejects.toThrow("Access denied");
    await expect(create(s.foreignAuth, s.sourceId)).rejects.toThrow("Access denied");
    await expect(create(s.cleanerAuth, s.sourceId)).rejects.toThrow();
    expect(await s.t.query(api.queries.proposals.getProposalByClientRequest, { ...s.ownerAuth, clientRequestId: s.requestId })).toBeNull();
  });

  it("preserves manual creation and readable legacy proposals without invented provenance", async () => {
    const s = await setup();
    const args = { ...s.ownerAuth, clientRequestId: s.requestId };
    const proposalId = await s.t.mutation(api.mutations.proposals.createProposalFromLead, args);
    expect((await s.t.run((ctx) => ctx.db.get(proposalId)))?.sourceWalkthroughId).toBeUndefined();
    expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.proposalId).toBeUndefined();
    expect((await s.t.query(api.queries.proposals.getProposalByClientRequest, args))?._id).toBe(proposalId);
    await s.t.run((ctx) => ctx.db.patch(proposalId, { status: "declined" }));
    expect((await s.t.query(api.queries.proposals.getProposalByClientRequest, args))?.status).toBe("declined");
    await expect(s.t.mutation(api.mutations.proposals.updateProposal, { ...s.ownerAuth, proposalId, title: "Changed", clientName: "Client" })).rejects.toThrow("draft");
    await s.t.run((ctx) => ctx.db.patch(proposalId, { proposalTokenHash: "legacy-f2-token", proposalTokenCreatedAt: Date.now() }));
    const legacyPayload = await s.t.query(internal.proposalDeliveryInternal.getClientProposalByTokenHash, { proposalTokenHash: "legacy-f2-token" });
    expect(JSON.stringify(legacyPayload)).not.toMatch(/walkthroughSummary|INTERNAL|ALARM CODE/);
  });

  it("keeps token payload independent of later assessment edits and internal notes", async () => {
    const s = await setup();
    const proposalId = await s.t.mutation(api.mutations.proposals.createProposalFromLead, { ...s.ownerAuth, clientRequestId: s.requestId, sourceWalkthroughId: s.sourceId });
    await s.t.run((ctx) => ctx.db.patch(proposalId, { status: "sent", proposalTokenHash: "f2-token-hash", proposalTokenCreatedAt: Date.now(), monthlyPriceCents: 12345 }));
    const getPayload = () => s.t.query(internal.proposalDeliveryInternal.getClientProposalByTokenHash, { proposalTokenHash: "f2-token-hash" });
    const before = await getPayload();
    expect(before?.proposal.scopeOfWork).toBe("Lead scope");
    expect(before?.proposal.monthlyPriceCents).toBe(12345);
    expect(JSON.stringify(before)).not.toMatch(/INTERNAL|ALARM CODE|walkthroughSummary|sourceWalkthroughId/);
    await s.t.run((ctx) => ctx.db.patch(s.sourceId, { address: "New address", scopeNotes: "NEW INTERNAL SECRET", proposalNotes: "NEW INTERNAL SECRET", updatedAt: 99 }));
    await s.t.run((ctx) => ctx.db.patch(s.requestId, { propertySnapshot: { address: "New lead address" }, requestedDate: "2030-05-05" }));
    expect(await getPayload()).toEqual(before);
  });

  it("uses the selected source for agreement address context without copying internal notes", async () => {
    const s = await setup();
    const proposalId = await s.t.mutation(api.mutations.proposals.createProposalFromLead, { ...s.ownerAuth, clientRequestId: s.requestId, sourceWalkthroughId: s.sourceId });
    await s.t.run((ctx) => ctx.db.patch(proposalId, { status: "accepted" }));
    await expect(s.t.mutation(api.mutations.proposals.updateProposal, { ...s.ownerAuth, proposalId, title: "Changed", clientName: "Client" })).rejects.toThrow("draft");
    await s.t.run((ctx) => ctx.db.patch(s.sourceId, { status: "archived" }));
    const agreementId = await s.t.mutation(api.mutations.serviceAgreements.createDraftFromAcceptedProposal, { ...s.ownerAuth, proposalId });
    const agreement = await s.t.run((ctx) => ctx.db.get(agreementId));
    expect(agreement?.propertyAddress).toBe("Source address");
    expect(agreement?.servicesIncluded).toBe("Lead scope");
    expect(JSON.stringify(agreement)).not.toMatch(/INTERNAL|ALARM CODE|Other address/);
  });

  it("retains the legacy agreement address fallback when a proposal has no provenance", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.incompleteId, { status: "archived" }));
    const proposalId = await s.t.mutation(api.mutations.proposals.createProposalFromLead, { ...s.ownerAuth, clientRequestId: s.requestId });
    await s.t.run((ctx) => ctx.db.patch(proposalId, { status: "accepted" }));
    const agreementId = await s.t.mutation(api.mutations.serviceAgreements.createDraftFromAcceptedProposal, { ...s.ownerAuth, proposalId });
    const agreement = await s.t.run((ctx) => ctx.db.get(agreementId));
    expect(agreement?.propertyAddress).toBe("Other address");
    expect(JSON.stringify(agreement)).not.toMatch(/INTERNAL|ALARM CODE/);
  });

  it("removes walkthrough summaries from both email and public view code paths", () => {
    for (const path of ["../../proposalDeliveryInternal.ts", "../../proposalDeliveryActions.ts", "../email.ts", "../../../packages/frontend/src/pages/public/ProposalViewPage.tsx"]) {
      const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
      expect(source).not.toContain("walkthroughSummary");
    }
  });
});
