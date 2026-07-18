import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const makeTest = () => convexTest(schema, modules);

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword("test-password-123");
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "B", timezone: "America/New_York" });
    const cleaner = await ctx.db.insert("users", { email: "cleaner@example.com", passwordHash, name: "Cleaner", companyId: companyA, role: "cleaner", status: "active" });
    const other = await ctx.db.insert("users", { email: "other@example.com", passwordHash, name: "Other", companyId: companyA, role: "cleaner", status: "active" });
    const foreign = await ctx.db.insert("users", { email: "foreign@example.com", passwordHash, name: "Foreign", companyId: companyB, role: "cleaner", status: "active" });
    const activeJob = await ctx.db.insert("jobs", { companyId: companyA, cleanerIds: [cleaner], type: "standard", status: "in_progress", scheduledDate: "2026-07-18", durationMinutes: 60, reworkCount: 0, startedAt: Date.now() - 60_000 });
    const scheduledJob = await ctx.db.insert("jobs", { companyId: companyA, cleanerIds: [cleaner], type: "standard", status: "scheduled", scheduledDate: "2026-07-19", durationMinutes: 60, reworkCount: 0 });
    const completedJob = await ctx.db.insert("jobs", { companyId: companyA, cleanerIds: [cleaner], type: "standard", status: "approved", scheduledDate: "2026-07-17", durationMinutes: 60, reworkCount: 0, startedAt: Date.now() - 120_000, completedAt: Date.now() - 60_000 });
    return { cleaner, other, foreign, activeJob, scheduledJob, completedJob };
  });
}

async function login(t: ReturnType<typeof convexTest>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: "test-password-123" });
}

describe("job pause lifecycle", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("pauses and resumes with server timestamps, history duration, and audit entries", async () => {
    const t = makeTest();
    const { cleaner, activeJob } = await seed(t);
    const auth = await login(t, "cleaner@example.com");
    await t.mutation(api.mutations.jobs.pauseJob, { jobId: activeJob, reason: "equipment_issue", userId: cleaner, sessionToken: auth.sessionToken });
    const paused = await t.run((ctx) => ctx.db.get(activeJob));
    expect(paused?.currentPauseStartedAt).toEqual(expect.any(Number));
    expect(paused?.pauseHistory).toMatchObject([{ reason: "equipment_issue", pausedByUserId: cleaner }]);
    await expect(t.mutation(api.mutations.jobs.pauseJob, { jobId: activeJob, reason: "break", userId: cleaner, sessionToken: auth.sessionToken })).rejects.toThrow("already paused");

    await t.mutation(api.mutations.jobs.resumeJob, { jobId: activeJob, userId: cleaner, sessionToken: auth.sessionToken });
    const resumed = await t.run((ctx) => ctx.db.get(activeJob));
    expect(resumed?.currentPauseStartedAt).toBeUndefined();
    expect(resumed?.pauseHistory?.[0]).toMatchObject({ resumedAt: expect.any(Number), durationMs: expect.any(Number), resumedByUserId: cleaner });
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((entry) => entry.action)).toEqual(["pause_job", "resume_job"]);
  });

  it("rejects unassigned, cross-company, and unverified callers", async () => {
    const t = makeTest();
    const { other, foreign, activeJob } = await seed(t);
    const otherAuth = await login(t, "other@example.com");
    await expect(t.mutation(api.mutations.jobs.pauseJob, { jobId: activeJob, reason: "break", userId: other, sessionToken: otherAuth.sessionToken })).rejects.toThrow("Not assigned");
    const foreignAuth = await login(t, "foreign@example.com");
    await expect(t.mutation(api.mutations.jobs.pauseJob, { jobId: activeJob, reason: "break", userId: foreign, sessionToken: foreignAuth.sessionToken })).rejects.toThrow("Job not found");
    await expect(t.mutation(api.mutations.jobs.pauseJob, { jobId: activeJob, reason: "break", userId: other, sessionToken: "" })).rejects.toThrow("verified session");
  });

  it("rejects invalid lifecycle transitions and Other without a note", async () => {
    const t = makeTest();
    const { cleaner, activeJob, scheduledJob, completedJob } = await seed(t);
    const auth = await login(t, "cleaner@example.com");
    await expect(t.mutation(api.mutations.jobs.pauseJob, { jobId: scheduledJob, reason: "break", userId: cleaner, sessionToken: auth.sessionToken })).rejects.toThrow("in-progress");
    await expect(t.mutation(api.mutations.jobs.pauseJob, { jobId: completedJob, reason: "break", userId: cleaner, sessionToken: auth.sessionToken })).rejects.toThrow("in-progress");
    await expect(t.mutation(api.mutations.jobs.resumeJob, { jobId: activeJob, userId: cleaner, sessionToken: auth.sessionToken })).rejects.toThrow("not paused");
    await expect(t.mutation(api.mutations.jobs.pauseJob, { jobId: activeJob, reason: "other", userId: cleaner, sessionToken: auth.sessionToken })).rejects.toThrow("note is required");
  });

  it("blocks final completion while paused", async () => {
    const t = makeTest();
    const { cleaner, activeJob } = await seed(t);
    const auth = await login(t, "cleaner@example.com");
    await t.mutation(api.mutations.jobs.pauseJob, { jobId: activeJob, reason: "break", userId: cleaner, sessionToken: auth.sessionToken });
    await expect(t.mutation(api.mutations.jobs.completeJob, { jobId: activeJob, userId: cleaner, sessionToken: auth.sessionToken })).rejects.toThrow("Resume the job");
  });
});
