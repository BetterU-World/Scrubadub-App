import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const SUPERADMIN_EMAIL = "dzbfyse@gmail.com";

function makeTest() {
  return convexTest(schema, modules);
}

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword("test-password-123");
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", {
      name: "Company A",
      timezone: "America/New_York",
    });
    const companyB = await ctx.db.insert("companies", {
      name: "Company B",
      timezone: "America/New_York",
    });
    const ownerA = await ctx.db.insert("users", {
      email: "owner-a@example.com",
      passwordHash,
      name: "Owner A",
      companyId: companyA,
      role: "owner",
      status: "active",
    });
    const ownerB = await ctx.db.insert("users", {
      email: "owner-b@example.com",
      passwordHash,
      name: "Owner B",
      companyId: companyB,
      role: "owner",
      status: "active",
    });
    const superadmin = await ctx.db.insert("users", {
      email: SUPERADMIN_EMAIL,
      passwordHash,
      name: "Founder",
      role: "affiliate",
      status: "active",
    });
    const clientUserId = await ctx.db.insert("clientUsers", {
      email: "client@example.com",
      passwordHash,
      displayName: "Client",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { companyA, companyB, ownerA, ownerB, superadmin, clientUserId };
  });
}

async function login(t: ReturnType<typeof convexTest>, email: string) {
  return await t.action(api.authActions.signIn, {
    email,
    password: "test-password-123",
  });
}

describe("high-risk session enforcement", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("requires a verified owner session for authenticated billing", async () => {
    const t = makeTest();
    const { ownerA } = await seed(t);
    await expect(t.action(api.actions.billing.createBillingPortalSession, {
      userId: ownerA,
      sessionToken: "",
    })).rejects.toThrow("verified session is required");

    const auth = await login(t, "owner-a@example.com");
    await expect(t.action(api.actions.billing.createBillingPortalSession, {
      userId: ownerA,
      sessionToken: auth.sessionToken,
    })).rejects.toThrow("No billing account found");
  });

  it("cannot override a verified owner with another user or company", async () => {
    const t = makeTest();
    const { ownerB } = await seed(t);
    const auth = await login(t, "owner-a@example.com");
    await expect(t.action(api.actions.billing.createBillingPortalSession, {
      userId: ownerB,
      sessionToken: auth.sessionToken,
    })).rejects.toThrow("does not match");
  });

  it("requires a verified allowlisted principal for superadmin operations", async () => {
    const t = makeTest();
    const { ownerA, superadmin } = await seed(t);
    await expect(t.query(api.queries.admin.getPlatformStats, {
      userId: superadmin,
      sessionToken: "",
    })).rejects.toThrow("verified session is required");

    const founderAuth = await login(t, SUPERADMIN_EMAIL);
    await expect(t.query(api.queries.admin.getPlatformStats, {
      userId: superadmin,
      sessionToken: founderAuth.sessionToken,
    })).resolves.toMatchObject({ totalCompanies: 2 });

    const ownerAuth = await login(t, "owner-a@example.com");
    await expect(t.query(api.queries.admin.getPlatformStats, {
      userId: ownerA,
      sessionToken: ownerAuth.sessionToken,
    })).rejects.toThrow("Super admin session required");
  });

  it("allows an owner to invite only inside the verified company", async () => {
    const t = makeTest();
    const { ownerA, companyA, companyB } = await seed(t);
    const auth = await login(t, "owner-a@example.com");
    vi.useFakeTimers();
    try {
      const result = await t.action(api.employeeActions.inviteCleaner, {
        companyId: companyA,
        email: "new-worker@example.com",
        name: "New Worker",
        userId: ownerA,
        sessionToken: auth.sessionToken,
        role: "cleaner",
      });
      expect(result.userId).toBeTruthy();

      await expect(t.action(api.employeeActions.inviteCleaner, {
        companyId: companyB,
        email: "foreign-worker@example.com",
        name: "Foreign Worker",
        userId: ownerA,
        sessionToken: auth.sessionToken,
        role: "cleaner",
      })).rejects.toThrow("Access denied");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("rejects legacy-only invitations while public invite acceptance still works", async () => {
    const t = makeTest();
    const { ownerA, companyA } = await seed(t);
    await expect(t.action(api.employeeActions.inviteCleaner, {
      companyId: companyA,
      email: "legacy-worker@example.com",
      name: "Legacy Worker",
      userId: ownerA,
      sessionToken: "",
      role: "cleaner",
    })).rejects.toThrow("verified session is required");

    const token = "public-invite-token";
    await t.run((ctx) => ctx.db.insert("users", {
      email: "accepted-worker@example.com",
      passwordHash: "",
      name: "Accepted Worker",
      companyId: companyA,
      role: "cleaner",
      status: "pending",
      inviteToken: token,
      inviteTokenExpiry: Date.now() + 60_000,
    }));
    await expect(t.action(api.employeeActions.acceptInvite, {
      token,
      password: "accepted-password-123",
    })).resolves.toMatchObject({ role: "cleaner" });
  });

  it("enforces sessions before Connect, payout, settlement, and upload operations", async () => {
    const t = makeTest();
    const { ownerA, ownerB } = await seed(t);
    const auth = await login(t, "owner-a@example.com");
    process.env.STRIPE_SECRET_KEY = "";
    const settlementId = await t.run(async (ctx) => {
      const owner = await ctx.db.get(ownerA);
      const other = await ctx.db.get(ownerB);
      const jobId = await ctx.db.insert("jobs", {
        companyId: owner!.companyId!,
        cleanerIds: [],
        type: "standard",
        status: "scheduled",
        scheduledDate: "2026-01-01",
        durationMinutes: 60,
        reworkCount: 0,
      });
      return await ctx.db.insert("companySettlements", {
        fromCompanyId: owner!.companyId!,
        toCompanyId: other!.companyId!,
        originalJobId: jobId,
        amountCents: 1000,
        currency: "usd",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(t.action(api.actions.companyStripeConnect.ensureCompanyStripeConnectAccount, {
      userId: ownerA,
      sessionToken: auth.sessionToken,
    })).rejects.toThrow("Stripe is not configured");
    await expect(t.action(api.actions.companyStripeConnect.ensureCompanyStripeConnectAccount, {
      userId: ownerB,
      sessionToken: auth.sessionToken,
    })).rejects.toThrow("does not match");
    await expect(t.action(api.actions.settlements.createSettlementPayCheckout, {
      userId: ownerA,
      sessionToken: "",
      settlementId,
    })).rejects.toThrow("verified session is required");
    await expect(t.mutation(api.mutations.storage.generateUploadUrl, {
      userId: ownerA,
      sessionToken: "",
    })).rejects.toThrow("verified session is required");
  });

  it("rejects revoked, expired, and inactive principals in newly protected queries", async () => {
    const t = makeTest();
    const { superadmin } = await seed(t);
    const revoked = await login(t, SUPERADMIN_EMAIL);
    await t.action((api as any).sessionActions.revokeCurrent, { sessionToken: revoked.sessionToken });
    await expect(t.query(api.queries.admin.getPlatformStats, {
      userId: superadmin,
      sessionToken: revoked.sessionToken,
    })).rejects.toThrow("verified session is required");

    const expired = await login(t, SUPERADMIN_EMAIL);
    await t.run(async (ctx) => {
      const session = await ctx.db
        .query("authSessions")
        .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(expired.sessionToken)))
        .unique();
      await ctx.db.patch(session!._id, { expiresAt: Date.now() - 1 });
    });
    await expect(t.query(api.queries.admin.getPlatformStats, {
      userId: superadmin,
      sessionToken: expired.sessionToken,
    })).rejects.toThrow("verified session is required");

    const inactive = await login(t, SUPERADMIN_EMAIL);
    await t.run((ctx) => ctx.db.patch(superadmin, { status: "inactive" }));
    await expect(t.query(api.queries.admin.getPlatformStats, {
      userId: superadmin,
      sessionToken: inactive.sessionToken,
    })).rejects.toThrow("verified session is required");
  });

  it("retains ordinary ID compatibility and client authentication", async () => {
    const t = makeTest();
    const { ownerA, clientUserId } = await seed(t);
    await expect(t.query(api.authQueries.getCurrentUser, { userId: ownerA }))
      .resolves.toMatchObject({ _id: ownerA });
    await expect(t.action(api.clientAuthActions.signIn, {
      email: "client@example.com",
      password: "test-password-123",
    })).resolves.toMatchObject({ clientUserId });
  });

  it("never writes a session secret to security logs", async () => {
    const t = makeTest();
    const { superadmin } = await seed(t);
    const auth = await login(t, SUPERADMIN_EMAIL);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await t.query(api.queries.admin.getPlatformStats, {
      userId: superadmin,
      sessionToken: auth.sessionToken,
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain(auth.sessionToken);
    info.mockRestore();
  });
});
