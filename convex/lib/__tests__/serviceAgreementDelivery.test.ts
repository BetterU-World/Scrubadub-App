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
      ? await ctx.db.insert("clientUsers", { email: "client@example.com", passwordHash, displayName: "Client", language: options.language, status: "active", createdAt: 1, updatedAt: 1 })
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

  afterEach(() => vi.unstubAllGlobals());

  it("delivers without portal access, falls back to English, and creates no client access", async () => {
    const { t, auth, agreementId } = await setup({ relationshipEmail: "offline@example.com" });
    let emailBody = "";
    successfulEmail((body) => { emailBody = body; });
    const before = await t.run((ctx) => ctx.db.query("clientUsers").collect());

    await expect(t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...auth, agreementId })).resolves.toMatchObject({ success: true });
    expect(emailBody).toContain("Review Agreement");
    expect(await t.run((ctx) => ctx.db.query("clientUsers").collect())).toHaveLength(before.length);
    await expect(t.run((ctx) => ctx.db.get(agreementId))).resolves.toMatchObject({ status: "sent", sentAt: expect.any(Number) });
  });

  it("preserves an existing client's Spanish preference", async () => {
    const { t, auth, agreementId } = await setup({ clientAccess: true, language: "es", relationshipEmail: "cliente@example.com" });
    let emailBody = "";
    successfulEmail((body) => { emailBody = body; });
    await t.action(api.serviceAgreementDeliveryActions.sendServiceAgreement, { ...auth, agreementId });
    expect(emailBody).toContain("Revisar acuerdo");
  });

  it("requires an owned relationship and resolves a request email fallback", async () => {
    const valid = await setup({ requestEmail: "request@example.com" });
    await expect(valid.t.query(internal.serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery, { companyId: valid.companyId, agreementId: valid.agreementId })).resolves.toMatchObject({ recipientEmail: "request@example.com", language: "en" });
    await valid.t.run((ctx) => ctx.db.patch(valid.agreementId, { clientRelationshipId: undefined }));
    await expect(valid.t.query(internal.serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery, { companyId: valid.companyId, agreementId: valid.agreementId })).rejects.toThrow("relationship required");

    const crossed = await setup({ relationshipEmail: "client@example.com" });
    await crossed.t.run((ctx) => ctx.db.patch(crossed.relationshipId, { companyId: crossed.otherCompanyId }));
    await expect(crossed.t.query(internal.serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery, { companyId: crossed.companyId, agreementId: crossed.agreementId })).rejects.toThrow("relationship required");
  });

  it("requires a recipient email and keeps terminal states and cooldown blocked", async () => {
    const missingEmail = await setup();
    await expect(missingEmail.t.query(internal.serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery, { companyId: missingEmail.companyId, agreementId: missingEmail.agreementId })).rejects.toThrow("Add a client email");

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
    const { t, auth, agreementId } = await setup({ relationshipEmail: "client@example.com" });
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
});
