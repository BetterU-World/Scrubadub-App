import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

async function setup(options: { clientAccess?: boolean; language?: string; relationshipEmail?: string; requestEmail?: string } = {}) {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const seeded = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Agreement Co", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { email: "agreement-owner@example.com", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
    const clientUserId = options.clientAccess
      ? await ctx.db.insert("clientUsers", { email: options.relationshipEmail ?? options.requestEmail ?? "client@example.com", passwordHash, displayName: "Client", language: options.language, status: "active", createdAt: 1, updatedAt: 1 })
      : undefined;
    const requestId = await ctx.db.insert("clientRequests", {
      companyId, createdAt: 1, status: "converted", requesterName: "Client",
      requesterEmail: options.requestEmail ?? "", propertySnapshot: {}, source: "manual",
    });
    const relationshipId = await ctx.db.insert("clientRelationships", {
      companyId, clientUserId, displayName: "Client", clientType: "commercial",
      email: options.relationshipEmail, status: "active", sourceClientRequestId: requestId,
      createdAt: 1, updatedAt: 1,
    });
    const proposalId = await ctx.db.insert("proposals", {
      companyId, clientRelationshipId: relationshipId, clientRequestId: requestId,
      createdByUserId: ownerId, title: "Proposal", clientName: "Client", status: "accepted",
      createdAt: 1, updatedAt: 1,
    });
    const agreementId = await ctx.db.insert("serviceAgreements", {
      companyId, clientRelationshipId: relationshipId, clientRequestId: requestId,
      proposalId,
      title: "Cleaning Agreement", status: "ready", agreementType: "commercial_cleaning",
      createdAt: 1, updatedAt: 1,
    });
    return { companyId, otherCompanyId, ownerId, clientUserId, requestId, relationshipId, proposalId, agreementId };
  });
  const auth = await t.action(api.authActions.signIn, { email: "agreement-owner@example.com", password: PASSWORD });
  return { t, ...seeded, auth: { userId: seeded.ownerId, sessionToken: auth.sessionToken } };
}

function successfulEmail(capture?: (body: string) => void) {
  vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
    capture?.(String(init?.body ?? ""));
    return new Response(JSON.stringify({ id: "email-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

describe("service agreement delivery", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "https://app.scrub.test";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  });

  afterEach(() => { vi.unstubAllGlobals(); delete process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS; });

  it("blocks agreement email without portal access before creating an issue or delivery attempt, while outside send remains available", async () => {
    const { t, auth, agreementId } = await setup({ relationshipEmail: "offline@example.com" });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...auth, agreementId })).rejects.toThrow("Active Client Portal access");
    expect(fetch).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("serviceAgreementIssues").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("transactionalDocumentDeliveryAttempts").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.get(agreementId))).toMatchObject({ status: "ready" });
    await t.mutation(api.mutations.serviceAgreements.markSent, { ...auth, agreementId });
    expect(await t.run((ctx) => ctx.db.get(agreementId))).toMatchObject({ status: "sent", sentAt: expect.any(Number) });
  });

  it("emails normally when the active relationship, linked login, and recipient address match", async () => {
    const { t, auth, agreementId } = await setup({ clientAccess: true, relationshipEmail: "client@example.com" });
    let emailBody = "";
    successfulEmail((body) => { emailBody = body; });
    await expect(t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...auth, agreementId })).resolves.toMatchObject({ success: true });
    expect(emailBody).toContain("Review Agreement");
    expect(await t.run((ctx) => ctx.db.get(agreementId))).toMatchObject({ status: "sent", sentAt: expect.any(Number) });
  });

  it("projects invitation, inactive relationship, missing email, and recipient mismatch separately from email availability", async () => {
    const s = await setup({ relationshipEmail: "client@example.com" });
    const access = async () => (await s.t.query(api.queries.serviceAgreements.getById, { ...s.auth, agreementId: s.agreementId }) as any).portalAccess;
    expect(await access()).toMatchObject({ status: "not_invited", recipientEmailAvailable: true, canEmail: false });
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { inviteTokenHash: "pending" }));
    expect(await access()).toMatchObject({ status: "invitation_pending", canEmail: false });
    const clientUserId = await s.t.run((ctx) => ctx.db.insert("clientUsers", { email: "client@example.com", displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 }));
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { clientUserId, inviteTokenHash: undefined }));
    expect(await access()).toMatchObject({ status: "ready", activeClientUserLinked: true, canEmail: true });
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { status: "inactive" }));
    expect(await access()).toMatchObject({ status: "relationship_inactive", canEmail: false });
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { status: "active", email: "other@example.com" }));
    expect(await access()).toMatchObject({ status: "recipient_mismatch", canEmail: false });
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { email: undefined }));
    expect(await access()).toMatchObject({ status: "recipient_email_missing", canEmail: false });
    await expect(s.t.mutation(internal.serviceAgreementDeliveryInternal.prepareAgreementEmail, { companyId: s.companyId, agreementId: s.agreementId })).rejects.toThrow("Active Client Portal access");
    expect(await s.t.run((ctx) => ctx.db.query("serviceAgreementIssues").collect())).toHaveLength(0);
  });

  it("preserves an existing client's Spanish preference", async () => {
    const { t, auth, agreementId } = await setup({ clientAccess: true, language: "es", relationshipEmail: "cliente@example.com" });
    let emailBody = "";
    successfulEmail((body) => { emailBody = body; });
    await t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...auth, agreementId });
    expect(emailBody).toContain("Revisar acuerdo");
  });

  it("requires an owned relationship and resolves a request email fallback", async () => {
    const valid = await setup({ clientAccess: true, requestEmail: "request@example.com" });
    await expect(valid.t.query(internal.serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery, { companyId: valid.companyId, agreementId: valid.agreementId })).resolves.toMatchObject({ recipientEmail: "request@example.com", language: "en" });
    await valid.t.run((ctx) => ctx.db.patch(valid.agreementId, { clientRelationshipId: undefined }));
    await expect(valid.t.query(internal.serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery, { companyId: valid.companyId, agreementId: valid.agreementId })).rejects.toThrow("Active Client Portal access");

    const crossed = await setup({ clientAccess: true, relationshipEmail: "client@example.com" });
    await crossed.t.run((ctx) => ctx.db.patch(crossed.relationshipId, { companyId: crossed.otherCompanyId }));
    await expect(crossed.t.query(internal.serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery, { companyId: crossed.companyId, agreementId: crossed.agreementId })).rejects.toThrow("Active Client Portal access");
  });

  it("requires a recipient email and keeps terminal states and cooldown blocked", async () => {
    const missingEmail = await setup({ clientAccess: true });
    await expect(missingEmail.t.query(internal.serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery, { companyId: missingEmail.companyId, agreementId: missingEmail.agreementId })).rejects.toThrow("Active Client Portal access");

    for (const status of ["signed", "cancelled"] as const) {
      const terminal = await setup({ relationshipEmail: "client@example.com" });
      await terminal.t.run((ctx) => ctx.db.patch(terminal.agreementId, { status }));
      await expect(terminal.t.query(internal.serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery, { companyId: terminal.companyId, agreementId: terminal.agreementId })).rejects.toThrow("cannot be sent");
    }

    const duplicate = await setup({ relationshipEmail: "client@example.com" });
    await duplicate.t.run((ctx) => ctx.db.patch(duplicate.agreementId, { status: "sent", sentAt: Date.now() }));
    await expect(duplicate.t.query(internal.serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery, { companyId: duplicate.companyId, agreementId: duplicate.agreementId })).rejects.toThrow("just sent");
  });

  it("marks sent only after successful email delivery", async () => {
    const { t, auth, agreementId } = await setup({ clientAccess: true, relationshipEmail: "client@example.com" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "transport failed" }), { status: 500, headers: { "Content-Type": "application/json" } })));
    await expect(t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...auth, agreementId })).rejects.toThrow("could not be sent");
    const agreement = await t.run((ctx) => ctx.db.get(agreementId));
    expect(agreement?.status).toBe("ready");
    expect(agreement?.sentAt).toBeUndefined();
  });

  it("keeps client agreement reads and responses behind verified client access", async () => {
    const { t, agreementId, clientUserId } = await setup({ clientAccess: true, relationshipEmail: "client@example.com" });
    await expect(t.query(api.queries.serviceAgreements.getForClient, { clientUserId: clientUserId!, sessionToken: "invalid", agreementId })).rejects.toThrow("verified session");
    await expect(t.mutation(api.mutations.serviceAgreements.clientAccept, { clientUserId: clientUserId!, sessionToken: "invalid", agreementId })).rejects.toThrow("verified session");
  });

  it("keeps sales delivery and client invitations under their separate Manager capabilities", async () => {
    const s = await setup({ clientAccess: true, relationshipEmail: "client@example.com" });
    const managers = await s.t.run(async (ctx) => {
      const passwordHash = await hashPassword(PASSWORD);
      const salesOnly = await ctx.db.insert("users", { companyId: s.companyId, email: "sales-only@example.com", passwordHash, name: "Sales", role: "manager", status: "active", canManageSalesAndCommercial: true });
      const salesAndClients = await ctx.db.insert("users", { companyId: s.companyId, email: "sales-clients@example.com", passwordHash, name: "Sales Clients", role: "manager", status: "active", canManageSalesAndCommercial: true, canManageClients: true });
      const unauthorized = await ctx.db.insert("users", { companyId: s.companyId, email: "no-sales@example.com", passwordHash, name: "No Sales", role: "manager", status: "active", canManageClients: true });
      return { salesOnly, salesAndClients, unauthorized };
    });
    const salesSession = await s.t.action(api.authActions.signIn, { email: "sales-only@example.com", password: PASSWORD });
    const fullSession = await s.t.action(api.authActions.signIn, { email: "sales-clients@example.com", password: PASSWORD });
    const unauthorizedSession = await s.t.action(api.authActions.signIn, { email: "no-sales@example.com", password: PASSWORD });
    const salesAuth = { userId: managers.salesOnly, sessionToken: salesSession.sessionToken };
    expect(await s.t.query(api.queries.serviceAgreements.getById, { ...salesAuth, agreementId: s.agreementId })).toMatchObject({ portalAccess: { canEmail: true } });
    await expect(s.t.query(api.queries.serviceAgreements.getById, { userId: managers.unauthorized, sessionToken: unauthorizedSession.sessionToken, agreementId: s.agreementId })).rejects.toThrow("canManageSalesAndCommercial");
    await expect(s.t.action(api.clientAuthActions.inviteClient, { ...salesAuth, relationshipId: s.relationshipId })).rejects.toThrow("canManageClients");
    process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS = "true";
    await expect(s.t.action(api.clientAuthActions.inviteClient, { userId: managers.salesAndClients, sessionToken: fullSession.sessionToken, relationshipId: s.relationshipId })).resolves.toMatchObject({ status: "active" });
    delete process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS;
    successfulEmail();
    await expect(s.t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...salesAuth, agreementId: s.agreementId })).resolves.toMatchObject({ success: true });
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { clientUserId: undefined }));
    process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS = "true";
    await expect(s.t.action(api.clientAuthActions.inviteClient, { userId: managers.salesAndClients, sessionToken: fullSession.sessionToken, relationshipId: s.relationshipId })).resolves.toMatchObject({ status: "pending" });
    delete process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS;
  });
});
