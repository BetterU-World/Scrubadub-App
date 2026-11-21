import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashToken } from "../tokens";
import {
  countJob,
  DAY,
  engagement,
  inWindow,
  reportingPlan,
} from "../adminHubModel";

const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.UTC(2026, 10, 21, 12);
async function setup() {
  const t = convexTest(schema, modules);
  const seed = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Founder QA",
      timezone: "UTC",
      qaFixtureKey: "synthetic",
      subscriptionStatus: "trialing",
      stripeSubscriptionId: "sub_test",
    });
    const otherId = await ctx.db.insert("companies", {
      name: "Other",
      timezone: "UTC",
      tier: "scrub_pro",
      subscriptionStatus: "active",
    });
    const userId = await ctx.db.insert("users", {
      name: "Owner",
      email: "owner@synthetic.test",
      passwordHash: "PRIVATE",
      role: "owner",
      status: "active",
      companyId,
    });
    const managerId = await ctx.db.insert("users", {
      name: "Manager",
      email: "manager@synthetic.test",
      passwordHash: "PRIVATE",
      role: "manager",
      status: "active",
      companyId,
    });
    const affiliateId = await ctx.db.insert("users", {
      name: "Affiliate",
      email: "affiliate@synthetic.test",
      passwordHash: "PRIVATE",
      role: "affiliate",
      status: "active",
    });
    const clientId = await ctx.db.insert("clientUsers", {
      email: "client@synthetic.test",
      displayName: "Client",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const entitlementId = await ctx.db.insert("platformAdmins", {
      userId,
      active: true,
      revision: 1,
      updatedAt: NOW,
    });
    const session = async (id: typeof userId, token: string) =>
      ctx.db.insert("authSessions", {
        principalType: "staff",
        userId: id,
        tokenHash: hashToken(token),
        version: 1,
        createdAt: NOW,
        lastUsedAt: NOW,
        expiresAt: NOW + 30 * DAY,
        idleExpiresAt: NOW + 7 * DAY,
      });
    const sessionId = await session(userId, "owner-token");
    await session(managerId, "manager-token");
    await session(affiliateId, "affiliate-token");
    await ctx.db.insert("authSessions", {
      principalType: "client",
      clientUserId: clientId,
      tokenHash: hashToken("client-token"),
      version: 1,
      createdAt: NOW,
      lastUsedAt: NOW,
      expiresAt: NOW + DAY,
      idleExpiresAt: NOW + DAY,
    });
    return {
      companyId,
      otherId,
      userId,
      managerId,
      affiliateId,
      clientId,
      entitlementId,
      sessionId,
    };
  });
  return {
    t,
    ...seed,
    auth: { userId: seed.userId, sessionToken: "owner-token" },
  };
}
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Hub V2 evidence definitions", () => {
  it("uses exact lower-exclusive upper-inclusive UTC boundaries", () => {
    expect(inWindow(NOW - 7 * DAY, NOW, 7)).toBe(false);
    expect(inWindow(NOW - 7 * DAY + 1, NOW, 7)).toBe(true);
    expect(inWindow(NOW, NOW, 7)).toBe(true);
    expect(inWindow(NOW + 1, NOW, 7)).toBe(false);
    expect(reportingPlan()).toBe("Unknown / unset");
    expect(reportingPlan("scrub_pro")).toBe("Pro");
    expect(reportingPlan("cleaning_owner")).toContain("Legacy");
  });
  it("does not substitute scheduling or assignment for completion or activity", () => {
    const counts: Record<string, number> = {};
    const job = {
      _creationTime: NOW - DAY,
      scheduledDate: "2026-11-22",
      status: "approved",
    };
    countJob(counts, job, NOW);
    expect(counts.created7d).toBe(1);
    expect(counts.scheduled7d).toBeUndefined();
    expect(counts.completed7d).toBeUndefined();
    expect(counts.approvedMissingCompletion).toBe(1);
    countJob(
      counts,
      {
        ...job,
        scheduledDate: "2026-11-20",
        completedAt: NOW - 2 * DAY,
        approvedAt: NOW,
        source: "calendar_sync",
      },
      NOW,
    );
    countJob(
      counts,
      { ...job, sharedFromJobId: "original", completedAt: NOW },
      NOW,
    );
    countJob(
      counts,
      {
        ...job,
        status: "cancelled",
        scheduledDate: "2026-11-20",
        cancelledAt: NOW,
        generatedFromCommercialSchedule: true,
      },
      NOW,
    );
    expect(counts.completed7d).toBe(1);
    expect(counts.approved7d).toBe(1);
    expect(counts.scheduled7d).toBe(1);
    expect(counts.cancelled7d).toBe(1);
    expect(counts.sharedCopies).toBe(1);
    expect(counts.sharedCreated7d).toBe(1);
    expect(counts.automatedJobs).toBe(2);
  });
  it("classifies only full observation windows", () => {
    const start = NOW - 30 * DAY;
    expect(engagement(NOW, NOW, start, NOW, 30)).toBe("Both active");
    expect(engagement(NOW, null, start, NOW, 7)).toBe("Owner-only");
    expect(engagement(null, NOW, start, NOW, 7)).toBe("Staff-only");
    expect(engagement(null, null, start, NOW, 7)).toBe("Neither");
    expect(engagement(NOW, NOW, NOW - 7 * DAY + 1, NOW, 7)).toBe(
      "Insufficient observation",
    );
    expect(engagement(NOW, NOW, null, NOW, 30)).toBe(
      "Insufficient observation",
    );
  });
});

describe("Hub V2 bounded reporting and authorization", () => {
  it("includes QA, separates populations, and preserves overlapping billing evidence", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("users", {
        companyId: s.companyId,
        name: "Inactive worker",
        email: "worker@synthetic.test",
        passwordHash: "PRIVATE",
        role: "cleaner",
        status: "inactive",
      });
      await ctx.db.insert("workerProfiles", {
        companyId: s.companyId,
        userId: s.managerId,
        workerType: "w2_employee",
        workerStatus: "active",
        primaryRole: "manager",
        eligibleRoles: ["manager"],
        onboardingStatus: "complete",
        jobEligibilityStatus: "eligible",
        createdAt: NOW,
        updatedAt: NOW,
      });
      for (let i = 0; i < 2; i++)
        await ctx.db.insert("clientRelationships", {
          companyId: s.companyId,
          clientUserId: s.clientId,
          displayName: "Duplicate client record",
          clientType: "residential",
          status: "active",
          createdAt: NOW,
          updatedAt: NOW,
        });
      await ctx.db.insert("complimentarySubscriptions", {
        companyId: s.companyId,
        active: true,
        revision: 1,
        updatedAt: NOW,
      });
      await ctx.db.insert("subscriptionNoticeAccounts", {
        companyId: s.companyId,
        updatedAt: NOW,
        fingerprint: "synthetic",
        snapshot: {
          subscriptionId: "sub_test",
          customerId: "cus_test",
          status: "trialing",
          renewing: true,
          createdAt: NOW,
          plan: "Test",
          amount: 100,
          currency: "usd",
          interval: "month",
          intervalCount: 1,
          anchor: NOW,
          trialEnd: NOW + DAY,
          discounts: [
            {
              id: "discount_test",
              description: "Test promotion",
              start: NOW - DAY,
              end: NOW + DAY,
            },
          ],
        },
      });
    });
    const report = await s.t.action(api.adminHub.report, s.auth),
      c = report.counts;
    expect(c.companies).toBe(2);
    expect(c.qaCompanies).toBe(1);
    expect(c.loginAccounts).toBe(4);
    expect(c["role:owner"]).toBe(1);
    expect(c["role:manager"]).toBe(1);
    expect(c["role:cleaner"]).toBe(1);
    expect(c.workerProfiles).toBe(1);
    expect(c.clientIdentities).toBe(1);
    expect(c.clientRelationships).toBe(2);
    expect(c["plan:Unknown / unset"]).toBe(1);
    expect(c["plan:Pro"]).toBe(1);
    expect(c.trial).toBe(1);
    expect(c.promotion).toBe(1);
    expect(c.complimentary).toBe(1);
    expect(c.paymentUnverified).toBe(2);
    expect(c["engagement7:Insufficient observation"]).toBe(2);
    expect(c.missingWorkerProfiles).toBe(1);
  });
  it("preserves emails using minimal paginated projections and isolates tenant queries", async () => {
    const s = await setup();
    const first = await s.t.query(api.adminHubData.companies, {
      ...s.auth,
      search: "",
      paginationOpts: { numItems: 1, cursor: null },
    });
    const next = await s.t.query(api.adminHubData.companies, {
      ...s.auth,
      search: "",
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    expect(first.page).toHaveLength(1);
    expect(next.page).toHaveLength(1);
    expect(first.page[0].id).not.toBe(next.page[0].id);
    const people = await s.t.query(api.adminHubData.people, {
      ...s.auth,
      companyId: s.companyId,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(people.page[0].email).toContain("synthetic.test");
    expect(JSON.stringify(people)).not.toContain("PRIVATE");
    await expect(
      s.t.query(api.queries.billing.getCompanySubscription, {
        companyId: s.otherId,
        sessionToken: "owner-token",
      }),
    ).rejects.toThrow("Access denied");
    const solo = await s.t.action(api.adminHub.report, {
      ...s.auth,
      companyId: s.otherId,
    });
    expect(solo.counts.staffAccounts ?? 0).toBe(0);
  });
  it("rejects non-admins, spoofed principals, revoked grants and revoked sessions", async () => {
    const s = await setup();
    await expect(
      s.t.action(api.adminHub.report, {
        userId: s.managerId,
        sessionToken: "manager-token",
      }),
    ).rejects.toThrow("Super admin");
    await expect(
      s.t.query(api.adminHubData.people, {
        userId: s.managerId,
        sessionToken: "manager-token",
        companyId: s.otherId,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow("Super admin");
    await expect(
      s.t.query(api.adminHubData.company, {
        userId: s.managerId,
        sessionToken: "owner-token",
        companyId: s.otherId,
      }),
    ).rejects.toThrow("match");
    await s.t.run((ctx) => ctx.db.patch(s.entitlementId, { active: false }));
    await expect(s.t.action(api.adminHub.report, s.auth)).rejects.toThrow(
      "Super admin",
    );
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.entitlementId, { active: true });
      await ctx.db.patch(s.sessionId, { revokedAt: NOW });
    });
    await expect(
      s.t.query(api.adminHubData.company, {
        ...s.auth,
        companyId: s.companyId,
      }),
    ).rejects.toThrow("verified session");
  });
  it("counts beyond the old 10,000-row ceiling with complete pagination", async () => {
    const s = await setup();
    for (let start = 0; start < 10_000; start += 500)
      await s.t.run(async (ctx) => {
        for (let i = start; i < start + 500; i++)
          await ctx.db.insert("users", {
            email: `scale-${i}@synthetic.test`,
            name: "Synthetic",
            passwordHash: "unused-synthetic",
            role: "owner",
            companyId: s.otherId,
            status: "pending",
          });
      });
    const result = await s.t.action(api.adminHub.report, s.auth);
    expect(result.counts.loginAccounts).toBe(10_003);
    expect(result.counts["role:owner"]).toBe(10_001);
    expect(result.counts.clientIdentities).toBe(1);
    expect(result.pages).toBeGreaterThan(100);
  }, 60_000);
});

describe("foreground presence contract", () => {
  it.each([
    [true, true, "Both active"],
    [true, false, "Owner-only"],
    [false, true, "Staff-only"],
    [false, false, "Neither"],
  ] as const)(
    "reads persisted owner=%s staff=%s evidence as %s",
    async (owner, staff, expected) => {
      vi.mocked(Date.now).mockReturnValue(NOW - 31 * DAY);
      const s = await setup();
      vi.mocked(Date.now).mockReturnValue(NOW);
      await s.t.run(async (ctx) => {
        await ctx.db.insert("hubObservation", {
          version: 1,
          startedAt: NOW - 31 * DAY,
        });
        for (const [group, observed] of [
          ["owner", owner],
          ["staff", staff],
        ] as const) {
          if (observed)
            await ctx.db.insert("hubCompanyPresence", {
              companyId: s.companyId,
              group,
              version: 1,
              lastSeenAt: NOW - DAY,
            });
        }
      });
      const company = await s.t.query(api.adminHubData.company, {
        ...s.auth,
        companyId: s.companyId,
      });
      expect(company?.engagement7).toBe(expected);
      expect(company?.engagement30).toBe(expected);
    },
  );
  it("records read-only access, deduplicates sessions and preserves observation-time role/company", async () => {
    const s = await setup();
    expect(
      await s.t.mutation(api.adminPresence.observe, {
        sessionToken: "owner-token",
        surface: "staff_app",
      }),
    ).toEqual({ recorded: true });
    expect(
      await s.t.mutation(api.adminPresence.observe, {
        sessionToken: "owner-token",
        surface: "staff_app",
      }),
    ).toEqual({ recorded: false });
    await s.t.run((ctx) =>
      ctx.db.insert("authSessions", {
        principalType: "staff",
        userId: s.userId,
        tokenHash: hashToken("second-session"),
        version: 1,
        createdAt: NOW,
        lastUsedAt: NOW,
        expiresAt: NOW + DAY,
        idleExpiresAt: NOW + DAY,
      }),
    );
    expect(
      await s.t.mutation(api.adminPresence.observe, {
        sessionToken: "second-session",
        surface: "staff_app",
      }),
    ).toEqual({ recorded: false });
    await s.t.run((ctx) =>
      ctx.db.patch(s.userId, { role: "manager", companyId: s.otherId }),
    );
    await s.t.mutation(api.adminPresence.observe, {
      sessionToken: "owner-token",
      surface: "staff_app",
    });
    const rows = await s.t.run((ctx) =>
      ctx.db.query("hubDailyPresence").collect(),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.companyId, r.role])).toEqual(
      expect.arrayContaining([
        [s.companyId, "owner"],
        [s.otherId, "manager"],
      ]),
    );
    expect(
      await s.t.run((ctx) => ctx.db.query("hubObservation").collect()),
    ).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("path");
  });
  it("excludes client/affiliate credentials and refuses forged identity/timestamps", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(api.adminPresence.observe, {
        sessionToken: "client-token",
        surface: "staff_app",
      }),
    ).rejects.toThrow("verified session");
    expect(
      await s.t.mutation(api.adminPresence.observe, {
        sessionToken: "affiliate-token",
        surface: "staff_app",
      }),
    ).toEqual({ recorded: false });
    await expect(
      s.t.mutation(api.adminPresence.observe, {
        sessionToken: "owner-token",
        surface: "staff_app",
        userId: s.managerId,
        timestamp: 1,
      } as never),
    ).rejects.toThrow();
    expect(
      await s.t.run((ctx) => ctx.db.query("hubDailyPresence").collect()),
    ).toEqual([]);
  });
  it("does not backfill from sessions, login events or assignments", async () => {
    const s = await setup();
    const c = await s.t.query(api.adminHubData.company, {
      ...s.auth,
      companyId: s.companyId,
    });
    expect(c?.ownerLastSeen).toBeNull();
    expect(c?.coverageStart).toBeNull();
    expect(c?.engagement7).toBe("Insufficient observation");
  });
  it("prunes expired telemetry in bounded batches without deleting coverage metadata", async () => {
    const s = await setup();
    await s.t.mutation(api.adminPresence.observe, {
      sessionToken: "owner-token",
      surface: "staff_app",
    });
    vi.mocked(Date.now).mockReturnValue(NOW + 91 * DAY);
    await s.t.mutation(internal.adminPresence.prune, {});
    expect(
      await s.t.run((ctx) => ctx.db.query("hubDailyPresence").collect()),
    ).toEqual([]);
    expect(
      await s.t.run((ctx) => ctx.db.query("hubCompanyPresence").collect()),
    ).toEqual([]);
    expect(
      await s.t.run((ctx) => ctx.db.query("hubObservation").collect()),
    ).toHaveLength(1);
  });
});
