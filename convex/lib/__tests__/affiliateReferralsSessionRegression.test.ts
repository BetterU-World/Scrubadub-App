import { readFileSync } from "node:fs";
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
    const companyId = await ctx.db.insert("companies", { name: "Referral Co", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", {
      email: "owner@affiliate-regression.test", passwordHash, name: "Owner", companyId,
      role: "owner", status: "active", referralCode: "owner-code",
    });
    const affiliate = await ctx.db.insert("users", {
      email: "affiliate@affiliate-regression.test", passwordHash, name: "Affiliate",
      role: "affiliate", status: "active", referralCode: "affiliate-code",
    });
    const referred = await ctx.db.insert("users", {
      email: "referred@affiliate-regression.test", passwordHash, name: "Referred", companyId,
      role: "owner", status: "active", referredByCode: "affiliate-code",
    });
    return { owner, affiliate, referred };
  });
}

async function login(t: ReturnType<typeof backend>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

describe("affiliate referral session regression", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("loads referrals for a verified affiliate and the authenticated owner's own referral program", async () => {
    const t = backend();
    const s = await seed(t);
    const affiliate = await login(t, "affiliate@affiliate-regression.test");
    await expect(t.query(api.queries.affiliate.getMyReferrals, {
      userId: s.affiliate,
      sessionToken: affiliate.sessionToken,
    })).resolves.toEqual([expect.objectContaining({ userId: s.referred })]);

    const owner = await login(t, "owner@affiliate-regression.test");
    await expect(t.query(api.queries.affiliate.getMyReferrals, {
      userId: s.owner,
      sessionToken: owner.sessionToken,
    })).resolves.toEqual([]);
  });

  it("rejects missing, invalid, revoked, idle-expired, and absolute-expired sessions", async () => {
    const t = backend();
    const s = await seed(t);
    const tokens = {
      missing: "",
      invalid: "not-a-session",
      revoked: (await login(t, "affiliate@affiliate-regression.test")).sessionToken,
      idle: (await login(t, "affiliate@affiliate-regression.test")).sessionToken,
      absolute: (await login(t, "affiliate@affiliate-regression.test")).sessionToken,
    };
    await t.run(async (ctx) => {
      for (const variant of ["revoked", "idle", "absolute"] as const) {
        const session = await ctx.db.query("authSessions")
          .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(tokens[variant])))
          .unique();
        if (variant === "revoked") await ctx.db.patch(session!._id, { revokedAt: Date.now() });
        if (variant === "idle") await ctx.db.patch(session!._id, { idleExpiresAt: Date.now() - 1 });
        if (variant === "absolute") await ctx.db.patch(session!._id, { expiresAt: Date.now() - 1 });
      }
    });
    for (const token of Object.values(tokens)) {
      await expect(t.query(api.queries.affiliate.getMyReferrals, {
        userId: s.affiliate,
        sessionToken: token,
      })).rejects.toThrow(SESSION_ERROR);
    }
  });

  it("never lets a staff session override its principal with an affiliate ID", async () => {
    const t = backend();
    const s = await seed(t);
    const owner = await login(t, "owner@affiliate-regression.test");
    await expect(t.query(api.queries.affiliate.getMyReferrals, {
      userId: s.affiliate,
      sessionToken: owner.sessionToken,
    })).rejects.toThrow("Session principal does not match the requested user");
  });

  it("uses the hydrated session token and an exact skip branch in the frontend caller", () => {
    const source = readFileSync(
      new URL("../../../packages/frontend/src/pages/owner/AffiliatePage.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("const { user, userId, sessionToken, isLoading } = useAuth()");
    expect(source).toContain('sessionToken ? { userId, sessionToken } : "skip"');
    expect(source).not.toContain("getStaffSessionToken");
    expect(source).not.toContain("scrubadub_userId");
  });
});
