import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken, INVITE_TOKEN_EXPIRY_MS } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const CONFIGURED_FOUNDER = "configured-founder@example.com";
const makeTest = () => convexTest(schema, modules);

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword(PASSWORD);
  return t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Hardening Test Company",
      timezone: "America/New_York",
    });
    const founderId = await ctx.db.insert("users", {
      email: CONFIGURED_FOUNDER,
      passwordHash,
      name: "Configured Founder",
      companyId,
      role: "owner",
      status: "active",
    });
    const managerId = await ctx.db.insert("users", {
      email: "manager@hardening.test",
      passwordHash: "sensitive-password-hash",
      name: "Manager",
      companyId,
      role: "manager",
      status: "active",
      phone: "555-0100",
      canSeeAllJobs: true,
      inviteToken: "sensitive-raw-invite",
      inviteTokenHash: "sensitive-invite-hash",
      resetToken: "sensitive-reset-hash",
      stripeConnectAccountId: "acct_sensitive",
    });
    const ownerId = await ctx.db.insert("users", {
      email: "owner@hardening.test",
      passwordHash,
      name: "Ordinary Owner",
      companyId,
      role: "owner",
      status: "active",
    });
    return { companyId, founderId, managerId, ownerId };
  });
}

const login = (t: ReturnType<typeof convexTest>, email: string) =>
  t.action(api.authActions.signIn, { email, password: PASSWORD });

describe("Security Hardening V1 PR 1", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.FOUNDER_EMAILS = CONFIGURED_FOUNDER;
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("projects employee directory responses without credential or payment state", async () => {
    const t = makeTest();
    const { companyId, founderId, managerId } = await seed(t);
    const auth = await login(t, CONFIGURED_FOUNDER);

    const employees = await t.query(api.queries.employees.list, {
      companyId,
      userId: founderId,
      sessionToken: auth.sessionToken,
    });
    const manager = employees.find((entry) => entry._id === managerId)!;

    expect(manager).toMatchObject({
      email: "manager@hardening.test",
      name: "Manager",
      phone: "555-0100",
      role: "manager",
      status: "active",
      canSeeAllJobs: true,
    });
    for (const employee of employees) {
      expect(employee).not.toHaveProperty("passwordHash");
      expect(employee).not.toHaveProperty("inviteToken");
      expect(employee).not.toHaveProperty("inviteTokenHash");
      expect(employee).not.toHaveProperty("resetToken");
      expect(employee).not.toHaveProperty("stripeConnectAccountId");
      expect(employee).not.toHaveProperty("affiliateStripeAccountId");
    }
    await expect(t.query(api.queries.employees.getManagers, {
      companyId,
      userId: founderId,
      sessionToken: auth.sessionToken,
    })).resolves.toEqual([manager]);
  });

  it("stores only hashed worker invites, rotates resends, and consumes all token state", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      const { companyId, founderId } = await seed(t);
      const auth = await login(t, CONFIGURED_FOUNDER);
      const beforeInvite = Date.now();
      const invitation = await t.action(api.employeeActions.inviteCleaner, {
        companyId,
        email: "worker@hardening.test",
        name: "Worker",
        userId: founderId,
        sessionToken: auth.sessionToken,
        role: "maintenance",
      });

      const stored = await t.run((ctx) => ctx.db.get(invitation.userId));
      expect(stored?.inviteToken).toBeUndefined();
      expect(stored?.inviteTokenHash).toBe(hashToken(invitation.token));
      expect(stored?.inviteTokenExpiry).toBe(beforeInvite + INVITE_TOKEN_EXPIRY_MS);
      await expect(t.query(api.queries.employees.getByInviteToken, {
        token: invitation.token,
      })).resolves.toMatchObject({ email: "worker@hardening.test" });

      const resent = await t.action(api.employeeActions.resendInviteEmail, {
        userId: founderId,
        sessionToken: auth.sessionToken,
        companyId,
        employeeEmail: "worker@hardening.test",
      });
      expect(resent.token).not.toBe(invitation.token);
      await expect(t.query(api.queries.employees.getByInviteToken, {
        token: invitation.token,
      })).resolves.toBeNull();

      await expect(t.action(api.employeeActions.acceptInvite, {
        token: resent.token,
        password: "accepted-password-123",
      })).resolves.toMatchObject({ role: "maintenance" });
      const accepted = await t.run((ctx) => ctx.db.get(invitation.userId));
      expect(accepted?.status).toBe("active");
      expect(accepted?.inviteToken).toBeUndefined();
      expect(accepted?.inviteTokenHash).toBeUndefined();
      expect(accepted?.inviteTokenExpiry).toBeUndefined();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("accepts an unexpired legacy raw invite while hashing new affiliate invites", async () => {
    const t = makeTest();
    const { companyId, founderId } = await seed(t);
    const legacyToken = "legacy-raw-invite-token";
    await t.run((ctx) => ctx.db.insert("users", {
      email: "legacy-worker@hardening.test",
      passwordHash: "",
      name: "Legacy Worker",
      companyId,
      role: "cleaner",
      status: "pending",
      inviteToken: legacyToken,
      inviteTokenExpiry: Date.now() + 60_000,
    }));
    await expect(t.action(api.employeeActions.acceptInvite, {
      token: legacyToken,
      password: "accepted-password-123",
    })).resolves.toMatchObject({ role: "cleaner" });

    const auth = await login(t, CONFIGURED_FOUNDER);
    const beforeAffiliateInvite = Date.now();
    const affiliate = await t.action(api.affiliateInviteActions.inviteAffiliate, {
      callerUserId: founderId,
      sessionToken: auth.sessionToken,
      email: "affiliate@hardening.test",
      name: "Affiliate",
      sendEmail: false,
    });
    const stored = await t.run((ctx) => ctx.db.get(affiliate.userId));
    expect(stored?.inviteToken).toBeUndefined();
    expect(stored?.inviteTokenHash).toBe(hashToken(affiliate.token));
    expect(stored?.inviteTokenExpiry).toBeGreaterThanOrEqual(beforeAffiliateInvite + 7 * 24 * 60 * 60 * 1000);
    expect(stored?.inviteTokenExpiry).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await t.mutation(api.mutations.affiliateInvites.revokeAffiliateInvite, {
      callerUserId: founderId,
      sessionToken: auth.sessionToken,
      targetUserId: affiliate.userId,
    });
    const revoked = await t.run((ctx) => ctx.db.get(affiliate.userId));
    expect(revoked?.inviteToken).toBeUndefined();
    expect(revoked?.inviteTokenHash).toBeUndefined();
    expect(revoked?.inviteTokenExpiry).toBeUndefined();
  });

  it("uses configured founder eligibility consistently and gates admin queries after hydration", async () => {
    const t = makeTest();
    const { founderId, ownerId } = await seed(t);
    const founderAuth = await login(t, CONFIGURED_FOUNDER);
    await expect(t.query(api.authQueries.getCurrentUser, {
      sessionToken: founderAuth.sessionToken,
    })).resolves.toMatchObject({ _id: founderId, isSuperadmin: true });
    await expect(t.query(api.queries.admin.getPlatformStats, {
      userId: founderId,
      sessionToken: founderAuth.sessionToken,
    })).resolves.toMatchObject({ totalCompanies: 1 });

    const ownerAuth = await login(t, "owner@hardening.test");
    await expect(t.query(api.queries.admin.getPlatformStats, {
      userId: ownerId,
      sessionToken: ownerAuth.sessionToken,
    })).rejects.toThrow("Super admin session required");

    const normalize = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    const adminPage = normalize("packages/frontend/src/pages/admin/SuperAdminPage.tsx");
    const invitesPage = normalize("packages/frontend/src/pages/admin/AffiliateInvitesPage.tsx");
    const sidebar = normalize("packages/frontend/src/components/layout/Sidebar.tsx");
    const app = normalize("packages/frontend/src/App.tsx");
    expect(adminPage).toContain("user?.isSuperadmin === true && Boolean(sessionToken)");
    expect(invitesPage).toContain("user?.isSuperadmin === true && Boolean(sessionToken)");
    expect(adminPage.match(/: \"skip\"/g)).toHaveLength(2);
    expect(invitesPage).toContain(': "skip"');
    expect(sidebar).toContain("user?.isSuperadmin === true");
    expect(sidebar).not.toContain("queries.admin.isSuperAdmin");
    expect(app).toContain("user?.isSuperadmin === true && (");
  });
});
