import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "owner-password-123";
const makeTest = () => convexTest(schema, modules);

async function setup(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword(PASSWORD);
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Invite Co", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { email: "owner@invite.test", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
    const otherOwnerId = await ctx.db.insert("users", { email: "other@invite.test", passwordHash, name: "Other", companyId: otherCompanyId, role: "owner", status: "active" });
    return { companyId, otherCompanyId, ownerId, otherOwnerId };
  });
  const auth = await t.action(api.authActions.signIn, { email: "owner@invite.test", password: PASSWORD });
  const otherAuth = await t.action(api.authActions.signIn, { email: "other@invite.test", password: PASSWORD });
  return { ...ids, auth, otherAuth };
}

async function invite(t: ReturnType<typeof convexTest>, s: Awaited<ReturnType<typeof setup>>, email = "worker@invite.test") {
  return t.action(api.employeeActions.inviteCleaner, {
    companyId: s.companyId, email, name: "Invited Worker", userId: s.ownerId,
    sessionToken: s.auth.sessionToken, role: "cleaner",
  });
}

describe("worker invitation lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "SCRUB <test@example.com>";
    process.env.APP_URL = "http://localhost:5173";
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("classifies valid, expired, invalid, and accepted links without exposing worker data for terminal states", async () => {
    const t = makeTest(); const s = await setup(t); const created = await invite(t, s);
    await expect(t.query(api.queries.employees.getByInviteToken, { token: created.token }))
      .resolves.toMatchObject({ state: "valid", email: "worker@invite.test", companyName: "Invite Co" });
    await expect(t.query(api.queries.employees.getByInviteToken, { token: "does-not-exist" }))
      .resolves.toEqual({ state: "invalid" });

    await t.run(async (ctx) => ctx.db.patch(created.userId, { inviteTokenExpiry: Date.now() - 1 }));
    await expect(t.query(api.queries.employees.getByInviteToken, { token: created.token }))
      .resolves.toEqual({ state: "expired" });
    await expect(t.action(api.employeeActions.acceptInvite, { token: created.token, password: "worker-password-123" }))
      .rejects.toThrow("INVITE_EXPIRED");

    await t.run(async (ctx) => ctx.db.patch(created.userId, { inviteTokenExpiry: Date.now() + 60_000 }));
    await expect(t.action(api.employeeActions.acceptInvite, { token: created.token, password: "worker-password-123" }))
      .resolves.toMatchObject({ email: "worker@invite.test" });
    await expect(t.query(api.queries.employees.getByInviteToken, { token: created.token }))
      .resolves.toEqual({ state: "accepted" });
    await expect(t.action(api.employeeActions.acceptInvite, { token: created.token, password: "worker-password-123" }))
      .rejects.toThrow("INVITE_ACCEPTED");
  });

  it("rotates every resend, rejects all older links, preserves one worker, and accepts the newest link", async () => {
    const t = makeTest(); const s = await setup(t); const created = await invite(t, s);
    const first = await t.action(api.employeeActions.resendInviteEmail, {
      userId: s.ownerId, sessionToken: s.auth.sessionToken, companyId: s.companyId, employeeId: created.userId,
    });
    const second = await t.action(api.employeeActions.resendInviteEmail, {
      userId: s.ownerId, sessionToken: s.auth.sessionToken, companyId: s.companyId, employeeId: created.userId,
    });
    expect(new Set([created.token, first.token, second.token]).size).toBe(3);
    for (const oldToken of [created.token, first.token]) {
      await expect(t.query(api.queries.employees.getByInviteToken, { token: oldToken })).resolves.toEqual({ state: "invalid" });
      await expect(t.action(api.employeeActions.acceptInvite, { token: oldToken, password: "worker-password-123" })).rejects.toThrow("INVITE_INVALID");
    }
    await expect(t.action(api.employeeActions.acceptInvite, { token: second.token, password: "worker-password-123" })).resolves.toBeTruthy();
    const workers = await t.run(async (ctx) => ctx.db.query("users").withIndex("by_email", q => q.eq("email", "worker@invite.test")).collect());
    expect(workers).toHaveLength(1);
    expect(workers[0].inviteTokenHash).toBe(hashToken(second.token));
  });

  it("supports owner revocation and enforces company isolation for resend and revoke", async () => {
    const t = makeTest(); const s = await setup(t); const created = await invite(t, s);
    await expect(t.action(api.employeeActions.resendInviteEmail, {
      userId: s.otherOwnerId, sessionToken: s.otherAuth.sessionToken, companyId: s.otherCompanyId, employeeId: created.userId,
    })).rejects.toThrow("Employee not in your company");
    await expect(t.action(api.employeeActions.revokeInvite, {
      userId: s.otherOwnerId, sessionToken: s.otherAuth.sessionToken, companyId: s.otherCompanyId, employeeId: created.userId,
    })).rejects.toThrow("Employee not found");
    await expect(t.action(api.employeeActions.revokeInvite, {
      userId: s.ownerId, sessionToken: s.auth.sessionToken, companyId: s.companyId, employeeId: created.userId,
    })).resolves.toEqual({ revoked: true });
    await expect(t.query(api.queries.employees.getByInviteToken, { token: created.token })).resolves.toEqual({ state: "revoked" });
    await expect(t.action(api.employeeActions.acceptInvite, { token: created.token, password: "worker-password-123" })).rejects.toThrow("INVITE_REVOKED");
  });

  it("keeps invitation email branding, expiry copy, current-token URL, and existing header behavior", () => {
    const source = readFileSync("convex/lib/email.ts", "utf8");
    expect(source).toContain("${getAppUrl()}/invite/${inviteToken}");
    expect(source).toContain("getPlatformEmailHeaders()");
    expect(source).toContain("This link expires in 72 hours");
    expect(source).toContain("logo-icon.png");
  });

  it("renders friendly localized terminal states and never prints uncaught backend messages", () => {
    const page = readFileSync("packages/frontend/src/pages/auth/AcceptInvitePage.tsx", "utf8");
    const en = JSON.parse(readFileSync("packages/frontend/src/i18n/en/common.json", "utf8"));
    const es = JSON.parse(readFileSync("packages/frontend/src/i18n/es/common.json", "utf8"));
    expect(page).not.toContain("err.message ||");
    for (const state of ["expired", "accepted", "revoked", "invalid"]) {
      expect(en.invite.states[state].title).toBeTruthy();
      expect(es.invite.states[state].title).toBeTruthy();
    }
  });
});
