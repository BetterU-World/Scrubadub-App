import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { COMMERCIAL_FUTURE_JOB_TERMINAL_STATUSES } from "../commercialAccountLifecycle";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "lifecycle-password";
beforeEach(() => {
  process.env.TOKEN_PEPPER = "commercial-lifecycle-pepper";
  process.env.STRIPE_SECRET_KEY = "test";
  process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test";
  process.env.RESEND_API_KEY = "test";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.APP_URL = "http://localhost:5173";
});

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Lifecycle Co", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { email: "owner@life.test", passwordHash, name: "Olivia", companyId, role: "owner", status: "active" });
    const manager = await ctx.db.insert("users", { email: "manager@life.test", passwordHash, name: "Marco", companyId, role: "manager", status: "active" });
    const secondOwner = await ctx.db.insert("users", { email: "owner2@life.test", passwordHash, name: "Oscar", companyId, role: "owner", status: "active" });
    const worker = await ctx.db.insert("users", { email: "worker@life.test", passwordHash, name: "Wendy", companyId, role: "cleaner", status: "active" });
    const outsider = await ctx.db.insert("users", { email: "outside@life.test", passwordHash, name: "Outside", companyId: otherCompanyId, role: "owner", status: "active" });
    const account = await ctx.db.insert("commercialAccounts", { companyId, clientName: "Acme", assignedManagerId: manager, status: "active", createdAt: 1, updatedAt: 1 });
    const schedule = await ctx.db.insert("commercialSchedules", { companyId, commercialAccountId: account, title: "Weekly", status: "active", frequency: "weekly", daysOfWeek: [1], startDate: "2099-01-05", createdAt: 1, updatedAt: 1 });
    const job = await ctx.db.insert("jobs", { companyId, commercialAccountId: account, commercialScheduleId: schedule, cleanerIds: [], type: "standard", status: "scheduled", scheduledDate: "2099-01-05", durationMinutes: 60, reworkCount: 0 });
    for (const status of ["approved", "cancelled", "denied"] as const) {
      await ctx.db.insert("jobs", { companyId, commercialAccountId: account, cleanerIds: [], type: "standard", status, scheduledDate: "2099-01-05", durationMinutes: 60, reworkCount: 0 });
    }
    return { companyId, owner, manager, secondOwner, worker, outsider, account, schedule, job };
  });
  const auth: any = {};
  for (const [key, email] of Object.entries({ owner: "owner@life.test", manager: "manager@life.test", worker: "worker@life.test", outsider: "outside@life.test" })) {
    const session = await t.action(api.authActions.signIn, { email, password: PASSWORD }); auth[key] = { userId: (ids as any)[key], sessionToken: session.sessionToken };
  }
  return { t, ...ids, auth };
}

describe("commercial account lifecycle", () => {
  it("pauses, resumes, and ends atomically while preserving jobs and history", async () => {
    const s = await setup();
    expect([...COMMERCIAL_FUTURE_JOB_TERMINAL_STATUSES].sort()).toEqual(["approved", "cancelled", "denied"]);
    const beforePause = Date.now();
    const paused = await s.t.mutation(api.mutations.commercialAccounts.pauseCommercialAccount, { ...s.auth.owner, commercialAccountId: s.account, reason: "seasonal_pause", notes: "  winter  " });
    expect(paused).toEqual({ status: "paused", changed: true, futureActiveJobCount: 1 });
    await expect(s.t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, { ...s.auth.owner, commercialScheduleId: s.schedule, startDate: "2099-01-12", endDate: "2099-01-12" })).rejects.toThrow("active commercial accounts");
    await expect(s.t.mutation(api.mutations.commercialAccounts.pauseCommercialAccount, { ...s.auth.owner, commercialAccountId: s.account, reason: "seasonal_pause" })).rejects.toThrow("cannot be paused");
    await s.t.mutation(api.mutations.commercialAccounts.resumeCommercialAccount, { ...s.auth.owner, commercialAccountId: s.account, notes: " ready " });
    await s.t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, { ...s.auth.owner, commercialScheduleId: s.schedule, startDate: "2099-01-12", endDate: "2099-01-12" });
    await s.t.mutation(api.mutations.commercialAccounts.endCommercialAccount, { ...s.auth.owner, commercialAccountId: s.account, reason: "contract_completed" });
    await expect(s.t.mutation(api.mutations.commercialAccounts.resumeCommercialAccount, { ...s.auth.owner, commercialAccountId: s.account })).rejects.toThrow("cannot be resumed");
    const snapshot: any = await s.t.run(async (ctx) => ({ account: await ctx.db.get(s.account), jobs: await ctx.db.query("jobs").collect(), audits: await ctx.db.query("auditLog").collect(), notifications: await ctx.db.query("notifications").collect() }));
    expect(snapshot.account.lifecycleHistory.map((event: any) => event.type)).toEqual(["paused", "resumed", "ended"]);
    expect(snapshot.account.lifecycleHistory[0].notes).toBe("winter");
    expect(snapshot.account.lifecycleHistory[0].occurredAt).toBeGreaterThanOrEqual(beforePause);
    expect(snapshot.account.lifecycleHistory[0]).not.toHaveProperty("effectiveDate");
    expect(snapshot.account.status).toBe("ended");
    expect(snapshot.jobs.find((job: any) => job._id === s.job).status).toBe("scheduled");
    expect(snapshot.audits.map((event: any) => event.action)).toEqual(["pause_commercial_account", "resume_commercial_account", "end_commercial_account"]);
    expect(snapshot.notifications.filter((n: any) => n.userId === s.owner || n.userId === s.secondOwner)).toHaveLength(0);
    expect(snapshot.notifications.filter((n: any) => n.userId === s.manager)).toHaveLength(3);
    expect(snapshot.notifications.some((n: any) => n.userId === s.manager && n.type === "commercial_account_paused")).toBe(true);
  });

  it("enforces roles, company isolation, Other notes, and verified sessions", async () => {
    const s = await setup();
    const args = { commercialAccountId: s.account, reason: "other" as const };
    await expect(s.t.mutation(api.mutations.commercialAccounts.pauseCommercialAccount, { ...s.auth.owner, ...args })).rejects.toThrow("Notes are required");
    await expect(s.t.mutation(api.mutations.commercialAccounts.pauseCommercialAccount, { ...s.auth.manager, ...args, notes: "x" })).rejects.toThrow("Owner session required");
    await expect(s.t.mutation(api.mutations.commercialAccounts.pauseCommercialAccount, { ...s.auth.worker, ...args, notes: "x" })).rejects.toThrow("Owner session required");
    await expect(s.t.mutation(api.mutations.commercialAccounts.pauseCommercialAccount, { ...s.auth.outsider, ...args, notes: "x" })).rejects.toThrow("Access denied");
    await expect(s.t.mutation(api.mutations.commercialAccounts.pauseCommercialAccount, { userId: s.owner, sessionToken: "invalid", ...args, notes: "x" })).rejects.toThrow("session");
  });

  it("rejects the removed effectiveDate argument", async () => {
    const s = await setup();
    await expect(s.t.mutation(api.mutations.commercialAccounts.pauseCommercialAccount as any, { ...s.auth.owner, commercialAccountId: s.account, reason: "seasonal_pause", effectiveDate: "2099-01-01" })).rejects.toThrow();
  });
});
