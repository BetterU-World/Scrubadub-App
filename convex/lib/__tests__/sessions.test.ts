import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const sessionActions = (api as any).sessionActions;

function makeTest() {
  return convexTest(schema, modules);
}

async function seedPrincipals(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword("test-password-123");
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Session Test Company",
      timezone: "America/New_York",
    });
    const userId = await ctx.db.insert("users", {
      email: "session-owner@example.com",
      passwordHash,
      name: "Session Owner",
      companyId,
      role: "owner",
      status: "active",
    });
    const clientUserId = await ctx.db.insert("clientUsers", {
      email: "session-client@example.com",
      passwordHash,
      displayName: "Session Client",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { companyId, userId, clientUserId };
  });
}

async function staffLogin(t: ReturnType<typeof convexTest>) {
  return await t.action(api.authActions.signIn, {
    email: "session-owner@example.com",
    password: "test-password-123",
  });
}

async function clientLogin(t: ReturnType<typeof convexTest>) {
  return await t.action(api.clientAuthActions.signIn, {
    email: "session-client@example.com",
    password: "test-password-123",
  });
}

describe("Security V2 session foundation", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("staff login issues a compatible server-verifiable session", async () => {
    const t = makeTest();
    const { userId, companyId } = await seedPrincipals(t);
    const result = await staffLogin(t);
    expect(result.userId).toBe(userId);
    expect(result.companyId).toBe(companyId);
    expect(result.role).toBe("owner");
    expect(result.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sessionExpiresAt).toBeGreaterThan(Date.now());
  });

  it("client login issues a compatible server-verifiable session", async () => {
    const t = makeTest();
    const { clientUserId } = await seedPrincipals(t);
    const result = await clientLogin(t);
    expect(result.clientUserId).toBe(clientUserId);
    expect(result.sessionToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores only the peppered token hash", async () => {
    const t = makeTest();
    await seedPrincipals(t);
    const result = await staffLogin(t);
    const session = await t.run((ctx) => ctx.db.query("authSessions").first());
    expect(session?.tokenHash).toBe(hashToken(result.sessionToken));
    expect(session?.tokenHash).not.toBe(result.sessionToken);
    expect(JSON.stringify(session)).not.toContain(result.sessionToken);
  });

  it("resolves the correct staff and client principals", async () => {
    const t = makeTest();
    const { userId, clientUserId } = await seedPrincipals(t);
    const staff = await staffLogin(t);
    const client = await clientLogin(t);
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: staff.sessionToken }))
      .resolves.toMatchObject({ kind: "staff", userId });
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: client.sessionToken }))
      .resolves.toMatchObject({ kind: "client", clientUserId });
  });

  it("rejects an incorrect token", async () => {
    const t = makeTest();
    await seedPrincipals(t);
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: "incorrect" }))
      .rejects.toThrow("Invalid session");
  });

  it("rejects revoked, absolute-expired, and idle-expired sessions", async () => {
    const t = makeTest();
    await seedPrincipals(t);

    const revoked = await staffLogin(t);
    await t.action(sessionActions.revokeCurrent, { sessionToken: revoked.sessionToken });
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: revoked.sessionToken }))
      .rejects.toThrow("Invalid session");

    const absolute = await staffLogin(t);
    const idle = await staffLogin(t);
    await t.run(async (ctx) => {
      const sessions = await ctx.db.query("authSessions").collect();
      const absoluteSession = sessions.find((s) => s.tokenHash === hashToken(absolute.sessionToken))!;
      const idleSession = sessions.find((s) => s.tokenHash === hashToken(idle.sessionToken))!;
      await ctx.db.patch(absoluteSession._id, { expiresAt: Date.now() - 1 });
      await ctx.db.patch(idleSession._id, { idleExpiresAt: Date.now() - 1 });
    });
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: absolute.sessionToken }))
      .rejects.toThrow("Invalid session");
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: idle.sessionToken }))
      .rejects.toThrow("Invalid session");
  });

  it("rejects sessions after staff or client deactivation", async () => {
    const t = makeTest();
    const { userId, clientUserId } = await seedPrincipals(t);
    const staff = await staffLogin(t);
    const client = await clientLogin(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { status: "inactive" });
      await ctx.db.patch(clientUserId, { status: "disabled" });
    });
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: staff.sessionToken }))
      .rejects.toThrow("Invalid session");
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: client.sessionToken }))
      .rejects.toThrow("Invalid session");
  });

  it("revoke-all invalidates one principal's sessions without affecting another", async () => {
    const t = makeTest();
    await seedPrincipals(t);
    const deviceOne = await staffLogin(t);
    const deviceTwo = await staffLogin(t);
    const client = await clientLogin(t);
    const result = await t.action(sessionActions.revokeAllStaffSessions, {
      sessionToken: deviceOne.sessionToken,
    });
    expect(result.revoked).toBe(2);
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: deviceOne.sessionToken })).rejects.toThrow();
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: deviceTwo.sessionToken })).rejects.toThrow();
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: client.sessionToken })).resolves.toMatchObject({ kind: "client" });
  });

  it("revoking one device leaves another device session valid", async () => {
    const t = makeTest();
    await seedPrincipals(t);
    const deviceOne = await staffLogin(t);
    const deviceTwo = await staffLogin(t);
    await t.action(sessionActions.revokeCurrent, { sessionToken: deviceOne.sessionToken });
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: deviceOne.sessionToken })).rejects.toThrow();
    await expect(t.action(sessionActions.getPrincipal, { sessionToken: deviceTwo.sessionToken })).resolves.toMatchObject({ kind: "staff" });
  });

  it("does not allow staff and client session type confusion", async () => {
    const t = makeTest();
    await seedPrincipals(t);
    const staff = await staffLogin(t);
    const client = await clientLogin(t);
    await expect(t.action(sessionActions.getClientPrincipal, { sessionToken: staff.sessionToken }))
      .rejects.toThrow("Client session required");
    await expect(t.action(sessionActions.getStaffPrincipal, { sessionToken: client.sessionToken }))
      .rejects.toThrow("Staff session required");
  });

  it("derives identity only from the session and preserves legacy ID-only behavior", async () => {
    const t = makeTest();
    const { userId } = await seedPrincipals(t);
    const login = await staffLogin(t);
    const principal = await t.action(sessionActions.getPrincipal, { sessionToken: login.sessionToken });
    expect(principal).toMatchObject({ kind: "staff", userId });
    expect(Object.keys(principal)).not.toContain("claimedUserId");

    const legacy = await t.query(api.authQueries.getCurrentUser, { userId });
    expect(legacy?._id).toBe(userId);
  });
});
