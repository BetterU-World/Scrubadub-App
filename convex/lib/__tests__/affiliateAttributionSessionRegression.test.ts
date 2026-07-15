import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const SESSION_ERROR = "verified session is required";

function backend() {
  return convexTest(schema, modules);
}

async function seed(t: ReturnType<typeof backend>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Revenue Co",
      timezone: "America/New_York",
    });
    const purchaserCompanyId = await ctx.db.insert("companies", {
      name: "Purchaser Co",
      timezone: "America/New_York",
    });
    const purchaser = await ctx.db.insert("users", {
      email: "purchaser@revenue.test",
      passwordHash,
      name: "Purchaser",
      companyId: purchaserCompanyId,
      role: "owner",
      status: "active",
    });

    const users = {} as Record<string, any>;
    for (const [key, role] of [
      ["owner", "owner"],
      ["manager", "manager"],
      ["affiliate", "affiliate"],
      ["cleaner", "cleaner"],
      ["maintenance", "maintenance"],
      ["otherAffiliate", "affiliate"],
    ] as const) {
      users[key] = await ctx.db.insert("users", {
        email: `${key}@revenue.test`,
        passwordHash,
        name: key,
        ...(role === "affiliate" ? {} : { companyId }),
        role,
        status: "active",
        referralCode: `${key}-code`,
      });
    }

    const amounts = {
      owner: 11_100,
      manager: 22_200,
      affiliate: 33_300,
      cleaner: 44_400,
      maintenance: 55_500,
      otherAffiliate: 66_600,
    };
    for (const [key, amountCents] of Object.entries(amounts)) {
      await ctx.db.insert("affiliateAttributions", {
        purchaserUserId: purchaser,
        referrerUserId: users[key],
        attributionType: "invoice_paid",
        amountCents,
        currency: "usd",
        stripeInvoiceId: `invoice-${key}`,
        createdAt: Date.now(),
      });
    }

    return { ...users, purchaser, amounts };
  });
}

async function login(t: ReturnType<typeof backend>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

async function expectOwnRevenue(
  t: ReturnType<typeof backend>,
  userId: any,
  sessionToken: string,
  expectedAmount: number,
) {
  await expect(t.query(api.queries.affiliateAttributions.getMyAttributionSummary, {
    userId,
    sessionToken,
  })).resolves.toMatchObject({
    lifetimeRevenueCents: expectedAmount,
    totalAttributedInvoices: 1,
    totalReferredUsers: 1,
  });
  await expect(t.query(api.queries.affiliateAttributions.listMyAttributions, {
    userId,
    sessionToken,
  })).resolves.toMatchObject({
    rows: [expect.objectContaining({ amountCents: expectedAmount })],
  });
}

describe("affiliate Revenue verified-session self-scope regression", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("loads self-scoped summary and rows for affiliates, owners, and managers", async () => {
    const t = backend();
    const s = await seed(t);
    for (const key of ["affiliate", "owner", "manager"] as const) {
      const auth = await login(t, `${key}@revenue.test`);
      await expectOwnRevenue(t, s[key], auth.sessionToken, s.amounts[key]);
    }
  });

  it("matches the established verified-staff policy for cleaner and maintenance callers", async () => {
    const t = backend();
    const s = await seed(t);
    for (const key of ["cleaner", "maintenance"] as const) {
      const auth = await login(t, `${key}@revenue.test`);
      await expectOwnRevenue(t, s[key], auth.sessionToken, s.amounts[key]);
    }
  });

  it("rejects a caller-supplied user ID that differs from the verified principal", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner@revenue.test");

    await expect(t.query(api.queries.affiliateAttributions.getMyAttributionSummary, {
      userId: s.affiliate,
      sessionToken: owner.sessionToken,
    })).rejects.toThrow("does not match");
    await expect(t.query(api.queries.affiliateAttributions.listMyAttributions, {
      userId: s.affiliate,
      sessionToken: owner.sessionToken,
    })).rejects.toThrow("does not match");
  });

  it("never includes another affiliate's attribution records", async () => {
    const t = backend();
    const s = await seed(t);
    const affiliate = await login(t, "affiliate@revenue.test");

    const summary = await t.query(api.queries.affiliateAttributions.getMyAttributionSummary, {
      userId: s.affiliate,
      sessionToken: affiliate.sessionToken,
    });
    const result = await t.query(api.queries.affiliateAttributions.listMyAttributions, {
      userId: s.affiliate,
      sessionToken: affiliate.sessionToken,
    });

    expect(summary.lifetimeRevenueCents).toBe(s.amounts.affiliate);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      amountCents: s.amounts.affiliate,
      stripeInvoiceId: "invoice-affiliate",
    });
  });

  it("rejects missing, invalid, revoked, idle-expired, and absolute-expired sessions for both queries", async () => {
    for (const variant of ["missing", "invalid", "revoked", "idle", "expired"] as const) {
      const t = backend();
      const s = await seed(t);
      const auth = await login(t, "owner@revenue.test");
      let sessionToken = variant === "missing"
        ? ""
        : variant === "invalid"
          ? "not-a-session"
          : auth.sessionToken;

      if (variant !== "missing" && variant !== "invalid") {
        await t.run(async (ctx) => {
          const session = await ctx.db
            .query("authSessions")
            .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(auth.sessionToken)))
            .unique();
          if (variant === "revoked") await ctx.db.patch(session!._id, { revokedAt: Date.now() });
          if (variant === "idle") await ctx.db.patch(session!._id, { idleExpiresAt: Date.now() - 1 });
          if (variant === "expired") await ctx.db.patch(session!._id, { expiresAt: Date.now() - 1 });
        });
      }

      await expect(t.query(api.queries.affiliateAttributions.getMyAttributionSummary, {
        userId: s.owner,
        sessionToken,
      })).rejects.toThrow(SESSION_ERROR);
      await expect(t.query(api.queries.affiliateAttributions.listMyAttributions, {
        userId: s.owner,
        sessionToken,
      })).rejects.toThrow(SESSION_ERROR);
    }
  }, 20_000);
});
