import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword(PASSWORD);
  return t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Cancel Co", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { email: "cancel-owner@test.dev", passwordHash, name: "Olivia Owner", companyId, role: "owner", status: "active" });
    const manager = await ctx.db.insert("users", { email: "cancel-manager@test.dev", passwordHash, name: "Manny Manager", companyId, role: "manager", status: "active", canSeeAllJobs: true });
    const worker = await ctx.db.insert("users", { email: "cancel-worker@test.dev", passwordHash, name: "Wendy Worker", companyId, role: "cleaner", status: "active" });
    const foreignOwner = await ctx.db.insert("users", { email: "foreign-owner@test.dev", passwordHash, name: "Foreign Owner", companyId: otherCompanyId, role: "owner", status: "active" });
    const scheduled = await ctx.db.insert("jobs", { companyId, cleanerIds: [worker], type: "standard", status: "scheduled", scheduledDate: "2026-07-22", durationMinutes: 60, reworkCount: 0 });
    const completed = await ctx.db.insert("jobs", { companyId, cleanerIds: [worker], type: "standard", status: "approved", scheduledDate: "2026-07-21", durationMinutes: 60, reworkCount: 0, completedAt: Date.now() });
    return { companyId, owner, manager, worker, foreignOwner, scheduled, completed };
  });
}

describe("job cancellation lifecycle", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });
  const login = (t: ReturnType<typeof convexTest>, email: string) => t.action(api.authActions.signIn, { email, password: PASSWORD });

  it("lets an owner cancel with metadata, timeline source data, notification, audit, and operational exclusions", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    const auth = await login(t, "cancel-owner@test.dev");
    await t.mutation(api.mutations.jobs.cancel, { jobId: s.scheduled, reason: "weather", notes: "Storm warning", userId: s.owner, sessionToken: auth.sessionToken });
    const snapshot = await t.run(async (ctx) => ({
      job: await ctx.db.get(s.scheduled),
      notifications: await ctx.db.query("notifications").collect(),
      audits: await ctx.db.query("auditLog").collect(),
    }));
    expect(snapshot.job).toMatchObject({ status: "cancelled", cancelledBy: s.owner, cancelledByName: "Olivia Owner", cancelReason: "weather", cancelNotes: "Storm warning", cancelledAt: expect.any(Number) });
    expect(snapshot.notifications).toHaveLength(1);
    expect(snapshot.notifications[0]).toMatchObject({ userId: s.worker, type: "job_cancelled", relatedJobId: s.scheduled });
    expect(snapshot.audits[0]).toMatchObject({ companyId: s.companyId, userId: s.owner, action: "cancel_job", entityId: s.scheduled });
    expect(JSON.parse(snapshot.audits[0].details!)).toMatchObject({ reason: "weather", notes: "Storm warning" });
    const activeList = await t.query(api.queries.jobs.list, { companyId: s.companyId, userId: s.owner, sessionToken: auth.sessionToken });
    expect(activeList.map((job) => job._id)).not.toContain(s.scheduled);
    const history = await t.query(api.queries.jobs.list, { companyId: s.companyId, userId: s.owner, sessionToken: auth.sessionToken, status: "cancelled" });
    expect(history.map((job) => job._id)).toContain(s.scheduled);
    const calendar = await t.query(api.queries.jobs.getCalendarJobs, { companyId: s.companyId, userId: s.owner, sessionToken: auth.sessionToken, startDate: "2026-07-01", endDate: "2026-07-31" });
    expect(calendar.map((job) => job._id)).not.toContain(s.scheduled);
  });

  it("lets a manager cancel and notifies both worker and owner without duplicates", async () => {
    const t = convexTest(schema, modules); const s = await seed(t); const auth = await login(t, "cancel-manager@test.dev");
    await t.mutation(api.mutations.jobs.cancel, { jobId: s.scheduled, reason: "staff_unavailable", userId: s.manager, sessionToken: auth.sessionToken });
    const notifications = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(new Set(notifications.map((notification) => notification.userId))).toEqual(new Set([s.worker, s.owner]));
  });

  it("rejects workers, cross-company actors, completed/repeated cancellation, and Other without notes", async () => {
    const t = convexTest(schema, modules); const s = await seed(t);
    const workerAuth = await login(t, "cancel-worker@test.dev");
    await expect(t.mutation(api.mutations.jobs.cancel, { jobId: s.scheduled, reason: "weather", userId: s.worker, sessionToken: workerAuth.sessionToken })).rejects.toThrow("Owner or manager");
    const foreignAuth = await login(t, "foreign-owner@test.dev");
    await expect(t.mutation(api.mutations.jobs.cancel, { jobId: s.scheduled, reason: "weather", userId: s.foreignOwner, sessionToken: foreignAuth.sessionToken })).rejects.toThrow("Access denied");
    const ownerAuth = await login(t, "cancel-owner@test.dev");
    await expect(t.mutation(api.mutations.jobs.cancel, { jobId: s.completed, reason: "weather", userId: s.owner, sessionToken: ownerAuth.sessionToken })).rejects.toThrow("Completed jobs");
    await expect(t.mutation(api.mutations.jobs.cancel, { jobId: s.scheduled, reason: "other", userId: s.owner, sessionToken: ownerAuth.sessionToken })).rejects.toThrow("Notes are required");
    await t.mutation(api.mutations.jobs.cancel, { jobId: s.scheduled, reason: "client_cancelled", userId: s.owner, sessionToken: ownerAuth.sessionToken });
    await expect(t.mutation(api.mutations.jobs.cancel, { jobId: s.scheduled, reason: "weather", userId: s.owner, sessionToken: ownerAuth.sessionToken })).rejects.toThrow("already cancelled");
  });
});
