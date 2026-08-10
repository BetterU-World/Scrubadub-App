import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";
import { getJobTiming } from "../jobTiming";

const modules = import.meta.glob("../../**/*.ts");

describe("one-time stale job timer cleanup", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "stale-timer-pepper";
    process.env.STRIPE_SECRET_KEY = "test";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test";
    process.env.RESEND_API_KEY = "test";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("previews and idempotently closes only confirmed historical timers", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const cutoffBefore = now - 48 * 60 * 60 * 1000;
    const passwordHash = await hashPassword("test-password-123");
    const seeded = await t.run(async (ctx) => {
      const company = await ctx.db.insert("companies", { name: "Timer Co", timezone: "America/New_York" });
      const worker = await ctx.db.insert("users", { email: "timer@test.dev", passwordHash, name: "Worker", companyId: company, role: "cleaner", status: "active" });
      const staleRunning = await ctx.db.insert("jobs", { companyId: company, cleanerIds: [worker], type: "standard", status: "in_progress", scheduledDate: "2026-01-01", durationMinutes: 60, reworkCount: 0, startedAt: now - 72 * 60 * 60 * 1000 });
      const pausedAt = now - 70 * 60 * 60 * 1000;
      const stalePaused = await ctx.db.insert("jobs", { companyId: company, cleanerIds: [worker], type: "standard", status: "in_progress", scheduledDate: "2026-01-02", durationMinutes: 60, reworkCount: 0, startedAt: now - 72 * 60 * 60 * 1000, currentPauseStartedAt: pausedAt, pauseHistory: [{ pausedAt, reason: "break", pausedByUserId: worker }] });
      const current = await ctx.db.insert("jobs", { companyId: company, cleanerIds: [worker], type: "standard", status: "in_progress", scheduledDate: "2026-08-10", durationMinutes: 60, reworkCount: 0, startedAt: now - 60 * 60 * 1000 });
      const alreadyClosed = await ctx.db.insert("jobs", { companyId: company, cleanerIds: [worker], type: "standard", status: "in_progress", scheduledDate: "2026-01-03", durationMinutes: 60, reworkCount: 0, startedAt: now - 80 * 60 * 60 * 1000, timerStoppedAt: now - 79 * 60 * 60 * 1000 });
      return { company, worker, staleRunning, stalePaused, current, alreadyClosed };
    });
    const cleanupApi = (internal as any).staleJobTimersInternal;
    const preview = await t.query(cleanupApi.preview, { companyId: seeded.company, cutoffBefore });
    expect(preview.map((candidate: any) => candidate.jobId).sort()).toEqual([seeded.stalePaused, seeded.staleRunning].sort());

    const result = await t.mutation(cleanupApi.closeConfirmed, { companyId: seeded.company, cutoffBefore, jobIds: [seeded.staleRunning, seeded.stalePaused, seeded.current, seeded.alreadyClosed] });
    expect(result.closed.sort()).toEqual([seeded.stalePaused, seeded.staleRunning].sort());
    expect(result.skipped.sort()).toEqual([seeded.current, seeded.alreadyClosed].sort());
    const state = await t.run(async (ctx) => ({ running: await ctx.db.get(seeded.staleRunning), paused: await ctx.db.get(seeded.stalePaused), current: await ctx.db.get(seeded.current) }));
    expect(state.running?.startedAt).toBe(now - 72 * 60 * 60 * 1000);
    expect(state.running?.timerStoppedAt).toBe(result.closedAt);
    expect(state.paused?.currentPauseStartedAt).toBeUndefined();
    expect(state.paused?.pauseHistory?.[0]).toMatchObject({ resumedAt: result.closedAt, durationMs: expect.any(Number) });
    expect(getJobTiming(state.running!)).toMatchObject({ elapsedMs: result.closedAt - state.running!.startedAt! });
    expect(state.current?.timerStoppedAt).toBeUndefined();

    const retry = await t.mutation(cleanupApi.closeConfirmed, { companyId: seeded.company, cutoffBefore, jobIds: [seeded.staleRunning, seeded.stalePaused] });
    expect(retry.closed).toEqual([]);
    expect(retry.skipped).toHaveLength(2);

    const auth = await t.action(api.authActions.signIn, { email: "timer@test.dev", password: "test-password-123" });
    await t.mutation(api.mutations.jobs.pauseJob, { jobId: seeded.current, reason: "break", userId: seeded.worker, sessionToken: auth.sessionToken });
    await t.mutation(api.mutations.jobs.resumeJob, { jobId: seeded.current, userId: seeded.worker, sessionToken: auth.sessionToken });
  });
});
