import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

function backend() {
  return convexTest(schema, modules);
}

async function seed(t: ReturnType<typeof backend>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "Invite Company", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "Other Company", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { email: "owner@invite.test", passwordHash, name: "Owner", companyId: companyA, role: "owner", status: "active" });
    const manager = await ctx.db.insert("users", { email: "manager@invite.test", passwordHash, name: "Manager", companyId: companyA, role: "manager", status: "active", canSeeAllJobs: true });
    const cleaner = await ctx.db.insert("users", { email: "cleaner@invite.test", passwordHash, name: "Cleaner", companyId: companyA, role: "cleaner", status: "active" });
    const otherOwner = await ctx.db.insert("users", { email: "other@invite.test", passwordHash, name: "Other", companyId: companyB, role: "owner", status: "active" });
    return { companyA, companyB, owner, manager, cleaner, otherOwner };
  });
}

async function login(t: ReturnType<typeof backend>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

async function createRequest(t: ReturnType<typeof backend>, companyId: any, overrides: Record<string, unknown> = {}) {
  return await t.run((ctx) => ctx.db.insert("clientRequests", {
    companyId,
    createdAt: Date.now(),
    status: "new",
    requesterName: "Jamie Client",
    requesterEmail: "jamie@client.test",
    businessName: "Jamie's Homes",
    propertySnapshot: {},
    source: "manual",
    leadType: "residential",
    ...overrides,
  } as any));
}

describe("request client portal invitations", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    process.env.TOKEN_PEPPER = "request-invite-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "https://app.scrub.test";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "provider-id" })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not silently replace the client record email or match a different contact by business name", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t, "owner@invite.test");
    const relationshipId = await t.run(ctx => ctx.db.insert("clientRelationships", { companyId: s.companyA,
      displayName: "Jamie's Homes", businessName: "Jamie's Homes", email: "office@client.test",
      clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 }));
    const unlinked = await createRequest(t, s.companyA);
    const args = { userId: s.owner, sessionToken: auth.sessionToken };
    await expect(t.action(api.clientAuthActions.inviteClientFromRequest,
      { ...args, requestId: unlinked, expectedEmail: "jamie@client.test" })).rejects.toThrow("details changed");
    expect((await t.run(ctx => ctx.db.get(unlinked)))?.clientRelationshipId).toBeUndefined();
    const requestId = await createRequest(t, s.companyA, { clientRelationshipId: relationshipId });
    await expect(t.action(api.clientAuthActions.inviteClientFromRequest,
      { ...args, requestId, expectedEmail: "jamie@client.test" })).rejects.toThrow("details changed");
    await expect(t.action(api.clientAuthActions.inviteClientFromRequest,
      { ...args, requestId, expectedEmail: "office@client.test", locale: "es" })).resolves.toMatchObject({ status: "pending" });
    expect((await t.run(ctx => ctx.db.get(relationshipId)))?.email).toBe("office@client.test");
    await t.finishAllScheduledFunctions(() => { vi.runAllTimers(); });
    expect(vi.mocked(fetch).mock.calls.some(([, init]) =>
      String(init?.body).includes("office@client.test") && String(init?.body).includes("Abrir invitación"))).toBe(true);
  });

  it("requires the returning client's password and preserves relationship scope and single-use redemption", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t, "owner@invite.test");
    const passwordHash = await hashPassword(PASSWORD);
    const { clientUserId, relationshipId, otherRelationshipId } = await t.run(async ctx => {
      const clientUserId = await ctx.db.insert("clientUsers", { email: "jamie@client.test", displayName: "Jamie",
        passwordHash, status: "active", createdAt: 1, updatedAt: 1 });
      const fields = { displayName: "Jamie", email: "jamie@client.test", clientType: "residential", status: "active",
        createdAt: 1, updatedAt: 1 } as const;
      const relationshipId = await ctx.db.insert("clientRelationships", { ...fields, companyId: s.companyA });
      const otherRelationshipId = await ctx.db.insert("clientRelationships", { ...fields, companyId: s.companyB, clientUserId });
      return { clientUserId, relationshipId, otherRelationshipId };
    });
    const result = await t.action(api.clientAuthActions.inviteClient, {
      userId: s.owner, sessionToken: auth.sessionToken, relationshipId, expectedEmail: "jamie@client.test",
    });
    const token = result.inviteUrl.split("/").pop()!;
    await expect(t.action(api.clientAuthActions.getInviteInfo, { token })).resolves.toMatchObject({ accountMode: "existing" });
    await expect(t.action(api.clientAuthActions.acceptInvite, { token, password: "incorrect-password" })).rejects.toThrow("did not match");
    expect((await t.run(ctx => ctx.db.get(relationshipId)))?.clientUserId).toBeUndefined();
    await expect(t.action(api.clientAuthActions.acceptInvite, { token, password: PASSWORD })).resolves.toMatchObject({ clientUserId });
    await expect(t.action(api.clientAuthActions.acceptInvite, { token, password: PASSWORD })).rejects.toThrow("expired invite");
    expect((await t.run(ctx => ctx.db.get(otherRelationshipId)))?.clientUserId).toBe(clientUserId);
    expect((await t.run(ctx => ctx.db.get(clientUserId)))?.passwordHash).toBe(passwordHash);
  });

  it("reuses one identity when two authorized companies invite the same new mailbox", async () => {
    const t = backend();
    const s = await seed(t);
    const [auth, other] = await Promise.all([login(t, "owner@invite.test"), login(t, "other@invite.test")]);
    const [a, b] = await t.run(ctx => Promise.all([s.companyA, s.companyB].map(companyId =>
      ctx.db.insert("clientRelationships", { companyId, displayName: "Jamie", email: "jamie@client.test",
        clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 })
    )));
    const outcomes = await Promise.all([
      t.action(api.clientAuthActions.inviteClient, { userId: s.owner, sessionToken: auth.sessionToken, relationshipId: a }),
      t.action(api.clientAuthActions.inviteClient, { userId: s.otherOwner, sessionToken: other.sessionToken, relationshipId: b }),
    ]);
    const accounts = await t.run(ctx => ctx.db.query("clientUsers").collect());
    expect(accounts).toHaveLength(1);
    const [left, right] = await t.run(ctx => Promise.all([ctx.db.get(a), ctx.db.get(b)]));
    for (const relationship of [left, right]) {
      expect(relationship?.pendingInviteClientUserId ?? relationship?.clientUserId).toBe(accounts[0]._id);
    }
    await t.run(ctx => ctx.db.patch(a, { inviteTokenExpiry: Date.now() - 1 }));
    const expiredToken = outcomes[0].inviteUrl.split("/").pop()!;
    await expect(t.action(api.clientAuthActions.getInviteInfo, { token: expiredToken })).resolves.toBeNull();
    await expect(t.action(api.clientAuthActions.acceptInvite, { token: expiredToken, password: PASSWORD })).rejects.toThrow("expired invite");
  }, 15000);

  it("creates a missing relationship canonically, sends the existing invite, and preserves acceptance", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t, "owner@invite.test");
    const requestId = await createRequest(t, s.companyA);

    const result = await t.action(api.clientAuthActions.inviteClientFromRequest, {
      userId: s.owner,
      sessionToken: auth.sessionToken,
      requestId,
    });
    expect(result).toMatchObject({ emailSent: true, status: "pending" });

    const state: any = await t.run(async (ctx) => {
      const request = await ctx.db.get(requestId);
      const relationship = request?.clientRelationshipId ? await ctx.db.get(request.clientRelationshipId) : null;
      const audits = await ctx.db.query("auditLog").collect();
      return { request, relationship, audits };
    });
    expect(state.relationship).toMatchObject({ companyId: s.companyA, email: "jamie@client.test", status: "active" });
    expect(state.relationship.inviteTokenHash).toBeTruthy();
    expect(state.audits.some((event: any) => event.action === "client_portal_invitation_sent_from_request")).toBe(true);

    const token = result.inviteUrl.split("/").pop()!;
    await expect(t.action(api.clientAuthActions.acceptInvite, { token, password: "accepted-password-123" })).resolves.toHaveProperty("clientUserId");
    const accepted: any = await t.run((ctx) => ctx.db.get(state.relationship._id));
    expect(accepted.clientUserId).toBeTruthy();
    expect(accepted.pendingInviteClientUserId).toBeUndefined();
    expect(accepted.inviteTokenHash).toBeUndefined();
  });

  it("reuses an existing relationship and pending user when resending", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t, "owner@invite.test");
    const relationshipId = await t.run((ctx) => ctx.db.insert("clientRelationships", { companyId: s.companyA, displayName: "Jamie", email: "jamie@client.test", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 }));
    const requestId = await createRequest(t, s.companyA, { clientRelationshipId: relationshipId });

    const first = await t.action(api.clientAuthActions.inviteClientFromRequest, { userId: s.owner, sessionToken: auth.sessionToken, requestId });
    const firstState: any = await t.run((ctx) => ctx.db.get(relationshipId));
    const second = await t.action(api.clientAuthActions.inviteClientFromRequest, { userId: s.owner, sessionToken: auth.sessionToken, requestId });
    const secondState: any = await t.run((ctx) => ctx.db.get(relationshipId));

    expect(first.status).toBe("pending");
    expect(second.status).toBe("pending");
    expect(secondState.clientUserId).toBe(firstState.clientUserId);
    expect(secondState.inviteTokenHash).not.toBe(firstState.inviteTokenHash);
  });

  it("returns active without creating or sending a duplicate invitation", async () => {
    const t = backend();
    const s = await seed(t);
    const auth = await login(t, "owner@invite.test");
    const clientUserId = await t.run((ctx) => ctx.db.insert("clientUsers", { email: "jamie@client.test", displayName: "Jamie", passwordHash: "hash", status: "active", createdAt: 1, updatedAt: 1 }));
    const relationshipId = await t.run((ctx) => ctx.db.insert("clientRelationships", { companyId: s.companyA, clientUserId, displayName: "Jamie", email: "jamie@client.test", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 }));
    const requestId = await createRequest(t, s.companyA, { clientRelationshipId: relationshipId });

    await expect(t.action(api.clientAuthActions.inviteClientFromRequest, { userId: s.owner, sessionToken: auth.sessionToken, requestId }))
      .resolves.toMatchObject({ emailSent: false, status: "active" });
    await expect(t.run((ctx) => ctx.db.query("clientUsers").collect())).resolves.toHaveLength(1);
  });

  it("rejects cross-company, worker, invalid-session, and missing-email attempts", async () => {
    const t = backend();
    const s = await seed(t);
    const [ownerAuth, otherAuth, cleanerAuth] = await Promise.all([
      login(t, "owner@invite.test"),
      login(t, "other@invite.test"),
      login(t, "cleaner@invite.test"),
    ]);
    const requestId = await createRequest(t, s.companyA);
    const missingEmailId = await createRequest(t, s.companyA, { requesterEmail: "" });

    await expect(t.action(api.clientAuthActions.inviteClientFromRequest, { userId: s.otherOwner, sessionToken: otherAuth.sessionToken, requestId })).rejects.toThrow("Access denied");
    await expect(t.action(api.clientAuthActions.inviteClientFromRequest, { userId: s.cleaner, sessionToken: cleanerAuth.sessionToken, requestId })).rejects.toThrow("Owner or manager session required");
    await expect(t.action(api.clientAuthActions.inviteClientFromRequest, { userId: s.owner, sessionToken: "invalid", requestId })).rejects.toThrow();
    await expect(t.action(api.clientAuthActions.inviteClientFromRequest, { userId: s.owner, sessionToken: ownerAuth.sessionToken, requestId: missingEmailId })).rejects.toThrow("Client email is required");
  });
});
