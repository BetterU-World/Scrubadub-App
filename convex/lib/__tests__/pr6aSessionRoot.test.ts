import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");

function makeTest() {
  return convexTest(schema, modules);
}

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword("test-password-123");
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", {
      name: "PR 6A Company A",
      timezone: "America/New_York",
      tier: "scrub_pro",
      subscriptionStatus: "active",
    });
    const companyB = await ctx.db.insert("companies", {
      name: "PR 6A Company B",
      timezone: "America/New_York",
      tier: "scrub_team",
      subscriptionStatus: "active",
    });
    const ownerA = await ctx.db.insert("users", {
      email: "owner-a@pr6a.test",
      passwordHash,
      name: "Owner A",
      companyId: companyA,
      role: "owner",
      status: "active",
    });
    const cleanerA = await ctx.db.insert("users", {
      email: "cleaner-a@pr6a.test",
      passwordHash,
      name: "Cleaner A",
      companyId: companyA,
      role: "cleaner",
      status: "active",
    });
    const ownerB = await ctx.db.insert("users", {
      email: "owner-b@pr6a.test",
      passwordHash,
      name: "Owner B",
      companyId: companyB,
      role: "owner",
      status: "active",
    });
    const clientUserId = await ctx.db.insert("clientUsers", {
      email: "client@pr6a.test",
      passwordHash,
      displayName: "Client",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { companyA, companyB, ownerA, cleanerA, ownerB, clientUserId };
  });
}

async function staffLogin(t: ReturnType<typeof convexTest>, email: string) {
  return await t.action(api.authActions.signIn, {
    email,
    password: "test-password-123",
  });
}

describe("Security V2 PR 6A session-root hydration", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("hydrates the exact staff principal selected by a valid verified session", async () => {
    const t = makeTest();
    const { ownerA } = await seed(t);
    const auth = await staffLogin(t, "owner-a@pr6a.test");
    await expect(t.query(api.authQueries.getCurrentUser, { sessionToken: auth.sessionToken }))
      .resolves.toMatchObject({ _id: ownerA, role: "owner", companyName: "PR 6A Company A" });
  });

  it("does not hydrate from a missing, arbitrary, or forged browser identity", async () => {
    const t = makeTest();
    const { ownerB } = await seed(t);
    await expect(t.query(api.authQueries.getCurrentUser, { sessionToken: "" }))
      .resolves.toBeNull();
    await expect(t.query(api.authQueries.getCurrentUser, { sessionToken: "arbitrary-token" }))
      .resolves.toBeNull();
    await expect(t.query(api.authQueries.getCurrentUser, {
      sessionToken: "arbitrary-token",
      userId: ownerB,
    } as any)).rejects.toThrow();
  });

  it("cannot use a valid session to hydrate a different supplied user", async () => {
    const t = makeTest();
    const { ownerB } = await seed(t);
    const auth = await staffLogin(t, "owner-a@pr6a.test");
    await expect(t.query(api.authQueries.getCurrentUser, {
      sessionToken: auth.sessionToken,
      userId: ownerB,
    } as any)).rejects.toThrow();
  });

  it("does not hydrate revoked sessions", async () => {
    const t = makeTest();
    await seed(t);
    const auth = await staffLogin(t, "owner-a@pr6a.test");
    await t.action((api as any).sessionActions.revokeCurrent, { sessionToken: auth.sessionToken });
    await expect(t.query(api.authQueries.getCurrentUser, { sessionToken: auth.sessionToken }))
      .resolves.toBeNull();
  });

  it("does not hydrate idle-expired or absolute-expired sessions", async () => {
    const t = makeTest();
    await seed(t);
    const absolute = await staffLogin(t, "owner-a@pr6a.test");
    const idle = await staffLogin(t, "owner-a@pr6a.test");
    await t.run(async (ctx) => {
      const sessions = await ctx.db.query("authSessions").collect();
      const absoluteSession = sessions.find((s) => s.tokenHash === hashToken(absolute.sessionToken))!;
      const idleSession = sessions.find((s) => s.tokenHash === hashToken(idle.sessionToken))!;
      await ctx.db.patch(absoluteSession._id, { expiresAt: Date.now() - 1 });
      await ctx.db.patch(idleSession._id, { idleExpiresAt: Date.now() - 1 });
    });
    await expect(t.query(api.authQueries.getCurrentUser, { sessionToken: absolute.sessionToken }))
      .resolves.toBeNull();
    await expect(t.query(api.authQueries.getCurrentUser, { sessionToken: idle.sessionToken }))
      .resolves.toBeNull();
  });

  it("requires a valid same-company session for subscription and cleaner usage", async () => {
    const t = makeTest();
    const { companyA, companyB } = await seed(t);
    const owner = await staffLogin(t, "owner-a@pr6a.test");
    await expect(t.query(api.queries.billing.getCompanySubscription, {
      companyId: companyA,
      sessionToken: owner.sessionToken,
    })).resolves.toMatchObject({ subscriptionStatus: "active", scrubPlan: "pro" });
    await expect(t.query(api.queries.billing.getCleanerUsageForUI, {
      companyId: companyA,
      sessionToken: owner.sessionToken,
    })).resolves.toMatchObject({ activeCleaners: 1, scrubPlan: "pro" });
    await expect(t.query(api.queries.billing.getCompanySubscription, {
      companyId: companyB,
      sessionToken: owner.sessionToken,
    })).rejects.toThrow("Access denied");
    await expect(t.query(api.queries.billing.getCleanerUsageForUI, {
      companyId: companyB,
      sessionToken: owner.sessionToken,
    })).rejects.toThrow("Access denied");
  });

  it("denies missing and invalid sessions in both billing shell queries", async () => {
    const t = makeTest();
    const { companyA } = await seed(t);
    for (const sessionToken of ["", "invalid-session"]) {
      await expect(t.query(api.queries.billing.getCompanySubscription, {
        companyId: companyA,
        sessionToken,
      })).rejects.toThrow("verified session is required");
      await expect(t.query(api.queries.billing.getCleanerUsageForUI, {
        companyId: companyA,
        sessionToken,
      })).rejects.toThrow("verified session is required");
    }
  });

  it("preserves existing billing-shell access for other active staff roles", async () => {
    const t = makeTest();
    const { companyA } = await seed(t);
    const cleaner = await staffLogin(t, "cleaner-a@pr6a.test");
    await expect(t.query(api.queries.billing.getCleanerUsageForUI, {
      companyId: companyA,
      sessionToken: cleaner.sessionToken,
    })).resolves.toMatchObject({ activeCleaners: 1 });
  });

  it("hydrates the Client principal from the verified Client session alone", async () => {
    const t = makeTest();
    const { clientUserId } = await seed(t);
    const auth = await t.action(api.clientAuthActions.signIn, {
      email: "client@pr6a.test",
      password: "test-password-123",
    });
    await expect(t.query(api.queries.clientAuth.getCurrentClientUser, {
      sessionToken: auth.sessionToken,
    })).resolves.toMatchObject({ _id: clientUserId, email: "client@pr6a.test" });
  });
});
