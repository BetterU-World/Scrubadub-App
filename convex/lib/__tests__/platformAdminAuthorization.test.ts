import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { readFileSync, readdirSync } from "node:fs";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { requireActiveSubscription } from "../subscriptionGating";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const grant = makeFunctionReference<"mutation">("platformProvisioning:setAdministrator");
const comp = makeFunctionReference<"mutation">("platformProvisioning:setComplimentarySubscription");
const createAffiliate = makeFunctionReference<"mutation">("mutations/affiliateInvites:createAffiliateUser");
const rotateAffiliate = makeFunctionReference<"mutation">("mutations/affiliateInvites:updateAffiliateInviteToken");
const operator = { operator: "test-operator", approvalReference: "SYNTHETIC-ONLY", reason: "Defensive regression fixture" };
const password = "safe-synthetic-password-123";
async function setup() {
  const t = convexTest(schema, modules);
  const user = await t.action(api.authActions.signUp, { email: "synthetic-allowed@platform.test", password, name: "Synthetic", companyName: "Synthetic company" });
  const auth = { userId: user.userId, sessionToken: user.sessionToken };
  return { t, user, auth };
}
async function provision(s: Awaited<ReturnType<typeof setup>>, active: boolean, expectedRevision: number) {
  return s.t.mutation(grant, { ...operator, userId: s.user.userId, active, expectedRevision, confirmation: `${active ? "GRANT" : "REVOKE"} ADMIN ${s.user.userId}` });
}

describe("explicit platform admin authorization cutover", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_PEPPER", "test-token-pepper");
    vi.stubEnv("APP_URL", "http://localhost:5173");
    vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "true");
    vi.stubEnv("FOUNDER_EMAILS", "synthetic-allowed@platform.test");
    vi.stubEnv("SUPERADMIN_EMAILS", "synthetic-allowed@platform.test");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in isolated admin tests"));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("denies signup identities despite legacy env configuration and ignores claimed entitlement fields", async () => {
    const s = await setup();
    expect(await s.t.query(api.authQueries.getCurrentUser, { sessionToken: s.auth.sessionToken })).toMatchObject({ isSuperadmin: false });
    await expect(s.t.query(api.queries.admin.getPlatformStats, s.auth)).rejects.toThrow("Super admin");
    await expect(s.t.action(api.affiliateInviteActions.inviteAffiliate, { callerUserId: s.auth.userId, sessionToken: s.auth.sessionToken, email: "other@platform.test", name: "Other" })).rejects.toThrow("Super admin");
    await expect(s.t.action(api.authActions.signUp, { email: "another@platform.test", password, name: "Another", companyName: "Another", isSuperadmin: true } as any)).rejects.toThrow();
    expect(await s.t.run(ctx => ctx.db.query("platformAdmins").collect())).toEqual([]);
  });

  it("revokes existing sessions across projections, admin reads, writes and actions", async () => {
    const s = await setup();
    await provision(s, true, 0);
    expect(await s.t.query(api.queries.admin.getPlatformStats, s.auth)).toMatchObject({ totalCompanies: 1 });
    expect(await s.t.query(api.queries.admin.isSuperAdmin, s.auth)).toBe(true);
    const invite = await s.t.action(api.affiliateInviteActions.inviteAffiliate, { callerUserId: s.auth.userId, sessionToken: s.auth.sessionToken, email: "invite@platform.test", name: "Invite", sendEmail: false });
    expect(await s.t.run(ctx => ctx.db.query("platformAdmins").collect())).toHaveLength(1);
    const accepted = await s.t.action(api.employeeActions.acceptInvite, { token: invite.token, password });
    expect(await s.t.query(api.authQueries.getCurrentUser, { sessionToken: accepted.sessionToken })).toMatchObject({ isSuperadmin: false });
    await provision(s, false, 1);
    expect(await s.t.query(api.authQueries.getCurrentUser, { sessionToken: s.auth.sessionToken })).toMatchObject({ isSuperadmin: false });
    expect(await s.t.query(api.queries.admin.isSuperAdmin, s.auth)).toBe(false);
    await expect(s.t.query(api.queries.admin.getCompaniesWithUsers, s.auth)).rejects.toThrow("Super admin");
    await expect(s.t.mutation(api.mutations.manuals.seedManuals, { ...s.auth, manuals: [] })).rejects.toThrow("Super admin");
    await expect(s.t.action(api.affiliateInviteActions.resendAffiliateInvite, { callerUserId: s.auth.userId, sessionToken: s.auth.sessionToken, targetUserId: invite.userId })).rejects.toThrow("Super admin");
    // The committing mutations also reject an action that authorized before revoke.
    await expect(s.t.mutation(createAffiliate, { affiliateInvitedBy: s.auth.userId, sessionToken: s.auth.sessionToken, email: "stale@platform.test", name: "Stale", inviteTokenHash: "fake", inviteTokenExpiry: Date.now() + 10000 })).rejects.toThrow("Super admin");
    await expect(s.t.mutation(rotateAffiliate, { ...s.auth, callerUserId: s.auth.userId, userId: invite.userId, inviteTokenHash: "fake", inviteTokenExpiry: Date.now() + 10000 })).rejects.toThrow("Super admin");
  });

  it("enforces the ledger override independently of email and retains self access", async () => {
    const s = await setup();
    const other = await s.t.run(ctx => ctx.db.insert("users", { email: "recipient@platform.test", passwordHash: "unused", name: "Recipient", role: "affiliate", status: "active" }));
    const ledgerId = await s.t.run(ctx => ctx.db.insert("affiliateLedger", { referrerUserId: other, periodType: "monthly", periodStart: 1, periodEnd: 2, attributedRevenueCents: 100, commissionRate: 0.1, commissionCents: 10, status: "open", createdAt: 1 }));
    await expect(s.t.mutation(api.mutations.affiliateLedger.lockLedgerPeriod, { ...s.auth, ledgerId })).rejects.toThrow("Access denied");
    await provision(s, true, 0);
    expect(await s.t.mutation(api.mutations.affiliateLedger.lockLedgerPeriod, { ...s.auth, ledgerId })).toMatchObject({ status: "locked" });
    await provision(s, false, 1);
    await expect(s.t.mutation(api.mutations.affiliateLedger.lockLedgerPeriod, { ...s.auth, ledgerId })).rejects.toThrow("Access denied");
    await s.t.run(ctx => ctx.db.patch(ledgerId, { referrerUserId: s.auth.userId, status: "open" }));
    expect(await s.t.mutation(api.mutations.affiliateLedger.lockLedgerPeriod, { ...s.auth, ledgerId })).toMatchObject({ status: "locked" });
  });

  it("preserves explicit company exemptions independently of administrator grants and revocation", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.user.companyId, { subscriptionStatus: "canceled" }));
    await provision(s, true, 0);
    await expect(s.t.run(ctx => requireActiveSubscription(ctx, s.user.companyId))).rejects.toThrow("inactive");
    expect(await s.t.query(api.queries.billing.getCompanySubscription, { companyId: s.user.companyId, sessionToken: s.auth.sessionToken })).toMatchObject({ companyBypassed: false });
    await s.t.mutation(comp, { ...operator, companyId: s.user.companyId, active: true, expectedRevision: 0, confirmation: `GRANT BILLING ${s.user.companyId}` });
    await provision(s, false, 1);
    await expect(s.t.run(ctx => requireActiveSubscription(ctx, s.user.companyId))).resolves.toBeNull();
    expect(await s.t.query(api.queries.billing.getCompanySubscription, { companyId: s.user.companyId, sessionToken: s.auth.sessionToken })).toMatchObject({ companyBypassed: true });
    await s.t.mutation(comp, { ...operator, companyId: s.user.companyId, active: false, expectedRevision: 1, confirmation: `REVOKE BILLING ${s.user.companyId}` });
    await expect(s.t.run(ctx => requireActiveSubscription(ctx, s.user.companyId))).rejects.toThrow("inactive");
  });

  it("requires current active sessions even for provisioned identities", async () => {
    const s = await setup(); await provision(s, true, 0);
    await s.t.run(async ctx => {
      const session = await ctx.db.query("authSessions").withIndex("by_tokenHash", q => q.eq("tokenHash", hashToken(s.auth.sessionToken))).unique();
      await ctx.db.patch(session!._id, { revokedAt: Date.now() });
    });
    await expect(s.t.query(api.queries.admin.getPlatformStats, s.auth)).rejects.toThrow("verified session");
  });

  it("removes every runtime email authorization consumer and all public provisioning wrappers", () => {
    const directory = new URL("../../", import.meta.url);
    function scan(url: URL): string {
      return readdirSync(url, { withFileTypes: true }).filter(entry => !["__tests__", "_generated"].includes(entry.name)).map(entry => entry.isDirectory() ? scan(new URL(entry.name + "/", url)) : entry.name.endsWith(".ts") ? readFileSync(new URL(entry.name, url), "utf8") : "").join("\n");
    }
    const source = scan(directory);
    expect(source).not.toMatch(/isFounderEmail|FOUNDER_EMAILS|SUPERADMIN_EMAILS|founderEmails/);
    expect(source).not.toMatch(/\.platformProvisioning\./);
    const app = readFileSync(new URL("../../../packages/frontend/src/App.tsx", import.meta.url), "utf8");
    expect(app.indexOf('path="/admin"')).toBeLessThan(app.indexOf("{isOwner ? ("));
    expect(app.match(/const isSubActive =[\s\S]*?;/)?.[0]).not.toContain("isSuperadmin");
  });
});
