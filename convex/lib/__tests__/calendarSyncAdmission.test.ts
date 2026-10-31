import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { triggerSync } from "../../mutations/calendarSync";
import { syncConnection } from "../../actions/calendarSync";
import { getFunctionName } from "convex/server";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const sync = internal.mutations.calendarSync;
const action = internal.actions.calendarSync.syncConnection;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const LAST_SUCCESS = NOW - 2 * 60 * 60_000;
const feed = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:reservation-one\r\nDTSTART;VALUE=DATE:20261026\r\nDTEND;VALUE=DATE:20261027\r\nEND:VEVENT\r\nEND:VCALENDAR";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Calendar Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { companyId, email: "admission@test.dev", passwordHash: await hashPassword("test-password-123"), name: "Owner", role: "owner", status: "active" });
    const propertyId = await ctx.db.insert("properties", { companyId, name: "Rental", address: "1 Main", type: "residential", amenities: [], active: true });
    const connectionId = await ctx.db.insert("calendarConnections", { companyId, propertyId, createdBy: ownerId, platform: "airbnb", icalUrl: "https://calendar.example/feed.ics", enabled: true, lastSyncAt: LAST_SUCCESS, lastSyncStatus: "success", initialSyncCutoff: "2026-10-25", consecutiveErrors: 0, createdAt: NOW });
    await ctx.db.insert("jobAutomationRules", { companyId, propertyId, enabled: true, jobType: "turnover", defaultDurationMinutes: 180 });
    return { companyId, ownerId, propertyId, connectionId };
  });
  const session = await t.action(api.authActions.signIn, { email: "admission@test.dev", password: "test-password-123" });
  const auth = { sessionToken: session.sessionToken, connectionId: ids.connectionId };
  return {
    t, ...ids, auth,
    manual: () => t.mutation(api.mutations.calendarSync.triggerSync, auth),
    cron: () => t.mutation(sync.cronTick, {}),
    state: () => t.run(ctx => ctx.db.get(ids.connectionId)),
    scheduled: () => t.run(ctx => ctx.db.system.query("_scheduled_functions").collect()),
    drain: () => t.finishAllScheduledFunctions(() => vi.runAllTimers()),
  };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv("APP_URL", "https://scrub.example");
  vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(feed)));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("calendar sync atomic work admission", () => {
  it("admits one of concurrent/repeated manual requests and performs exactly one external fetch", async () => {
    const s = await setup();
    const results = await Promise.all(Array.from({ length: 10 }, () => s.manual()));
    expect(results.filter(result => result === "scheduled")).toHaveLength(1);
    expect(results.filter(result => result === "busy")).toHaveLength(9);
    expect(await s.manual()).toBe("busy");
    expect(await s.scheduled()).toHaveLength(1);
    expect(await s.state()).toMatchObject({ consecutiveErrors: 1, lastSyncAt: LAST_SUCCESS, syncAttempt: { phase: "pending" } });
    expect(await s.t.run(ctx => ctx.db.query("auditLog").collect())).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
    await s.drain();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await s.state()).toMatchObject({ consecutiveErrors: 0, lastSyncAt: NOW, lastSyncStatus: "success" });
    expect((await s.state())?.syncAttempt).toBeUndefined();
    expect(await s.t.run(ctx => ctx.db.query("jobs").collect())).toHaveLength(1);
    expect(await s.t.run(ctx => ctx.db.query("calendarSyncLogs").collect())).toHaveLength(1);
    expect(await s.manual()).toBe("cooldown");
    expect(await s.scheduled()).toHaveLength(1);
    vi.setSystemTime(NOW + 60_000);
    expect(await s.manual()).toBe("scheduled");
    await s.drain();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await s.t.run(ctx => ctx.db.query("jobs").collect())).toHaveLength(1);
  });

  it.each(["manual-first", "cron-first"] as const)("shares admission across cron and manual triggers (%s)", async order => {
    const s = await setup();
    await Promise.all(order === "manual-first" ? [s.manual(), s.cron()] : [s.cron(), s.manual()]);
    await s.cron();
    expect(await s.manual()).toBe("busy");
    expect(await s.scheduled()).toHaveLength(1);
    expect((await s.state())?.consecutiveErrors).toBe(1);
    await s.drain();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate action deliveries, running overlaps and direct legacy work before a second fetch", async () => {
    const s = await setup();
    await s.manual();
    const attemptId = (await s.state())!.syncAttempt!.id;
    let enter!: () => void;
    let release!: (response: Response) => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const response = new Promise<Response>(resolve => { release = resolve; });
    vi.mocked(fetch).mockImplementationOnce(() => { enter(); return response; });
    const running = s.t.action(action, { connectionId: s.connectionId, attemptId });
    await entered;
    expect((await s.state())?.syncAttempt?.phase).toBe("running");
    expect(await s.t.action(action, { connectionId: s.connectionId, attemptId })).toBe("skipped");
    expect(await s.t.action(action, { connectionId: s.connectionId })).toBe("skipped");
    expect(await s.manual()).toBe("busy");
    await s.cron();
    expect(await s.scheduled()).toHaveLength(1);
    release(new Response(feed));
    expect(await running).toBe("success");
    // The queued copy also skips after success rather than reserving new work.
    await s.drain();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await s.state()).toMatchObject({ enabled: true, lastSyncStatus: "success", consecutiveErrors: 0 });
  });

  it("releases failed work with a cooldown and suspends at three real failures", async () => {
    const s = await setup();
    vi.mocked(fetch).mockRejectedValue(new Error("Feed unavailable"));
    for (let i = 0; i < 3; i++) {
      expect(await s.manual()).toBe("scheduled");
      await s.drain();
      expect((await s.state())?.syncAttempt).toBeUndefined();
      expect((await s.state())?.lastSyncAt).toBe(LAST_SUCCESS);
      if (i < 2) expect(await s.manual()).toBe("cooldown");
      vi.setSystemTime(NOW + (i + 1) * 60_000);
    }
    expect(await s.state()).toMatchObject({ enabled: false, consecutiveErrors: 3, lastSyncStatus: "error" });
    await s.cron();
    expect((await s.scheduled()).filter(row => row.state.kind === "pending")).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each(["pending", "running"] as const)("recovers expired %s work and rejects its stale action and callbacks", async phase => {
    const s = await setup();
    await s.manual();
    const old = (await s.state())!.syncAttempt!;
    if (phase === "running") await s.t.mutation(sync.beginSyncAttempt, { connectionId: s.connectionId, attemptId: old.id, scheduled: true });
    vi.setSystemTime(NOW + 15 * 60_000); // Do not execute the interrupted scheduled action.
    expect(await s.manual()).toBe("scheduled");
    const current = await s.state();
    expect(current?.consecutiveErrors).toBe(2);
    expect(current?.syncAttempt?.id).not.toBe(old.id);
    expect((await s.scheduled()).filter(row => row.state.kind === "pending")).toHaveLength(1);
    expect((await s.scheduled()).find(row => row._id === old.scheduledFunctionId)?.state.kind).toBe("canceled");
    expect(await s.t.action(action, { connectionId: s.connectionId, attemptId: old.id })).toBe("skipped");
    expect(await s.t.mutation(sync.recordSyncError, { connectionId: s.connectionId, attemptId: old.id, errorMessage: "Stale failure" })).toBe("skipped");
    expect(await s.t.mutation(sync.processSyncResults, { connectionId: s.connectionId, attemptId: old.id, reservations: [], totalEvents: 0, skipped: 0 })).toBe("skipped");
    expect(await s.state()).toEqual(current);
    await s.drain();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await s.state()).toMatchObject({ consecutiveErrors: 0, lastSyncStatus: "success" });
  });

  it("bounds never-started work to three reservations, canceling expired queued copies", async () => {
    const s = await setup();
    for (let i = 0; i < 3; i++) {
      await s.cron();
      expect((await s.state())?.consecutiveErrors).toBe(i + 1);
      expect((await s.scheduled()).filter(row => row.state.kind === "pending")).toHaveLength(1);
      vi.setSystemTime(NOW + (i + 1) * 15 * 60_000);
    }
    expect(await s.manual()).toBe("suspended");
    expect(await s.state()).toMatchObject({ enabled: false, consecutiveErrors: 3, lastSyncAt: LAST_SUCCESS });
    expect((await s.scheduled()).filter(row => row.state.kind === "pending")).toEqual([]);
    await s.drain();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["reenable", "url", "remove"] as const)("cancels pending work during owner %s and invalidates its token", async change => {
    const s = await setup();
    await s.manual();
    const old = (await s.state())!.syncAttempt!;
    if (change === "reenable") {
      await s.t.mutation(api.mutations.calendarConnections.setEnabled, { ...s.auth, enabled: false });
      await expect(s.manual()).rejects.toThrow("Connection is disabled");
      await s.t.mutation(api.mutations.calendarConnections.setEnabled, { ...s.auth, enabled: true });
    } else if (change === "url") {
      await s.t.mutation(api.mutations.calendarConnections.update, { ...s.auth, icalUrl: "https://calendar.example/repaired.ics" });
    } else {
      await s.t.mutation(api.mutations.calendarConnections.remove, s.auth);
    }
    expect((await s.scheduled()).find(row => row._id === old.scheduledFunctionId)?.state.kind).toBe("canceled");
    expect(await s.t.action(action, { connectionId: s.connectionId, attemptId: old.id })).toBe("skipped");
    if (change !== "remove") {
      expect((await s.state())?.consecutiveErrors).toBe(0);
      expect(await s.manual()).toBe("scheduled");
      await s.drain();
      expect(fetch).toHaveBeenCalledTimes(1);
    } else expect(fetch).not.toHaveBeenCalled();
  });

  it("does not accumulate cancellation charges or erase earlier failures during repeated owner feed edits", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.connectionId, { consecutiveErrors: 2 }));
    for (let i = 0; i < 5; i++) {
      expect(await s.manual()).toBe("scheduled");
      await s.t.mutation(api.mutations.calendarConnections.update, { ...s.auth, icalUrl: `https://calendar.example/feed-${i}.ics` });
      expect(await s.state()).toMatchObject({ enabled: true, consecutiveErrors: 2 });
    }
    expect(await s.manual()).toBe("scheduled");
    expect((await s.scheduled()).filter(row => row.state.kind === "pending")).toHaveLength(1);
    await s.drain();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps staggered pending work valid until its planned start and claims it only once", async () => {
    const s = await setup();
    await s.t.run(async ctx => {
      const scheduledFunctionId = await ctx.scheduler.runAfter(30 * 60_000, action, { connectionId: s.connectionId, attemptId: "staggered" });
      await ctx.db.patch(s.connectionId, { consecutiveErrors: 1, syncAttempt: { id: "staggered", chargedAt: NOW + 30 * 60_000, phase: "pending", scheduledFunctionId } });
    });
    // Advance elapsed timer time too; setSystemTime alone shifts the clock but
    // leaves a fake 30-minute timer with its original remaining duration.
    vi.advanceTimersByTime(15 * 60_000);
    expect(await s.manual()).toBe("busy");
    await s.cron();
    expect(await s.t.action(action, { connectionId: s.connectionId, attemptId: "staggered" })).toBe("skipped");
    expect(fetch).not.toHaveBeenCalled();
    expect(await s.scheduled()).toHaveLength(1);
    await s.drain();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await s.state())?.lastSyncStatus).toBe("success");
  });

  it("expires running admission when error recording fails and allows a fresh fenced recovery", async () => {
    const s = await setup();
    await s.manual();
    const attemptId = (await s.state())!.syncAttempt!.id;
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Feed unavailable"));
    await expect((syncConnection as any)._handler({ runMutation: (ref: any, args: any) => {
      if (getFunctionName(ref) === "mutations/calendarSync:recordSyncError") throw new Error("Recording unavailable");
      return s.t.mutation(ref, args);
    } }, { connectionId: s.connectionId, attemptId })).rejects.toThrow("Recording unavailable");
    expect(await s.manual()).toBe("busy");
    expect(await s.state()).toMatchObject({ consecutiveErrors: 1, lastSyncAt: LAST_SUCCESS, syncAttempt: { phase: "running" } });
    vi.setSystemTime(NOW + 15 * 60_000);
    expect(await s.manual()).toBe("scheduled");
    await s.drain();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await s.state()).toMatchObject({ consecutiveErrors: 0, lastSyncStatus: "success" });
  });

  it("rolls back scheduling when the admission transaction fails", async () => {
    const s = await setup();
    await expect(s.t.run(ctx => (triggerSync as any)._handler({ ...ctx, scheduler: {
      runAfter: async (...args: any[]) => {
        await (ctx.scheduler.runAfter as any)(...args);
        throw new Error("Injected scheduling failure");
      },
    } }, s.auth))).rejects.toThrow("Injected scheduling failure");
    expect(await s.scheduled()).toEqual([]);
    expect(await s.state()).toMatchObject({ consecutiveErrors: 0, lastSyncAt: LAST_SUCCESS });
    expect((await s.state())?.syncAttempt).toBeUndefined();
    // convex-test creates a JS timer before committing the scheduling row.
    // A rolled-back row leaves an orphan timer in this simulator, unlike the
    // real transactional scheduler. Remove it before running subsequent work.
    vi.clearAllTimers();
    expect(await s.manual()).toBe("scheduled");
    await s.drain();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves owner/company authorization before reserving any work", async () => {
    const s = await setup();
    const other = await s.t.run(async ctx => {
      const companyId = await ctx.db.insert("companies", { name: "Other", timezone: "UTC" });
      const propertyId = await ctx.db.insert("properties", { companyId, name: "Other Rental", address: "Other", type: "residential", amenities: [], active: true });
      return ctx.db.insert("calendarConnections", { companyId, propertyId, createdBy: s.ownerId, platform: "other", icalUrl: "https://other.example/feed", enabled: true, consecutiveErrors: 0, lastSyncStatus: "pending", initialSyncCutoff: "2026-10-25", createdAt: NOW });
    });
    await expect(s.t.mutation(api.mutations.calendarSync.triggerSync, { ...s.auth, connectionId: other })).rejects.toThrow("Not your company");
    await expect(s.t.mutation(api.mutations.calendarSync.triggerSync, { ...s.auth, sessionToken: "" })).rejects.toThrow("verified session");
    expect(await s.scheduled()).toEqual([]);
    expect(await s.t.run(ctx => ctx.db.get(other))).toMatchObject({ consecutiveErrors: 0 });
  });

  it("keeps an older in-flight fence authoritative until completion without requiring a backfill", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.connectionId, { consecutiveErrors: 1, syncAttempt: { id: "pre-admission", chargedAt: NOW } }));
    expect(await s.manual()).toBe("busy");
    expect(await s.scheduled()).toEqual([]);
    expect(await s.t.mutation(sync.processSyncResults, {
      connectionId: s.connectionId, attemptId: "pre-admission", skipped: 0, totalEvents: 1,
      snapshotStatus: "valid",
      reservations: [{ uid: "legacy", checkIn: "2026-10-26", checkOut: "2026-10-27", rawHash: "legacy" }],
    })).toBe("success");
    expect(await s.state()).toMatchObject({ consecutiveErrors: 0, lastSyncStatus: "success", lastSyncAt: NOW });
    expect(await s.t.run(ctx => ctx.db.query("jobs").collect())).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
