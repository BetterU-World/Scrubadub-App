import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";
import { assertAgreementPriceConsistency } from "../serviceAgreementIssuedContent";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const mutations = (api as any).mutations.serviceAgreements;
const queries = (api as any).queries.serviceAgreements;

beforeEach(() => {
  process.env.TOKEN_PEPPER = "f3b-test-pepper";
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
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Agreement Co", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Foreign Co", timezone: "America/New_York" });
    const siteId = await ctx.db.insert("companySites", { companyId, slug: "f3b", templateId: "A", brandName: "Agreement Brand", publicEmail: "brand@example.test", bio: "", serviceArea: "", services: [] });
    const ownerId = await ctx.db.insert("users", { companyId, email: "f3b-owner@example.test", passwordHash, name: "Owner", role: "owner", status: "active" });
    const managerId = await ctx.db.insert("users", { companyId, email: "f3b-manager@example.test", passwordHash, name: "Manager", role: "manager", status: "active", canManageSalesAndCommercial: false });
    const foreignOwnerId = await ctx.db.insert("users", { companyId: otherCompanyId, email: "f3b-foreign@example.test", passwordHash, name: "Foreign", role: "owner", status: "active" });
    const clientUserId = await ctx.db.insert("clientUsers", { email: "f3b-client@example.test", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const otherClientUserId = await ctx.db.insert("clientUsers", { email: "f3b-other@example.test", passwordHash, displayName: "Other client", status: "active", createdAt: 1, updatedAt: 1 });
    const relationshipId = await ctx.db.insert("clientRelationships", { companyId, clientUserId, displayName: "Client", clientType: "commercial", status: "active", email: "f3b-client@example.test", createdAt: 1, updatedAt: 1 });
    const requestId = await ctx.db.insert("clientRequests", { companyId, clientRelationshipId: relationshipId, requesterName: "Client", requesterEmail: "f3b-client@example.test", propertySnapshot: { address: "1 Main St" }, requestedService: "Cleaning", source: "manual", status: "accepted", createdAt: 1 });
    const proposalId = await ctx.db.insert("proposals", { companyId, clientRelationshipId: relationshipId, clientRequestId: requestId, createdByUserId: ownerId, title: "Proposal", clientName: "Client", scopeOfWork: "Original scope", monthlyPriceCents: 10000, status: "accepted", createdAt: 1, updatedAt: 1 });
    const templateId = await ctx.db.insert("documentTemplates", { companyId, type: "service_agreement", name: "Original Template", body: "Scope: {{scope_of_work}}. Terms: {{terms}}. End: {{agreement_end_date}}.", version: 3, isDefault: true, createdAt: 1, updatedAt: 1 });
    return { companyId, otherCompanyId, siteId, ownerId, managerId, foreignOwnerId, clientUserId, otherClientUserId, relationshipId, requestId, proposalId, templateId };
  });
  const owner = await t.action(api.authActions.signIn, { email: "f3b-owner@example.test", password: PASSWORD });
  const manager = await t.action(api.authActions.signIn, { email: "f3b-manager@example.test", password: PASSWORD });
  const foreign = await t.action(api.authActions.signIn, { email: "f3b-foreign@example.test", password: PASSWORD });
  const client = await t.action(api.clientAuthActions.signIn, { email: "f3b-client@example.test", password: PASSWORD });
  const otherClient = await t.action(api.clientAuthActions.signIn, { email: "f3b-other@example.test", password: PASSWORD });
  const agreementId = await t.mutation(mutations.createDraftFromAcceptedProposal, { userId: ids.ownerId, sessionToken: owner.sessionToken, proposalId: ids.proposalId });
  return { t, ...ids, agreementId,
    ownerAuth: { userId: ids.ownerId, sessionToken: owner.sessionToken },
    managerAuth: { userId: ids.managerId, sessionToken: manager.sessionToken },
    foreignAuth: { userId: ids.foreignOwnerId, sessionToken: foreign.sessionToken },
    clientAuth: { clientUserId: ids.clientUserId, sessionToken: client.sessionToken },
    otherClientAuth: { clientUserId: ids.otherClientUserId, sessionToken: otherClient.sessionToken } };
}

async function update(s: Awaited<ReturnType<typeof setup>>, changes: Record<string, unknown>) {
  const agreement = await s.t.run((ctx) => ctx.db.get(s.agreementId));
  return s.t.mutation(mutations.update, {
    ...s.ownerAuth, agreementId: s.agreementId,
    title: agreement!.title, clientName: agreement!.clientName,
    propertyAddress: agreement!.propertyAddress, servicesIncluded: agreement!.servicesIncluded,
    priceSummary: agreement!.priceSummary, billingSchedule: agreement!.billingSchedule,
    specialInstructions: agreement!.specialInstructions, exceptions: agreement!.exceptions,
    body: agreement!.body, effectiveStartDate: agreement!.effectiveStartDate,
    effectiveEndDate: agreement!.effectiveEndDate, renewalDate: agreement!.renewalDate,
    serviceFrequency: agreement!.serviceFrequency, contractAmountCents: agreement!.contractAmountCents,
    paymentTerms: agreement!.paymentTerms, scopeOfWork: agreement!.scopeOfWork,
    terms: agreement!.terms, notes: agreement!.notes, ...changes,
  });
}

async function issue(s: Awaited<ReturnType<typeof setup>>) {
  return s.t.run(async (ctx) => {
    const agreement = await ctx.db.get(s.agreementId);
    return agreement!.currentIssueId ? ctx.db.get(agreement!.currentIssueId) : null;
  });
}

describe("service agreement issued content", () => {
  it("removes every thousands separator when comparing a price summary", () => {
    expect(() => assertAgreementPriceConsistency({ contractAmountCents: 123456789, priceSummary: "$1,234,567.89 per month" })).not.toThrow();
    expect(() => assertAgreementPriceConsistency({ contractAmountCents: 123456788, priceSummary: "$1,234,567.89 per month" })).toThrow("price summary disagree");
  });
  it("uses one canonical preview, resolves structured edits, freezes content and provenance", async () => {
    const s = await setup();
    await update(s, { scopeOfWork: "Updated scope", terms: "Thirty day notice", effectiveEndDate: "2031-12-31", paymentTerms: "Net 15", notes: "INTERNAL ONLY", body: "CONTRADICTORY OVERRIDE" });
    const preview: any = await s.t.query(queries.getById, { ...s.ownerAuth, agreementId: s.agreementId });
    expect(preview.canonicalPreview).toMatchObject({ scopeOfWork: "Updated scope", terms: "Thirty day notice", effectiveEndDate: "2031-12-31", paymentTerms: "Net 15" });
    expect(preview.canonicalPreview.body).toContain("Scope: Updated scope. Terms: Thirty day notice. End: 2031-12-31.");
    expect(JSON.stringify(preview.canonicalPreview)).not.toMatch(/CONTRADICTORY|INTERNAL ONLY/);
    expect(preview).toMatchObject({ templateId: s.templateId, templateNameAtGeneration: "Original Template", templateVersionAtGeneration: 3 });
    await s.t.mutation(mutations.markSent, { ...s.ownerAuth, agreementId: s.agreementId });
    const first = await issue(s);
    expect(first!.content).toEqual(preview.canonicalPreview);
    expect(first).toMatchObject({ issueNumber: 1, templateId: s.templateId, templateName: "Original Template", templateVersion: 3, issuedAt: expect.any(Number) });
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.templateId, { name: "New Template", body: "Changed template", version: 4 });
      await ctx.db.patch(s.siteId, { brandName: "Changed Brand" });
      await ctx.db.patch(s.agreementId, { title: "Changed working row", body: "Changed working body" });
    });
    const client: any = await s.t.query(queries.getForClient, { ...s.clientAuth, agreementId: s.agreementId });
    expect(client).toMatchObject({ issueId: first!._id, title: preview.canonicalPreview.title, companyName: "Agreement Brand", terms: "Thirty day notice", paymentTerms: "Net 15", body: first!.content.body });
    const documents: any = await s.t.query((api as any).queries.clientPortal.getClientDocuments, s.clientAuth);
    expect(documents.agreements).toMatchObject([{ title: preview.canonicalPreview.title, providerName: "Agreement Brand" }]);
    expect(await s.t.query(queries.listForClient, s.clientAuth)).toMatchObject([{ title: preview.canonicalPreview.title, issueId: first!._id }]);
    expect(client).not.toHaveProperty("notes");
    expect((await issue(s))!.content).toEqual(first!.content);
    await expect(update(s, { title: "Unauthorized edit" })).rejects.toThrow("Make changes");
  });

  it("blocks a contradictory numeric amount and price summary before issue", async () => {
    const s = await setup();
    await update(s, { contractAmountCents: 20000 });
    await expect(s.t.mutation(mutations.markSent, { ...s.ownerAuth, agreementId: s.agreementId })).rejects.toThrow("price summary disagree");
    expect(await s.t.run((ctx) => ctx.db.query("serviceAgreementIssues").collect())).toHaveLength(0);
    await update(s, { contractAmountCents: 20000, priceSummary: "$200.00 per month" });
    await s.t.mutation(mutations.markSent, { ...s.ownerAuth, agreementId: s.agreementId });
    expect((await issue(s))!.content).toMatchObject({ contractAmountCents: 20000, priceSummary: "$200.00 per month" });
  });

  it("withdraws before editing, rejects stale acknowledgment/decline, then records the current issue and client identity", async () => {
    const s = await setup();
    await s.t.mutation(mutations.markSent, { ...s.ownerAuth, agreementId: s.agreementId });
    const first = await issue(s);
    await s.t.mutation(mutations.returnToDraft, { ...s.ownerAuth, agreementId: s.agreementId });
    expect((await s.t.query(queries.getForClient, { ...s.clientAuth, agreementId: s.agreementId }) as any)).toMatchObject({ unavailable: true });
    expect((await s.t.query((api as any).queries.clientPortal.getClientDocuments, s.clientAuth) as any).agreements).toHaveLength(0);
    expect((await s.t.query((api as any).queries.clientPortal.getClientRequestDetail, { ...s.clientAuth, requestId: s.requestId }) as any).request.agreements).toHaveLength(0);
    expect((await issue(s))).toBeNull();
    expect(await s.t.run((ctx) => ctx.db.get(first!._id))).toMatchObject({ withdrawnAt: expect.any(Number), content: first!.content });
    await expect(s.t.mutation(mutations.clientAccept, { ...s.clientAuth, agreementId: s.agreementId, issueId: first!._id })).rejects.toThrow();
    await expect(s.t.mutation(mutations.clientDecline, { ...s.clientAuth, agreementId: s.agreementId, issueId: first!._id })).rejects.toThrow();
    await update(s, { terms: "Reissued terms" });
    await s.t.mutation(mutations.markSent, { ...s.ownerAuth, agreementId: s.agreementId });
    const second = await issue(s);
    expect(second).toMatchObject({ issueNumber: 2, content: expect.objectContaining({ terms: "Reissued terms" }) });
    await expect(s.t.mutation(mutations.clientAccept, { ...s.clientAuth, agreementId: s.agreementId, issueId: first!._id })).rejects.toThrow("updated");
    await expect(s.t.mutation(mutations.clientDecline, { ...s.clientAuth, agreementId: s.agreementId, issueId: first!._id })).rejects.toThrow("updated");
    await s.t.mutation(mutations.clientAccept, { ...s.clientAuth, agreementId: s.agreementId, issueId: second!._id });
    const acknowledged = await s.t.run((ctx) => ctx.db.get(s.agreementId));
    expect(acknowledged).toMatchObject({ status: "signed", acknowledgedAt: expect.any(Number), acknowledgedIssueId: second!._id, acknowledgedByClientUserId: s.clientUserId });
    expect(acknowledged?.signedAt).toBeUndefined();
    await s.t.mutation(mutations.markSigned, { ...s.ownerAuth, agreementId: s.agreementId });
    expect(await s.t.run((ctx) => ctx.db.get(s.agreementId))).toMatchObject({ acknowledgedIssueId: second!._id, signedReceivedIssueId: second!._id, signedReceivedRecordedByUserId: s.ownerId, signedReceivedSource: "owner_reported_external", signedAt: expect.any(Number) });
  });

  it("distinguishes decline, owner cancellation, withdrawal, and external signed receipt without an issue", async () => {
    const declined = await setup();
    await declined.t.mutation(mutations.markSent, { ...declined.ownerAuth, agreementId: declined.agreementId });
    const current = await issue(declined);
    await declined.t.mutation(mutations.clientDecline, { ...declined.clientAuth, agreementId: declined.agreementId, issueId: current!._id, note: "No" });
    expect(await declined.t.run((ctx) => ctx.db.get(declined.agreementId))).toMatchObject({ status: "cancelled", declinedIssueId: current!._id, declinedByClientUserId: declined.clientUserId, declinedAt: expect.any(Number) });
    const cancelled = await setup();
    await cancelled.t.mutation(mutations.markCancelled, { ...cancelled.ownerAuth, agreementId: cancelled.agreementId });
    const cancelledRow = await cancelled.t.run((ctx) => ctx.db.get(cancelled.agreementId));
    expect(cancelledRow).toMatchObject({ status: "cancelled", cancelledAt: expect.any(Number) });
    expect(cancelledRow?.declinedAt).toBeUndefined();
    const external = await setup();
    await external.t.mutation(mutations.markSigned, { ...external.ownerAuth, agreementId: external.agreementId });
    const externalRow = await external.t.run((ctx) => ctx.db.get(external.agreementId));
    expect(externalRow).toMatchObject({ signedReceivedSource: "owner_reported_external" });
    expect(externalRow?.signedReceivedIssueId).toBeUndefined();
    expect(externalRow?.acknowledgedAt).toBeUndefined();
    expect(await external.t.query(queries.getForClient, { ...external.clientAuth, agreementId: external.agreementId })).toMatchObject({ issueId: null, externalSignedReceiptWithoutIssue: true });
  }, 15_000);

  it("preserves company, relationship, and manager capability boundaries", async () => {
    const s = await setup();
    await expect(s.t.query(queries.getById, { ...s.foreignAuth, agreementId: s.agreementId })).rejects.toThrow("Access denied");
    await expect(s.t.mutation(mutations.markSent, { ...s.foreignAuth, agreementId: s.agreementId })).rejects.toThrow("Access denied");
    await expect(s.t.query(queries.getById, { ...s.managerAuth, agreementId: s.agreementId })).rejects.toThrow("canManageSalesAndCommercial permission required");
    await expect(s.t.mutation(mutations.markSent, { ...s.managerAuth, agreementId: s.agreementId })).rejects.toThrow("canManageSalesAndCommercial permission required");
    await s.t.mutation(mutations.markSent, { ...s.ownerAuth, agreementId: s.agreementId });
    expect(await s.t.query(queries.getForClient, { ...s.otherClientAuth, agreementId: s.agreementId })).toBeNull();
    await expect(s.t.mutation(mutations.clientAccept, { ...s.otherClientAuth, agreementId: s.agreementId, issueId: (await issue(s))!._id })).rejects.toThrow();
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { status: "inactive" }));
    expect(await s.t.query(queries.getForClient, { ...s.clientAuth, agreementId: s.agreementId })).toBeNull();
  });

  it("records failed, accepted, and repeated email attempts without inventing delivery", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "failed" }), { status: 500, headers: { "Content-Type": "application/json" } })));
    await expect(s.t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...s.ownerAuth, agreementId: s.agreementId })).rejects.toThrow("could not be sent");
    const failedRow = await s.t.run((ctx) => ctx.db.get(s.agreementId));
    expect(failedRow?.status).toBe("draft");
    expect(failedRow?.currentIssueId).toBeUndefined();
    expect((await s.t.run((ctx) => ctx.db.query("transactionalDocumentDeliveryAttempts").collect()))[0]).toMatchObject({ result: "failed", errorCategory: "email_send_failed", recipientEmail: "f3b-client@example.test" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "provider-id" }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await s.t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...s.ownerAuth, agreementId: s.agreementId });
    const first = await issue(s);
    await expect(s.t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...s.ownerAuth, agreementId: s.agreementId })).rejects.toThrow("just sent");
    await s.t.run(async (ctx) => {
      const attempts = await ctx.db.query("transactionalDocumentDeliveryAttempts").collect();
      const accepted = attempts.find((a) => a.result === "provider_accepted")!;
      await ctx.db.patch(accepted._id, { attemptedAt: Date.now() - 61_000 });
    });
    await s.t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...s.ownerAuth, agreementId: s.agreementId });
    const state = await s.t.run(async (ctx) => ({ issues: await ctx.db.query("serviceAgreementIssues").collect(), attempts: await ctx.db.query("transactionalDocumentDeliveryAttempts").collect() }));
    expect(state.issues).toHaveLength(2); // Failed prepared issue is withdrawn; resend reuses issue 2.
    expect(state.issues[1]._id).toBe(first!._id);
    expect(state.attempts.map((a) => a.result)).toEqual(["failed", "provider_accepted", "provider_accepted"]);
    expect(state.attempts[1].providerMessageId).toBe("provider-id");
  });

  it("keeps an unknown provider result pending and retries the prepared content", async () => {
    const s = await setup();
    const args = { companyId: s.companyId, agreementId: s.agreementId };
    const first: any = await s.t.mutation(internal.serviceAgreementDeliveryInternal.prepareAgreementEmail, args);
    await s.t.mutation(internal.serviceAgreementDeliveryInternal.finishAgreementEmail, { ...args, attemptId: first.attemptId, result: "unknown" });
    expect(await s.t.run((ctx) => ctx.db.get(first.attemptId))).toMatchObject({ result: "unknown", errorCategory: "finalization_uncertain" });
    const waiting = await s.t.run((ctx) => ctx.db.get(s.agreementId));
    expect(waiting).toMatchObject({ status: "draft", pendingDeliveryAttemptId: first.attemptId });
    expect(waiting?.currentIssueId).toBeUndefined();
    await expect(update(s, { title: "Locked" })).rejects.toThrow("pending");
    const second: any = await s.t.mutation(internal.serviceAgreementDeliveryInternal.prepareAgreementEmail, args);
    expect(second.issueId).toBe(first.issueId);
    expect(second.content).toEqual(first.content);
    await s.t.mutation(internal.serviceAgreementDeliveryInternal.finishAgreementEmail, { ...args, attemptId: second.attemptId, result: "provider_accepted" });
    expect(await s.t.run((ctx) => ctx.db.get(s.agreementId))).toMatchObject({ status: "sent", currentIssueId: first.issueId });
  });

  it("reads legacy statuses and bodies without inventing historical issues", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.agreementId, { contentMode: undefined, templateBody: undefined, status: "draft", body: "VERBATIM LEGACY BODY" }));
    expect((await s.t.query(queries.getById, { ...s.ownerAuth, agreementId: s.agreementId }) as any).canonicalPreview.body).toBe("VERBATIM LEGACY BODY");
    await s.t.run((ctx) => ctx.db.patch(s.agreementId, { status: "ready" }));
    expect((await s.t.query(queries.getById, { ...s.ownerAuth, agreementId: s.agreementId }) as any).canonicalPreview.body).toBe("VERBATIM LEGACY BODY");
    await s.t.run((ctx) => ctx.db.patch(s.agreementId, { status: "sent", sentAt: 10 }));
    expect(await s.t.query(queries.getForClient, { ...s.clientAuth, agreementId: s.agreementId })).toMatchObject({ body: "VERBATIM LEGACY BODY", issueId: null });
    expect(await s.t.run((ctx) => ctx.db.query("serviceAgreementIssues").collect())).toHaveLength(0);
    await s.t.mutation(mutations.clientAccept, { ...s.clientAuth, agreementId: s.agreementId });
    expect(await s.t.query(queries.getForClient, { ...s.clientAuth, agreementId: s.agreementId })).toMatchObject({ status: "signed", body: "VERBATIM LEGACY BODY" });
    await s.t.mutation(mutations.markSigned, { ...s.ownerAuth, agreementId: s.agreementId });
    expect(await s.t.query(queries.getForClient, { ...s.clientAuth, agreementId: s.agreementId })).toMatchObject({ status: "signed", signedAt: expect.any(Number) });
    await s.t.run((ctx) => ctx.db.patch(s.agreementId, { status: "cancelled", signedAt: undefined, declinedAt: 20, cancelledAt: 20 }));
    expect(await s.t.query(queries.getForClient, { ...s.clientAuth, agreementId: s.agreementId })).toMatchObject({ status: "cancelled", declinedAt: 20, body: "VERBATIM LEGACY BODY" });
    await s.t.run((ctx) => ctx.db.patch(s.agreementId, { declinedAt: undefined }));
    expect(await s.t.query(queries.getForClient, { ...s.clientAuth, agreementId: s.agreementId })).toMatchObject({ status: "cancelled", body: "VERBATIM LEGACY BODY" });
  });
});
