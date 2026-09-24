import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const proposals = (api as any).mutations.proposals;
const delivery = (api as any).proposalDeliveryActions;

beforeEach(() => {
  process.env.TOKEN_PEPPER = "f3a-test-pepper";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.APP_URL = "https://app.scrub.test";
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
});
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const seeded = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Original Provider", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other Provider", timezone: "America/New_York" });
    const siteId = await ctx.db.insert("companySites", { companyId, slug: "f3a", templateId: "A", brandName: "Original Brand", logoUrl: "https://example.test/original.png", publicEmail: "original@example.test", bio: "", serviceArea: "", services: [] });
    const ownerId = await ctx.db.insert("users", { email: "owner-f3a@example.test", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
    const managerId = await ctx.db.insert("users", { email: "manager-f3a@example.test", passwordHash, name: "Manager", companyId, role: "manager", status: "active", canManageSalesAndCommercial: true });
    const otherOwnerId = await ctx.db.insert("users", { email: "other-f3a@example.test", passwordHash, name: "Other", companyId: otherCompanyId, role: "owner", status: "active" });
    const clientUserId = await ctx.db.insert("clientUsers", { email: "client-f3a@example.test", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const relationshipId = await ctx.db.insert("clientRelationships", { companyId, clientUserId, displayName: "Client", clientType: "commercial", status: "active", email: "client-f3a@example.test", createdAt: 1, updatedAt: 1 });
    const requestId = await ctx.db.insert("clientRequests", { companyId, clientRelationshipId: relationshipId, createdAt: 1, status: "new", requesterName: "Client", requesterEmail: "client-f3a@example.test", propertySnapshot: { address: "1 Original St" }, source: "manual", requestedService: "Original scope" });
    const proposalId = await ctx.db.insert("proposals", { companyId, clientRelationshipId: relationshipId, clientRequestId: requestId, createdByUserId: ownerId, title: "Original Proposal", clientName: "Client", propertyAddress: "1 Original St", scopeOfWork: "Original scope", monthlyPriceCents: 10000, addOnLineItems: [{ lineItemId: "line-1", sourceType: "custom", name: "Windows", pricingMethod: "starting_at", unitPriceCents: 2000, finalizedPriceCents: 3000, billingCadence: "monthly" }], status: "draft", createdAt: 1, updatedAt: 1 });
    return { companyId, otherCompanyId, siteId, ownerId, managerId, otherOwnerId, clientUserId, relationshipId, requestId, proposalId };
  });
  const owner = await t.action(api.authActions.signIn, { email: "owner-f3a@example.test", password: PASSWORD });
  const other = await t.action(api.authActions.signIn, { email: "other-f3a@example.test", password: PASSWORD });
  const manager = await t.action(api.authActions.signIn, { email: "manager-f3a@example.test", password: PASSWORD });
  const client = await t.action(api.clientAuthActions.signIn, { email: "client-f3a@example.test", password: PASSWORD });
  return { t, ...seeded, ownerAuth: { userId: seeded.ownerId, sessionToken: owner.sessionToken }, managerAuth: { userId: seeded.managerId, sessionToken: manager.sessionToken }, otherAuth: { userId: seeded.otherOwnerId, sessionToken: other.sessionToken }, clientAuth: { clientUserId: seeded.clientUserId, sessionToken: client.sessionToken } };
}

function mockEmail(ok = true) {
  const bodies: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return new Response(JSON.stringify(ok ? { id: "provider-id" } : { message: "provider failure" }), { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } });
  }));
  return bodies;
}

async function issueToken(issue: any) {
  const { proposalIssueToken } = await import("../tokens");
  return proposalIssueToken(issue.tokenNonce);
}

describe("proposal issued content", () => {
  it.each(["accepted", "declined"] as const)("notifies the owner and responsible manager once for a public %s decision", async (decision) => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.proposalId, { createdByUserId: s.managerId }));
    mockEmail();
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const issue = await s.t.run(async (ctx) => ctx.db.get((await ctx.db.get(s.proposalId))!.currentIssueId!));
    const token = await issueToken(issue);
    await s.t.action(delivery.respondToProposal, { token, decision });
    await s.t.action(delivery.respondToProposal, { token, decision });
    const notifications = await s.t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notifications).toHaveLength(2);
    expect(notifications.map((item) => item.userId)).toEqual(expect.arrayContaining([s.ownerId, s.managerId]));
    expect(notifications.every((item) => item.companyId === s.companyId && item.relatedClientRequestId === s.requestId && item.type === `proposal_${decision}`)).toBe(true);
    expect(await s.t.query(api.queries.notifications.list, s.managerAuth)).toMatchObject([{ relatedClientRequestId: s.requestId }]);
    expect(await s.t.query(api.queries.notifications.list, s.otherAuth)).toHaveLength(0);
  });

  it.each(["accepted", "declined"] as const)("notifies the owner for a manager-recorded %s decision without a self-notification", async (decision) => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.proposalId, { createdByUserId: s.managerId }));
    await s.t.mutation(proposals.markProposalSent, { ...s.managerAuth, proposalId: s.proposalId });
    const mutation = decision === "accepted" ? proposals.markProposalAccepted : proposals.markProposalDeclined;
    await s.t.mutation(mutation, { ...s.managerAuth, proposalId: s.proposalId });
    await expect(s.t.mutation(mutation, { ...s.managerAuth, proposalId: s.proposalId })).rejects.toThrow("immutable");
    expect(await s.t.run((ctx) => ctx.db.query("notifications").collect())).toMatchObject([{ userId: s.ownerId, type: `proposal_${decision}`, relatedClientRequestId: s.requestId }]);
  });

  it("freezes reviewed content and provider identity, and reuses the issue and link on resend", async () => {
    const s = await setup();
    const draftReview: any = await s.t.query((api as any).queries.proposals.getProposalByClientRequest,
      { ...s.ownerAuth, clientRequestId: s.requestId });
    expect(draftReview.canonicalPreview).toMatchObject({ source: "saved_draft", issueNumber: null,
      content: { company: { companyName: "Original Brand" }, proposal: { totals: { monthlyTotalCents: 13000 } } } });
    expect((await s.t.query((api as any).queries.proposals.getProposalByClientRequest,
      { ...s.managerAuth, clientRequestId: s.requestId }) as any).canonicalPreview.content)
      .toEqual(draftReview.canonicalPreview.content);
    const bodies = mockEmail();
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const first = await s.t.run(async (ctx) => {
      const proposal = await ctx.db.get(s.proposalId);
      return ctx.db.get(proposal!.currentIssueId!);
    });
    const token = await issueToken(first);
    expect(first!.issueNumber).toBe(1);
    expect(first!.content).toMatchObject({ company: { companyName: "Original Brand", companyLogoUrl: "https://example.test/original.png", companyEmail: "original@example.test" }, proposal: { title: "Original Proposal", monthlyPriceCents: 10000, addOnLineItems: [{ name: "Windows", finalizedPriceCents: 3000, lineTotalCents: 3000 }], totals: { monthlyTotalCents: 13000 } } });
    expect(draftReview.canonicalPreview.content).toEqual(first!.content);
    expect(JSON.stringify(first!.content)).not.toMatch(/sourceWalkthroughId|assessmentSuggested|requesterEmail|lineItemId/);
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.siteId, { brandName: "Changed Brand", logoUrl: "https://example.test/changed.png" });
      await ctx.db.patch(s.requestId, { requestedService: "Changed request", propertySnapshot: { address: "2 Changed St" } });
    });
    const before = await s.t.action(delivery.getProposalByToken, { token });
    expect(before).toMatchObject({ company: { companyName: "Original Brand" }, proposal: { title: "Original Proposal", scopeOfWork: "Original scope", totals: { monthlyTotalCents: 13000 } } });
    const ownerSent: any = await s.t.query((api as any).queries.proposals.getProposalByClientRequest,
      { ...s.ownerAuth, clientRequestId: s.requestId });
    expect(ownerSent.canonicalPreview).toMatchObject({ source: "issued_snapshot", issueNumber: 1, content: first!.content });
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const state = await s.t.run(async (ctx) => ({ proposal: await ctx.db.get(s.proposalId), issues: await ctx.db.query("proposalIssues").collect(), attempts: await ctx.db.query("transactionalDocumentDeliveryAttempts").collect() }));
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].content).toEqual(first!.content);
    expect(await issueToken(state.issues[0])).toBe(token);
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts.every((attempt) => attempt.result === "provider_accepted" && attempt.recipientEmail === "client-f3a@example.test")).toBe(true);
    expect(state.attempts.every((attempt) => !JSON.stringify(attempt).includes(token))).toBe(true);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain(token);
    expect(bodies[1]).toContain(token);
    await s.t.run((ctx) => ctx.db.patch(s.proposalId, { title: "Unreviewed database change", monthlyPriceCents: 99999 }));
    const docs = await s.t.query((api as any).queries.clientPortal.getClientDocuments, s.clientAuth);
    expect(docs.proposals[0]).toMatchObject({ title: "Original Proposal", providerName: "Original Brand", monthlyPriceCents: 10000, monthlyTotalCents: 13000, basePriceOnly: false });
    expect((await s.t.action(delivery.getProposalByToken, { token })).proposal.title).toBe("Original Proposal");
  });

  it("withdraws the old response path, preserves history, and binds acceptance to the new issue", async () => {
    const s = await setup();
    mockEmail();
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const oldIssue = await s.t.run(async (ctx) => ctx.db.get((await ctx.db.get(s.proposalId))!.currentIssueId!));
    const oldToken = await issueToken(oldIssue);
    await s.t.mutation(proposals.returnProposalToDraft, { ...s.ownerAuth, proposalId: s.proposalId });
    const revision: any = await s.t.query((api as any).queries.proposals.getProposalByClientRequest,
      { ...s.ownerAuth, clientRequestId: s.requestId });
    expect(revision.hasPriorIssue).toBe(true);
    expect(revision.canonicalPreview.source).toBe("saved_draft");
    expect(await s.t.action(delivery.getProposalByToken, { token: oldToken })).toBeNull();
    await expect(s.t.action(delivery.respondToProposal, { token: oldToken, decision: "accepted" })).rejects.toThrow("unavailable");
    await s.t.mutation(proposals.updateProposal, { ...s.ownerAuth, proposalId: s.proposalId, title: "Revised Proposal", clientName: "Client", monthlyPriceCents: 20000 });
    const docsWhileDraft = await s.t.query((api as any).queries.clientPortal.getClientDocuments, s.clientAuth);
    expect(docsWhileDraft.proposals).toHaveLength(0);
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const state = await s.t.run(async (ctx) => ({ proposal: await ctx.db.get(s.proposalId), issues: await ctx.db.query("proposalIssues").withIndex("by_proposal", (q) => q.eq("proposalId", s.proposalId)).collect() }));
    expect(state.issues.map((issue) => issue.issueNumber)).toEqual([1, 2]);
    expect(state.issues[0].content.proposal.title).toBe("Original Proposal");
    expect(state.issues[0].withdrawnAt).toEqual(expect.any(Number));
    expect(state.issues[1].content.proposal.title).toBe("Revised Proposal");
    expect(state.proposal!.currentIssueId).toBe(state.issues[1]._id);
    const newToken = await issueToken(state.issues[1]);
    expect(newToken).not.toBe(oldToken);
    await expect(s.t.action(delivery.respondToProposal, { token: oldToken, decision: "declined" })).rejects.toThrow("unavailable");
    await s.t.action(delivery.respondToProposal, { token: newToken, decision: "accepted" });
    const accepted = await s.t.run((ctx) => ctx.db.get(s.proposalId));
    expect(accepted).toMatchObject({ status: "accepted", responseIssueId: state.issues[1]._id, responseSource: "client_token" });
    await s.t.run((ctx) => ctx.db.patch(s.proposalId, {
      currentIssueId: undefined, title: "Changed working title", monthlyPriceCents: 99999, addOnLineItems: [],
    }));
    const ownerAccepted: any = await s.t.query((api as any).queries.proposals.getProposalByClientRequest,
      { ...s.ownerAuth, clientRequestId: s.requestId });
    expect(ownerAccepted.canonicalPreview).toMatchObject({ source: "issued_snapshot", issueNumber: 2,
      content: state.issues[1].content });
    expect((await s.t.query((api as any).queries.clientPortal.getClientDocuments, s.clientAuth)).proposals[0])
      .toMatchObject({ title: "Revised Proposal", monthlyPriceCents: 20000, monthlyTotalCents: 23000, basePriceOnly: false });
    await expect(s.t.mutation(proposals.returnProposalToDraft, { ...s.ownerAuth, proposalId: s.proposalId })).rejects.toThrow("Only sent");
  });

  it("shows an issued proposal without add-ons at its unchanged total", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.proposalId, { addOnLineItems: [] }));
    mockEmail();
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const docs = await s.t.query((api as any).queries.clientPortal.getClientDocuments, s.clientAuth);
    expect(docs.proposals[0]).toMatchObject({ monthlyPriceCents: 10000, monthlyTotalCents: 10000, basePriceOnly: false });
  });

  it("records decline against the issue and keeps owner-reported events distinct", async () => {
    const s = await setup();
    await s.t.mutation(proposals.markProposalSent, { ...s.ownerAuth, proposalId: s.proposalId });
    const sent = await s.t.run(async (ctx) => ({ proposal: await ctx.db.get(s.proposalId), attempts: await ctx.db.query("transactionalDocumentDeliveryAttempts").collect() }));
    expect(sent.proposal!.currentIssueId).toBeDefined();
    expect(sent.attempts).toMatchObject([{ channel: "owner_reported_outside_send", result: "owner_reported" }]);
    await s.t.mutation(proposals.markProposalDeclined, { ...s.ownerAuth, proposalId: s.proposalId });
    expect(await s.t.run((ctx) => ctx.db.get(s.proposalId))).toMatchObject({ responseIssueId: sent.proposal!.currentIssueId, responseSource: "owner_reported", status: "declined" });
    const ownerDeclined: any = await s.t.query((api as any).queries.proposals.getProposalByClientRequest,
      { ...s.ownerAuth, clientRequestId: s.requestId });
    expect(ownerDeclined).toMatchObject({ declinedAt: expect.any(Number), canonicalPreview: {
      source: "issued_snapshot", issueNumber: 1, content: { proposal: { totals: { monthlyTotalCents: 13000 } } },
    } });
    await expect(s.t.mutation(proposals.updateProposal, { ...s.ownerAuth, proposalId: s.proposalId, title: "No", clientName: "Client" })).rejects.toThrow("draft");

    const clientResponse = await setup();
    mockEmail();
    await clientResponse.t.action(delivery.sendProposal, { ...clientResponse.ownerAuth, proposalId: clientResponse.proposalId });
    const issue = await clientResponse.t.run(async (ctx) => ctx.db.get((await ctx.db.get(clientResponse.proposalId))!.currentIssueId!));
    await clientResponse.t.action(delivery.respondToProposal, { token: await issueToken(issue), decision: "declined" });
    expect(await clientResponse.t.run((ctx) => ctx.db.get(clientResponse.proposalId))).toMatchObject({ status: "declined", responseIssueId: issue!._id, responseSource: "client_token" });
  }, 10_000);

  it("does not mark a failed first email sent and keeps a legacy token readable until superseded", async () => {
    const s = await setup();
    mockEmail(false);
    await expect(s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId })).rejects.toThrow("could not be sent");
    const failed = await s.t.run(async (ctx) => ({ proposal: await ctx.db.get(s.proposalId), attempts: await ctx.db.query("transactionalDocumentDeliveryAttempts").collect() }));
    expect(failed.proposal).toMatchObject({ status: "draft" });
    expect(failed.proposal!.currentIssueId).toBeUndefined();
    expect(failed.attempts).toMatchObject([{ result: "failed", recipientEmail: "client-f3a@example.test" }]);
    await s.t.mutation(proposals.updateProposal, { ...s.ownerAuth, proposalId: s.proposalId, title: "Still editable", clientName: "Client" });

    const { hashToken } = await import("../tokens");
    const legacyToken = "legacy-f3a-token";
    await s.t.run((ctx) => ctx.db.patch(s.proposalId, { status: "sent", proposalTokenHash: hashToken(legacyToken), proposalTokenCreatedAt: Date.now() }));
    expect(await s.t.action(delivery.getProposalByToken, { token: legacyToken })).toMatchObject({
      legacyBaseOnly: true,
      proposal: { title: "Still editable", totals: { monthlyTotalLabel: null, oneTimeTotalLabel: null } },
    });
    mockEmail();
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const migrated = await s.t.run(async (ctx) => ({ proposal: await ctx.db.get(s.proposalId), issues: await ctx.db.query("proposalIssues").collect() }));
    expect(migrated.proposal!.currentIssueId).toBeDefined();
    expect(migrated.proposal!.proposalTokenHash).toBeUndefined();
    expect(migrated.issues.filter((issue) => issue.issuedAt)).toHaveLength(1);
    expect(await s.t.action(delivery.getProposalByToken, { token: legacyToken })).toBeNull();
    await expect(s.t.action(delivery.sendProposal, { ...s.otherAuth, proposalId: s.proposalId })).rejects.toThrow("Access denied");
  });

  it("locks a prepared offer, records uncertainty, and retries the same content and link", async () => {
    const s = await setup();
    const { proposalIssueToken, hashToken } = await import("../tokens");
    const nonce = "prepared-nonce";
    const prepared = await s.t.mutation(internal.proposalDeliveryInternal.prepareProposalEmail, {
      companyId: s.companyId, proposalId: s.proposalId,
      tokenNonce: nonce, tokenHash: hashToken(proposalIssueToken(nonce)),
    });
    expect(await s.t.run((ctx) => ctx.db.get(s.proposalId))).toMatchObject({ status: "draft", pendingDeliveryAttemptId: prepared.attemptId });
    expect(await s.t.action(delivery.getProposalByToken, { token: proposalIssueToken(nonce) })).toBeNull();
    await expect(s.t.mutation(proposals.updateProposal, { ...s.ownerAuth, proposalId: s.proposalId, title: "Blocked", clientName: "Client" })).rejects.toThrow("pending");
    await s.t.mutation(internal.proposalDeliveryInternal.finishProposalEmail, {
      companyId: s.companyId, proposalId: s.proposalId, attemptId: prepared.attemptId, result: "unknown",
    });
    const bodies = mockEmail();
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const state = await s.t.run(async (ctx) => ({ proposal: await ctx.db.get(s.proposalId), issues: await ctx.db.query("proposalIssues").collect(), attempts: await ctx.db.query("transactionalDocumentDeliveryAttempts").collect() }));
    expect(state.issues).toHaveLength(1);
    expect(state.proposal).toMatchObject({ status: "sent", currentIssueId: prepared.issueId });
    expect(state.attempts.map((attempt) => attempt.result)).toEqual(["unknown", "provider_accepted"]);
    expect(bodies[0]).toContain(proposalIssueToken(nonce));
    await expect(s.t.mutation(internal.proposalDeliveryInternal.prepareProposalEmail, {
      companyId: s.otherCompanyId, proposalId: s.proposalId,
      tokenNonce: "foreign", tokenHash: "foreign",
    })).rejects.toThrow("Access denied");
  });

  it("expires issue tokens after 60 days and rotates only an expired link on unchanged resend", async () => {
    const s = await setup();
    mockEmail();
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const issue = await s.t.run(async (ctx) => ctx.db.get((await ctx.db.get(s.proposalId))!.currentIssueId!));
    const oldToken = await issueToken(issue);
    await s.t.run((ctx) => ctx.db.patch(issue!._id, { tokenCreatedAt: Date.now() - 60 * 24 * 60 * 60 * 1000 }));
    expect(await s.t.action(delivery.getProposalByToken, { token: oldToken })).toBeNull();
    await expect(s.t.action(delivery.respondToProposal, { token: oldToken, decision: "accepted" })).rejects.toThrow("unavailable");
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const current = await s.t.run(async (ctx) => ({ issue: await ctx.db.get(issue!._id), issues: await ctx.db.query("proposalIssues").collect() }));
    expect(current.issues).toHaveLength(1);
    expect(current.issue!.content).toEqual(issue!.content);
    expect(await issueToken(current.issue)).not.toBe(oldToken);
    expect(await s.t.action(delivery.getProposalByToken, { token: oldToken })).toBeNull();
  });

  it("keeps an owner-recorded draft response explicitly external without inventing an issued history", async () => {
    const s = await setup();
    await s.t.mutation(proposals.markProposalAccepted, { ...s.ownerAuth, proposalId: s.proposalId });
    const state = await s.t.run(async (ctx) => ({ proposal: await ctx.db.get(s.proposalId), issues: await ctx.db.query("proposalIssues").collect() }));
    expect(state.proposal).toMatchObject({ status: "accepted", responseSource: "owner_reported" });
    expect(state.proposal!.responseIssueId).toBeUndefined();
    expect(state.issues).toHaveLength(0);
    const ownerLegacy: any = await s.t.query((api as any).queries.proposals.getProposalByClientRequest,
      { ...s.ownerAuth, clientRequestId: s.requestId });
    expect(ownerLegacy.canonicalPreview).toMatchObject({ source: "legacy_current", issueNumber: null });
    const docs = await s.t.query((api as any).queries.clientPortal.getClientDocuments, s.clientAuth);
    expect(docs.proposals).toMatchObject([{ status: "accepted", title: "Original Proposal", monthlyPriceCents: 10000, basePriceOnly: true }]);
    expect(docs.proposals[0].monthlyTotalCents).toBeUndefined();
  });

  it("recovers a stale pending provider attempt as unknown before retrying its same issue", async () => {
    const s = await setup();
    const { proposalIssueToken, hashToken } = await import("../tokens");
    const nonce = "stale-pending-nonce";
    const prepared = await s.t.mutation(internal.proposalDeliveryInternal.prepareProposalEmail, {
      companyId: s.companyId, proposalId: s.proposalId,
      tokenNonce: nonce, tokenHash: hashToken(proposalIssueToken(nonce)),
    });
    await expect(s.t.mutation(internal.proposalDeliveryInternal.prepareProposalEmail, {
      companyId: s.companyId, proposalId: s.proposalId, tokenNonce: "too-soon", tokenHash: "too-soon",
    })).rejects.toThrow("pending");
    await s.t.run((ctx) => ctx.db.patch(prepared.attemptId, { attemptedAt: Date.now() - 6 * 60 * 1000 }));
    mockEmail();
    await s.t.action(delivery.sendProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const state = await s.t.run(async (ctx) => ({ issues: await ctx.db.query("proposalIssues").collect(), attempts: await ctx.db.query("transactionalDocumentDeliveryAttempts").collect() }));
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0]._id).toBe(prepared.issueId);
    expect(state.attempts.map((attempt) => attempt.result)).toEqual(["unknown", "provider_accepted"]);
  });
});
