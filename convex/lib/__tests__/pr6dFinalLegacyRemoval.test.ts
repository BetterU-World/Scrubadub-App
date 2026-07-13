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
    const companyA = await ctx.db.insert("companies", { name: "PR 6D A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "PR 6D B", timezone: "America/New_York" });
    const ownerA = await ctx.db.insert("users", { email: "owner-a@pr6d.test", passwordHash, name: "Owner A", companyId: companyA, role: "owner", status: "active" });
    const ownerB = await ctx.db.insert("users", { email: "owner-b@pr6d.test", passwordHash, name: "Owner B", companyId: companyB, role: "owner", status: "active" });
    const managerA = await ctx.db.insert("users", { email: "manager-a@pr6d.test", passwordHash, name: "Manager A", companyId: companyA, role: "manager", status: "active" });
    const cleanerA = await ctx.db.insert("users", { email: "cleaner-a@pr6d.test", passwordHash, name: "Cleaner A", companyId: companyA, role: "cleaner", status: "active" });
    const affiliate = await ctx.db.insert("users", { email: "affiliate@pr6d.test", passwordHash, name: "Affiliate", role: "affiliate", status: "active" });
    const superadmin = await ctx.db.insert("users", { email: SUPERADMIN_EMAIL, passwordHash, name: "Founder", companyId: companyA, role: "owner", status: "active" });
    const jobA = await ctx.db.insert("jobs", {
      companyId: companyA, cleanerIds: [cleanerA], type: "standard", status: "approved", scheduledDate: "2026-07-13",
      durationMinutes: 60, reworkCount: 0, plannedCleanerPayCents: 5000,
    });
    const jobB = await ctx.db.insert("jobs", {
      companyId: companyB, cleanerIds: [], type: "standard", status: "approved", scheduledDate: "2026-07-14",
      durationMinutes: 60, reworkCount: 0,
    });
    const settlement = await ctx.db.insert("companySettlements", {
      fromCompanyId: companyA, toCompanyId: companyB, originalJobId: jobA, amountCents: 7500, currency: "usd",
      status: "open", createdAt: 1, updatedAt: 1,
    });
    const ledger = await ctx.db.insert("affiliateLedger", {
      referrerUserId: affiliate, periodType: "monthly", periodStart: 1, periodEnd: 2,
      attributedRevenueCents: 10000, commissionRate: 0.1, commissionCents: 1000,
      status: "locked", createdAt: 1,
    });
    const batch = await ctx.db.insert("affiliatePayoutBatches", {
      createdAt: 1, createdByUserId: superadmin, method: "manual", totalCommissionCents: 1000,
      ledgerIds: [ledger], status: "recorded",
    });
    await ctx.db.insert("manuals", {
      title: "Owner Manual", category: "owner", roleVisibility: "owner", blobKey: "owner-manual", createdAt: 1,
    });
    return { companyA, companyB, ownerA, ownerB, managerA, cleanerA, affiliate, superadmin, jobA, jobB, settlement, ledger, batch };
  });
}

async function login(t: ReturnType<typeof backend>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

describe("PR 6D final legacy authorization removal", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.SUPERADMIN_EMAILS = SUPERADMIN_EMAIL;
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("allows verified owners to use cleaner-payment and settlement workflows", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner-a@pr6d.test");
    const common = { userId: s.ownerA, sessionToken: owner.sessionToken };

    await expect(t.query(api.queries.cleanerPayments.listUnpaidJobsForCompany, common)).resolves.toEqual([
      expect.objectContaining({ jobId: s.jobA, cleanerUserId: s.cleanerA, plannedPayCents: 5000 }),
    ]);
    await expect(t.query(api.queries.settlements.listMySettlements, { ...common, status: "open" })).resolves.toEqual([
      expect.objectContaining({ _id: s.settlement, direction: "owing", amountCents: 7500 }),
    ]);

    const paymentId = await t.mutation(api.mutations.cleanerPayments.createCleanerPayment, {
      ...common, jobId: s.jobA, amountCents: 5000,
    });
    await expect(t.run((ctx) => ctx.db.get(paymentId))).resolves.toMatchObject({
      companyId: s.companyA, cleanerUserId: s.cleanerA, paidByUserId: s.ownerA,
    });
    await t.mutation(api.mutations.settlements.markSettlementPaid, { ...common, settlementId: s.settlement });
    await expect(t.run((ctx) => ctx.db.get(s.settlement))).resolves.toMatchObject({ status: "paid" });
  });

  it("rejects legacy-only, forged, non-owner, and cross-company financial access", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner-a@pr6d.test");
    const manager = await login(t, "manager-a@pr6d.test");

    await expect(t.query(api.queries.cleanerPayments.listUnpaidJobsForCompany, { userId: s.ownerA, sessionToken: "" })).rejects.toThrow(SESSION_ERROR);
    await expect(t.query(api.queries.cleanerPayments.listUnpaidJobsForCompany, { userId: s.ownerB, sessionToken: owner.sessionToken })).rejects.toThrow("does not match");
    await expect(t.query(api.queries.settlements.listMySettlements, { userId: s.managerA, sessionToken: manager.sessionToken, status: "open" })).rejects.toThrow("Owner session required");
    await expect(t.mutation(api.mutations.cleanerPayments.createCleanerPayment, {
      userId: s.ownerA, sessionToken: owner.sessionToken, jobId: s.jobB, amountCents: 5000,
    })).rejects.toThrow("does not belong to your company");
  });

  it("fails closed for invalid, revoked, and expired financial sessions", async () => {
    for (const variant of ["invalid", "revoked", "expired"] as const) {
      const t = backend();
      const s = await seed(t);
      const owner = await login(t, "owner-a@pr6d.test");
      let token = variant === "invalid" ? "not-a-session" : owner.sessionToken;
      if (variant !== "invalid") {
        await t.run(async (ctx) => {
          const session = await ctx.db.query("authSessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(owner.sessionToken))).unique();
          await ctx.db.patch(session!._id, variant === "revoked" ? { revokedAt: Date.now() } : { expiresAt: Date.now() - 1 });
        });
      }
      await expect(t.query(api.queries.settlements.listMySettlements, { userId: s.ownerA, sessionToken: token, status: "open" })).rejects.toThrow(SESSION_ERROR);
    }
  }, 15_000);

  it("requires a verified allowlisted session for payout and manuals administration", async () => {
    const t = backend();
    const s = await seed(t);
    const founder = await login(t, SUPERADMIN_EMAIL);
    const owner = await login(t, "owner-a@pr6d.test");
    const founderArgs = { userId: s.superadmin, sessionToken: founder.sessionToken };

    await expect(t.query(api.queries.affiliatePayoutBatches.listPayoutBatches, founderArgs)).resolves.toMatchObject({ rows: [expect.objectContaining({ _id: s.batch })] });
    await expect(t.mutation(api.mutations.affiliateLedger.markLedgerPaid, { ...founderArgs, ledgerId: s.ledger })).resolves.toMatchObject({ status: "paid" });
    await expect(t.query(api.queries.manuals.exportManuals, founderArgs)).resolves.toEqual([expect.objectContaining({ blobKey: "owner-manual" })]);
    await expect(t.mutation(api.mutations.manuals.seedManuals, {
      ...founderArgs, manuals: [{ title: "Cleaner Manual", category: "cleaner", roleVisibility: "cleaner", blobKey: "cleaner-manual" }],
    })).resolves.toEqual({ inserted: 1, updated: 0 });

    await expect(t.query(api.queries.affiliatePayoutBatches.listPayoutBatches, { userId: s.ownerA, sessionToken: owner.sessionToken })).rejects.toThrow("Super admin session required");
    await expect(t.query(api.queries.manuals.exportManuals, { userId: s.superadmin, sessionToken: owner.sessionToken })).rejects.toThrow("does not match");
    await expect(t.query(api.queries.manuals.exportManuals, { userId: s.superadmin, sessionToken: "" })).rejects.toThrow(SESSION_ERROR);
  });

  it("removes legacy helpers and keeps all scoped public entry points session-verified", () => {
    const backendFiles = [
      "queries/cleanerPayments.ts", "mutations/cleanerPayments.ts", "queries/settlements.ts", "mutations/settlements.ts",
      "queries/affiliatePayoutBatches.ts", "mutations/affiliateLedger.ts", "queries/manuals.ts", "mutations/manuals.ts",
    ];
    const backendSource = backendFiles.map((path) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8")).join("\n");
    const scopedFunctions = [
      "getCleanerPaymentForJob", "listCleanerPaymentsForCompany", "listUnpaidJobsForCompany", "createCleanerPayment", "markCleanerPaidOutside",
      "createCleanerPaymentBatch", "markCleanerBatchPaidOutside", "updateCleanerPaymentAmount", "sendStripeConnectInvite",
      "listMySettlements", "getSettlementForJob", "upsertSettlementForSharedJob", "markSettlementPaid", "createSettlementBatch", "markSettlementBatchPaidOutside",
      "listPayoutBatches", "getPayoutBatch", "markLedgerPaid", "unmarkLedgerPaid", "exportManuals", "seedManuals",
    ];
    for (const name of scopedFunctions) {
      const block = backendSource.match(new RegExp(`export const ${name} = (?:query|mutation)\\(\\{[\\s\\S]*?\\n\\}\\);`))?.[0];
      expect(block, name).toContain("sessionToken: v.string()");
      expect(block, name).toMatch(/require(Owner|Superadmin)Session\(ctx, args\.sessionToken, args\.userId\)/);
    }

    const legacyNames = [
      ["get", "SessionUser"], ["require", "Auth"], ["require", "Owner"], ["require", "CompanyMember"],
      ["assert", "CompanyAccess"], ["assert", "OwnerRole"], ["require", "SuperAdmin"], ["get", "AuthSessionId"],
      ["requireOwnerManager", "OrCompatibleRole"],
    ].map((parts) => parts.join(""));
    const helperFiles = ["auth.ts", "helpers.ts", "sessionAuth.ts"];
    const helperSource = helperFiles.map((path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8")).join("\n");
    for (const name of legacyNames) {
      expect(helperSource).not.toMatch(new RegExp(`export (?:async )?function ${name}\\b`));
    }

    const frontendFiles = [
      "pages/owner/CleanerPaymentsPage.tsx", "pages/owner/SettlementsPage.tsx", "pages/owner/PaymentsHubPage.tsx",
      "pages/owner/JobDetailPage.tsx", "components/affiliate/AffiliateLedgerTab.tsx", "pages/shared/ManualsPage.tsx",
    ];
    const frontendSource = frontendFiles.map((path) => readFileSync(fileURLToPath(new URL(`../../../packages/frontend/src/${path}`, import.meta.url)), "utf8")).join("\n");
    expect(frontendSource).not.toContain('sessionToken: ""');
    expect(frontendSource).toContain('sessionToken ? { userId, sessionToken, batchId } : "skip"');
    expect(frontendSource).toContain('user?.isSuperadmin && sessionToken');
  });
});
