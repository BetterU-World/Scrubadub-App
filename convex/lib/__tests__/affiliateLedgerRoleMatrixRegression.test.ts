import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const SUPERADMIN_EMAIL = "dzbfyse@gmail.com";
const SESSION_ERROR = "verified session is required";

function backend() {
  return convexTest(schema, modules);
}

async function seed(t: ReturnType<typeof backend>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const company = await ctx.db.insert("companies", { name: "Ledger Co", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", {
      email: "owner@ledger.test", passwordHash, name: "Owner", companyId: company,
      role: "owner", status: "active", referralCode: "owner-code",
    });
    const manager = await ctx.db.insert("users", {
      email: "manager@ledger.test", passwordHash, name: "Manager", companyId: company,
      role: "manager", status: "active", referralCode: "manager-code",
    });
    const affiliate = await ctx.db.insert("users", {
      email: "affiliate@ledger.test", passwordHash, name: "Affiliate",
      role: "affiliate", status: "active", referralCode: "affiliate-code",
    });
    const otherAffiliate = await ctx.db.insert("users", {
      email: "other-affiliate@ledger.test", passwordHash, name: "Other Affiliate",
      role: "affiliate", status: "active", referralCode: "other-code",
    });
    const superadmin = await ctx.db.insert("users", {
      email: SUPERADMIN_EMAIL, passwordHash, name: "Founder", companyId: company,
      role: "owner", status: "active", referralCode: "founder-code",
    });
    const purchaser = await ctx.db.insert("users", {
      email: "purchaser@ledger.test", passwordHash, name: "Purchaser", companyId: company,
      role: "owner", status: "active",
    });
    const affiliateLedger = await ctx.db.insert("affiliateLedger", {
      referrerUserId: affiliate, periodType: "monthly", periodStart: 1, periodEnd: 2,
      attributedRevenueCents: 10000, commissionRate: 0.1, commissionCents: 1000,
      status: "locked", lockedAt: 2, createdAt: 1,
    });
    const managerLedger = await ctx.db.insert("affiliateLedger", {
      referrerUserId: manager, periodType: "monthly", periodStart: 1, periodEnd: 2,
      attributedRevenueCents: 5000, commissionRate: 0.1, commissionCents: 500,
      status: "open", createdAt: 1,
    });
    const batch = await ctx.db.insert("affiliatePayoutBatches", {
      createdAt: 3, createdByUserId: superadmin, method: "manual", totalCommissionCents: 1000,
      ledgerIds: [affiliateLedger], status: "recorded",
    });
    await ctx.db.insert("affiliateAttributions", {
      purchaserUserId: purchaser, referrerUserId: owner, attributionType: "invoice_paid",
      amountCents: 12345, currency: "usd", createdAt: Date.UTC(2026, 6, 10),
    });
    return { company, owner, manager, affiliate, otherAffiliate, superadmin, purchaser, affiliateLedger, managerLedger, batch };
  });
}

async function login(t: ReturnType<typeof backend>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

describe("Affiliate Ledger verified-session role matrix regression", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("loads self-scoped ledger data for verified owners, managers, and affiliates", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner@ledger.test");
    const manager = await login(t, "manager@ledger.test");
    const affiliate = await login(t, "affiliate@ledger.test");

    await expect(t.query(api.queries.affiliateLedger.getMyLedger, {
      userId: s.owner, sessionToken: owner.sessionToken,
    })).resolves.toEqual({ rows: [], nextCursor: undefined });
    await expect(t.query(api.queries.affiliateLedger.getMyLedger, {
      userId: s.manager, sessionToken: manager.sessionToken,
    })).resolves.toMatchObject({ rows: [expect.objectContaining({ _id: s.managerLedger, commissionCents: 500 })] });
    await expect(t.query(api.queries.affiliateLedger.getMyLedger, {
      userId: s.affiliate, sessionToken: affiliate.sessionToken,
    })).resolves.toMatchObject({ rows: [expect.objectContaining({ _id: s.affiliateLedger, commissionCents: 1000 })] });
  });

  it("keeps every self-scoped principal bound to its verified session", async () => {
    const t = backend();
    const s = await seed(t);
    for (const [email, claimedUserId] of [
      ["owner@ledger.test", s.affiliate],
      ["affiliate@ledger.test", s.otherAffiliate],
      [SUPERADMIN_EMAIL, s.affiliate],
    ] as const) {
      const auth = await login(t, email);
      await expect(t.query(api.queries.affiliateLedger.getMyLedger, {
        userId: claimedUserId, sessionToken: auth.sessionToken,
      })).rejects.toThrow("does not match");
    }
  });

  it("keeps administrative ledger and payout operations superadmin-only", async () => {
    const t = backend();
    const s = await seed(t);
    const founder = await login(t, SUPERADMIN_EMAIL);
    const owner = await login(t, "owner@ledger.test");
    const affiliate = await login(t, "affiliate@ledger.test");

    await expect(t.query(api.queries.affiliatePayoutBatches.getPayoutBatch, {
      userId: s.superadmin, sessionToken: founder.sessionToken, batchId: s.batch,
    })).resolves.toMatchObject({ _id: s.batch, totalCommissionCents: 1000 });
    await expect(t.mutation(api.mutations.affiliateLedger.markLedgerPaid, {
      userId: s.superadmin, sessionToken: founder.sessionToken, ledgerId: s.affiliateLedger,
    })).resolves.toMatchObject({ status: "paid", commissionCents: 1000 });

    await expect(t.query(api.queries.affiliatePayoutBatches.getPayoutBatch, {
      userId: s.owner, sessionToken: owner.sessionToken, batchId: s.batch,
    })).rejects.toThrow("Super admin session required");
    await expect(t.mutation(api.mutations.affiliateLedger.markLedgerPaid, {
      userId: s.affiliate, sessionToken: affiliate.sessionToken, ledgerId: s.affiliateLedger,
    })).rejects.toThrow("Super admin session required");
  });

  it("preserves self-ledger ownership, calculations, and status transitions", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner@ledger.test");
    const manager = await login(t, "manager@ledger.test");

    const row = await t.mutation(api.mutations.affiliateLedger.upsertMyLedgerForPeriod, {
      userId: s.owner, sessionToken: owner.sessionToken, periodStart: "2026-07-01",
    });
    expect(row).toMatchObject({
      referrerUserId: s.owner, attributedRevenueCents: 12345,
      commissionRate: 0.1, commissionCents: 1235, status: "open",
    });
    await expect(t.mutation(api.mutations.affiliateLedger.lockLedgerPeriod, {
      userId: s.owner, sessionToken: owner.sessionToken, ledgerId: row!._id,
    })).resolves.toMatchObject({ status: "locked", commissionCents: 1235 });
    await expect(t.mutation(api.mutations.affiliateLedger.lockLedgerPeriod, {
      userId: s.manager, sessionToken: manager.sessionToken, ledgerId: row!._id,
    })).rejects.toThrow("Access denied");
  });

  it("fails closed for missing, invalid, revoked, idle-expired, and absolute-expired sessions", async () => {
    for (const variant of ["missing", "invalid", "revoked", "idle", "expired"] as const) {
      const t = backend();
      const s = await seed(t);
      const auth = await login(t, "owner@ledger.test");
      let token = auth.sessionToken;
      if (variant === "missing") token = "";
      if (variant === "invalid") token = "not-a-session";
      if (variant === "revoked" || variant === "idle" || variant === "expired") {
        await t.run(async (ctx) => {
          const session = await ctx.db.query("authSessions")
            .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(auth.sessionToken))).unique();
          if (variant === "revoked") await ctx.db.patch(session!._id, { revokedAt: Date.now() });
          if (variant === "idle") await ctx.db.patch(session!._id, { idleExpiresAt: Date.now() - 1 });
          if (variant === "expired") await ctx.db.patch(session!._id, { expiresAt: Date.now() - 1 });
        });
      }
      await expect(t.query(api.queries.affiliateLedger.getMyLedger, {
        userId: s.owner, sessionToken: token,
      })).rejects.toThrow(SESSION_ERROR);
    }
  }, 20_000);

  it("passes the hydrated staff token and preserves exact frontend skip branches", () => {
    const source = readFileSync(fileURLToPath(new URL(
      "../../../packages/frontend/src/components/affiliate/AffiliateLedgerTab.tsx",
      import.meta.url,
    )), "utf8");
    expect(source).toContain("const { userId, sessionToken, isLoading, user } = useAuth()");
    expect(source).toContain("isViewingOther || !sessionToken\n      ? \"skip\"");
    expect(source).toContain("isViewingOther && sessionToken\n      ? {");
    expect(source).not.toContain('sessionToken: ""');
  });
});
