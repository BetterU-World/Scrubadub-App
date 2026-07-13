import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";
import { sanitizeSecurityMetadata } from "../securityEvents";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const NEW_PASSWORD = "new-password-456";
const FOUNDER = "dzbfyse@gmail.com";
const makeTest = () => convexTest(schema, modules);

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword(PASSWORD);
  return t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "B", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { email: "owner@pr2.test", passwordHash, name: "Owner", companyId: companyA, role: "owner", status: "active" });
    const worker = await ctx.db.insert("users", { email: "worker@pr2.test", passwordHash, name: "Worker", companyId: companyA, role: "cleaner", status: "active" });
    const affiliate = await ctx.db.insert("users", { email: "affiliate@pr2.test", passwordHash, name: "Affiliate", role: "affiliate", status: "active" });
    const founder = await ctx.db.insert("users", { email: FOUNDER, passwordHash, name: "Founder", role: "affiliate", status: "active" });
    const client = await ctx.db.insert("clientUsers", { email: "client@pr2.test", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const relationshipA = await ctx.db.insert("clientRelationships", { companyId: companyA, clientUserId: client, displayName: "A", clientType: "residential", email: "client@pr2.test", status: "active", createdAt: 1, updatedAt: 1 });
    const relationshipB = await ctx.db.insert("clientRelationships", { companyId: companyB, clientUserId: client, displayName: "B", clientType: "residential", email: "client@pr2.test", status: "active", createdAt: 1, updatedAt: 1 });
    return { companyA, companyB, owner, worker, affiliate, founder, client, relationshipA, relationshipB };
  });
}

const staffLogin = (t: ReturnType<typeof convexTest>, email: string, password = PASSWORD) => t.action(api.authActions.signIn, { email, password });
const clientLogin = (t: ReturnType<typeof convexTest>, password = PASSWORD) => t.action(api.clientAuthActions.signIn, { email: "client@pr2.test", password });

describe("Security Hardening V1 PR 2", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.FOUNDER_EMAILS = FOUNDER;
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("keeps Client reset requests generic, hashed, rotating, and non-creating", async () => {
    vi.useFakeTimers();
    try {
    const t = makeTest(); const s = await seed(t);
    const beforeCount = await t.run((ctx) => ctx.db.query("clientUsers").collect());
    const existing = await t.action(api.clientAuthActions.requestPasswordReset, { email: " CLIENT@PR2.TEST " });
    const missing = await t.action(api.clientAuthActions.requestPasswordReset, { email: "missing@pr2.test" });
    expect(existing).toEqual({ success: true }); expect(missing).toEqual(existing);
    const first = await t.run((ctx) => ctx.db.get(s.client));
    expect(first?.resetToken).toMatch(/^[a-f0-9]{64}$/); expect(first?.resetToken).not.toContain("client@pr2.test");
    expect(first?.resetTokenExpiry).toBeGreaterThan(Date.now());
    await t.action(api.clientAuthActions.requestPasswordReset, { email: "client@pr2.test" });
    const second = await t.run((ctx) => ctx.db.get(s.client));
    expect(second?.resetToken).not.toBe(first?.resetToken);
    expect(await t.run((ctx) => ctx.db.query("clientUsers").collect())).toHaveLength(beforeCount.length);
    const requestEvents = await t.run((ctx) => ctx.db.query("securityEvents").withIndex("by_eventType_createdAt", q => q.eq("eventType", "client_password_reset_requested")).collect());
    expect(requestEvents).toHaveLength(3);
    expect(new Set(requestEvents.map(e => JSON.stringify({ principalType: e.principalType, metadata: e.metadata }))).size).toBe(1);
    expect(requestEvents.every(e => !e.clientUserId)).toBe(true);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("resets a Client password once, revokes every session, and preserves relationships", async () => {
    const t = makeTest(); const s = await seed(t);
    const one = await clientLogin(t); const two = await clientLogin(t);
    const token = "a".repeat(64);
    await t.run((ctx) => ctx.db.patch(s.client, { resetToken: hashToken(token), resetTokenExpiry: Date.now() + 60_000 }));
    await expect(t.action(api.clientAuthActions.resetPassword, { token, newPassword: NEW_PASSWORD })).resolves.toEqual({ success: true });
    await expect(t.action((api as any).sessionActions.getPrincipal, { sessionToken: one.sessionToken })).rejects.toThrow("Invalid session");
    await expect(t.action((api as any).sessionActions.getPrincipal, { sessionToken: two.sessionToken })).rejects.toThrow("Invalid session");
    await expect(clientLogin(t)).rejects.toThrow("Invalid email or password");
    await expect(clientLogin(t, NEW_PASSWORD)).resolves.toMatchObject({ clientUserId: s.client });
    await expect(t.action(api.clientAuthActions.resetPassword, { token, newPassword: PASSWORD })).rejects.toThrow("Invalid or expired reset token");
    await expect(t.action(api.clientAuthActions.resetPassword, { token: "bad", newPassword: PASSWORD })).rejects.toThrow("Invalid or expired reset token");
    const relationships = await t.run((ctx) => ctx.db.query("clientRelationships").withIndex("by_clientUserId", q => q.eq("clientUserId", s.client)).collect());
    expect(relationships.map(r => r._id)).toEqual(expect.arrayContaining([s.relationshipA, s.relationshipB]));
  });

  it("rejects expired and unknown Client reset tokens", async () => {
    const t = makeTest(); const s = await seed(t);
    const expired = "b".repeat(64);
    await t.run((ctx) => ctx.db.patch(s.client, { resetToken: hashToken(expired), resetTokenExpiry: Date.now() - 1 }));
    await expect(t.action(api.clientAuthActions.resetPassword, { token: expired, newPassword: NEW_PASSWORD })).rejects.toThrow("Invalid or expired reset token");
    await expect(t.action(api.clientAuthActions.resetPassword, { token: "c".repeat(64), newPassword: NEW_PASSWORD })).rejects.toThrow("Invalid or expired reset token");
  });

  it("revokes all staff sessions after reset without confusing Client sessions", async () => {
    const t = makeTest(); const s = await seed(t);
    const staffOne = await staffLogin(t, "owner@pr2.test"); const staffTwo = await staffLogin(t, "owner@pr2.test"); const client = await clientLogin(t);
    const token = "staff-reset-token";
    await t.run((ctx) => ctx.db.patch(s.owner, { resetToken: hashToken(token), resetTokenExpiry: Date.now() + 60_000 }));
    await t.action(api.authActions.resetPassword, { token, newPassword: NEW_PASSWORD });
    await expect(t.action((api as any).sessionActions.getPrincipal, { sessionToken: staffOne.sessionToken })).rejects.toThrow("Invalid session");
    await expect(t.action((api as any).sessionActions.getPrincipal, { sessionToken: staffTwo.sessionToken })).rejects.toThrow("Invalid session");
    await expect(t.action((api as any).sessionActions.getPrincipal, { sessionToken: client.sessionToken })).resolves.toMatchObject({ kind: "client" });
    await expect(staffLogin(t, "owner@pr2.test", NEW_PASSWORD)).resolves.toMatchObject({ userId: s.owner });
  });

  it("disable/reactivate never revives staff or Affiliate sessions", async () => {
    const t = makeTest(); const s = await seed(t); const owner = await staffLogin(t, "owner@pr2.test");
    const worker = await staffLogin(t, "worker@pr2.test");
    await t.mutation(api.mutations.employees.updateEmployeeStatus, { employeeId: s.worker, status: "inactive", userId: s.owner, sessionToken: owner.sessionToken });
    await t.mutation(api.mutations.employees.updateEmployeeStatus, { employeeId: s.worker, status: "active", userId: s.owner, sessionToken: owner.sessionToken });
    await expect(t.action((api as any).sessionActions.getPrincipal, { sessionToken: worker.sessionToken })).rejects.toThrow("Invalid session");

    const affiliate = await staffLogin(t, "affiliate@pr2.test"); const founder = await staffLogin(t, FOUNDER);
    await t.mutation(api.mutations.affiliateInvites.revokeAffiliateInvite, { callerUserId: s.founder, sessionToken: founder.sessionToken, targetUserId: s.affiliate });
    await t.run((ctx) => ctx.db.patch(s.affiliate, { status: "active" }));
    await expect(t.action((api as any).sessionActions.getPrincipal, { sessionToken: affiliate.sessionToken })).rejects.toThrow("Invalid session");
  });

  it("keeps relationship deactivation independent and Client Home reauthentication deterministic", async () => {
    const t = makeTest(); const s = await seed(t); const client = await clientLogin(t);
    await t.run((ctx) => ctx.db.patch(s.relationshipA, { status: "inactive" }));
    await expect(t.query(api.queries.clientHome.getClientHome, { clientUserId: s.client, sessionToken: client.sessionToken })).resolves.toMatchObject({ relationships: [{ _id: s.relationshipB }] });
    const source = readFileSync("packages/frontend/src/pages/client/ClientHomePage.tsx", "utf8").replace(/\r\n/g, "\n");
    expect(source).toContain('clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip"');
    expect(source).toContain("isLoading || (homeQueryActive && home === undefined)");
    expect(source).toContain("!homeQueryActive || home === null || home === undefined");
  });

  it("sanitizes event metadata and applies retention without secret-bearing values", async () => {
    expect(sanitizeSecurityMetadata({ category: "ok", password: "secret", sessionToken: "raw", reason: "safe\nreason" })).toEqual({ category: "ok", reason: "safe reason" });
    const t = makeTest(); await seed(t);
    await expect(staffLogin(t, "owner@pr2.test", "wrong-password")).rejects.toThrow();
    const events = await t.run((ctx) => ctx.db.query("securityEvents").collect());
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("wrong-password"); expect(serialized).not.toContain("test-password-123");
    expect(events.find(e => e.eventType === "login_failure")?.retentionClass).toBe("security_90d");
  });
});
