import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { syncConnection } from "../../actions/calendarSync";
import { cronTick, processSyncResults } from "../../mutations/calendarSync";
import { parseICalFeed } from "../../actions/icalParser";
import { hashPassword } from "../password";
import { calendar, cancelledEvent, reservationEvent, unsafeSnapshots, confirmGuestForTest } from "./calendarSnapshotFixtures";

vi.mock("../../actions/icalParser", async (original) => {
  const actual = await original<typeof import("../../actions/icalParser")>();
  return { ...actual, parseICalFeed: vi.fn(actual.parseICalFeed) };
});
const modules = import.meta.glob("../../**/*.ts");
const sync = internal.mutations.calendarSync;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const LAST_SUCCESS = NOW - 2 * 60 * 60_000;
const feed = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:reservation-one\r\nDTSTART;VALUE=DATE:20261026\r\nDTEND;VALUE=DATE:20261027\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nEND:VCALENDAR";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Calendar Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { companyId, email: "calendar@test.dev", passwordHash: await hashPassword("test-password-123"), name: "Owner", role: "owner", status: "active" });
    const propertyId = await ctx.db.insert("properties", { companyId, name: "Rental", address: "1 Main", type: "residential", amenities: [], active: true });
    const connectionId = await ctx.db.insert("calendarConnections", { companyId, propertyId, createdBy: ownerId, platform: "airbnb", icalUrl: "https://calendar.example/feed.ics", enabled: true, lastSyncAt: LAST_SUCCESS, lastSyncStatus: "success", initialSyncCutoff: "2026-10-25", consecutiveErrors: 0, createdAt: NOW });
    await ctx.db.insert("jobAutomationRules", { companyId, propertyId, enabled: true, jobType: "turnover", defaultDurationMinutes: 180, defaultStartTime: "" });
    return { companyId, ownerId, propertyId, connectionId };
  });
  return {
    t, ...ids,
    state: () => t.run((ctx) => ctx.db.get(ids.connectionId)),
    begin: (attemptId: string) => t.mutation(sync.beginSyncAttempt, { connectionId: ids.connectionId, attemptId }),
    process: (attemptId: string, reservations = parseICalFeed(feed).reservations) => t.mutation(sync.processSyncResults, { connectionId: ids.connectionId, attemptId, snapshotStatus: "valid", reservations, totalEvents: reservations.length, skipped: 0 }),
    fail: (attemptId: string) => t.mutation(sync.recordSyncError, { connectionId: ids.connectionId, attemptId, errorMessage: "Injected failure" }),
    confirm: async () => {
      const session = await t.action(api.authActions.signIn, { email: "calendar@test.dev", password: "test-password-123" });
      const reservation = await t.run((ctx) => ctx.db.query("calendarReservations").first());
      return confirmGuestForTest(t, reservation!._id, session.sessionToken);
    },
    // Execute the real orchestration against real in-memory transactions, with
    // one injectable boundary for processor/error-recording transport failures.
    run: (fault?: "processing" | "recording" | "ack") => (syncConnection as any)._handler({
      runQuery: (ref: any, args: any) => t.query(ref, args),
      runMutation: async (ref: any, args: any) => {
        const name = getFunctionName(ref);
        if (name === "mutations/calendarSync:processSyncResults") {
          if (fault === "processing" || fault === "recording") throw new Error("Injected processing failure");
          const result = await t.mutation(ref, args);
          if (fault === "ack") throw new Error("Lost success acknowledgement");
          return result;
        }
        if (fault === "recording" && name === "mutations/calendarSync:recordSyncError") throw new Error("Error recording unavailable");
        return t.mutation(ref, args);
      },
    }, { connectionId: ids.connectionId }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("APP_URL", "https://scrub.example");
  vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(feed)));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.mocked(parseICalFeed).mockClear(); });

describe("calendar sync failure containment", () => {
  it.each(unsafeSnapshots)("contains $name after a successful import without touching protected records", async ({ content, status }) => {
    const s = await setup();
    expect(await s.run()).toBe("success");
    await s.confirm();
    const lastSuccess = (await s.state())!.lastSyncAt;
    await s.t.run(async (ctx) => {
      const job = (await ctx.db.query("jobs").collect())[0];
      const workerId = await ctx.db.insert("users", { companyId: s.companyId, email: "worker@test.dev", passwordHash: "unused-test-hash", name: "Worker", role: "cleaner", status: "active" });
      const paymentId = await ctx.db.insert("cleanerPayments", { companyId: s.companyId, jobId: job._id, cleanerUserId: workerId, amountCents: 12500, status: "OPEN", createdAt: NOW });
      await ctx.db.patch(job._id, { cleanerIds: [workerId], notes: "Human override", startTime: "09:15", plannedCleanerPayCents: 12500, cleanerPaymentId: paymentId });
    });
    const protectedRecords = () => s.t.run(async (ctx) => ({
      reservations: await ctx.db.query("calendarReservations").collect(),
      jobs: await ctx.db.query("jobs").collect(),
      payments: await ctx.db.query("cleanerPayments").collect(),
      notifications: await ctx.db.query("notifications").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    const before = await protectedRecords();
    vi.advanceTimersByTime(60_000);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(content));
    const empty = status === "valid_empty";
    expect(await s.run()).toBe(empty ? "empty" : "failed");
    expect(await protectedRecords()).toEqual(before);
    expect(await s.state()).toMatchObject({ lastSyncAt: lastSuccess, lastSyncStatus: empty ? "empty" : "error", consecutiveErrors: empty ? 0 : 1, enabled: true });
    const logs = await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect());
    expect(logs.map(log => log.status)).toEqual(["success", empty ? "empty" : "error"]);
    if (empty) expect(logs[1].errorMessage).toBeUndefined();
    else expect(logs[1].errorMessage).not.toContain("https://");
  });

  it.each(["scheduled", "in_progress", "submitted", "approved"] as const)("preserves %s linked jobs and compensation on invalid snapshots", async (status) => {
    const s = await setup();
    await s.run();
    await s.confirm();
    const jobId = await s.t.run(async (ctx) => {
      const job = (await ctx.db.query("jobs").collect())[0];
      await ctx.db.patch(job._id, {
        status, plannedCleanerPayCents: 10000, notes: "Preserve history",
        ...(["submitted", "approved"].includes(status) ? {
          executionHistory: [{ sequence: 1, provenance: "submission_confirmed" as const,
            confirmedById: s.ownerId, confirmedAt: NOW, scheduledDate: job.scheduledDate,
            workers: [{ userId: s.ownerId, displayName: "Owner", role: "owner" }] }],
          submittedExecutionSequence: 1,
          ...(status === "approved" ? { approvedExecutionSequence: 1, approvedAt: NOW } : {}),
        } : {}),
      });
      return job._id;
    });
    const before = await s.t.run((ctx) => ctx.db.get(jobId));
    vi.advanceTimersByTime(60_000);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>Error</html>"));
    expect(await s.run()).toBe("failed");
    expect(await s.t.run((ctx) => ctx.db.get(jobId))).toEqual(before);
  });

  it("recognizes date-less explicit cancellation without canceling unrelated reservations or jobs", async () => {
    const s = await setup();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(calendar(`${reservationEvent()}\r\n${reservationEvent("unrelated")}`)));
    await s.run();
    await s.confirm();
    const jobs = await s.t.run((ctx) => ctx.db.query("jobs").collect());
    vi.advanceTimersByTime(60_000);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(calendar(cancelledEvent())));
    expect(await s.run()).toBe("success");
    const reservations = await s.t.run((ctx) => ctx.db.query("calendarReservations").collect());
    expect(reservations.find(r => r.externalUid === "reservation-one")).toMatchObject({ status: "cancelled", cancellationFlagged: true });
    expect(reservations.find(r => r.externalUid === "unrelated")).toMatchObject({ status: "active" });
    expect(await s.t.run((ctx) => ctx.db.query("jobs").collect())).toEqual(jobs);
  });

  it.each(["invalid", "degraded", undefined] as const)("rejects a direct %s snapshot before persistence", async (snapshotStatus) => {
    const s = await setup();
    await s.run();
    vi.advanceTimersByTime(60_000);
    await s.begin("unsafe-direct");
    const state = await s.state();
    const reservations = await s.t.run((ctx) => ctx.db.query("calendarReservations").collect());
    await expect(s.t.mutation(sync.processSyncResults, { connectionId: s.connectionId, attemptId: "unsafe-direct", snapshotStatus, reservations: [], totalEvents: 0, skipped: 0 })).rejects.toThrow("Unsafe or unvalidated");
    expect(await s.state()).toEqual(state);
    expect(await s.t.run((ctx) => ctx.db.query("calendarReservations").collect())).toEqual(reservations);
  });

  it.each([true, false])("keeps repeated empty checks healthy and hourly (prior reconciliation: %s)", async (priorSuccess) => {
    const s = await setup();
    if (priorSuccess) await s.run();
    else await s.t.run((ctx) => ctx.db.patch(s.connectionId, { lastSyncAt: undefined, lastSyncStatus: "pending" }));
    const lastSuccess = (await s.state())?.lastSyncAt;
    const records = () => s.t.run(async (ctx) => ({ reservations: await ctx.db.query("calendarReservations").collect(), jobs: await ctx.db.query("jobs").collect() }));
    const before = await records();
    vi.mocked(fetch).mockImplementation(async () => new Response(calendar("")));
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(60 * 60_000);
      expect(await s.run()).toBe("empty");
      expect(await s.state()).toMatchObject({ enabled: true, consecutiveErrors: 0, lastSyncStatus: "empty", lastCheckedAt: Date.now() });
      expect((await s.state())?.lastSyncAt).toBe(lastSuccess);
      expect((await s.state())?.syncAttempt).toBeUndefined();
    }
    expect(await records()).toEqual(before);
    expect((await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).filter(log => log.status === "empty")).toHaveLength(4);
    vi.advanceTimersByTime(15 * 60_000);
    await s.t.mutation(sync.cronTick, {});
    expect((await s.state())?.syncAttempt).toBeUndefined();
    vi.advanceTimersByTime(45 * 60_000);
    await s.t.mutation(sync.cronTick, {});
    expect((await s.state())?.syncAttempt?.phase).toBe("pending");
    vi.mocked(fetch).mockImplementation(async () => new Response(feed));
    await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await s.state()).toMatchObject({ enabled: true, lastSyncStatus: "success", consecutiveErrors: 0 });
    expect((await s.state())!.lastSyncAt).toBeGreaterThan(lastSuccess ?? 0);
    // The recovered import is ambiguous and must await owner classification.
    expect(await s.t.run((ctx) => ctx.db.query("jobs").collect())).toHaveLength(0);
  });

  it("breaks a real failure streak with a valid empty check, but still suspends on three subsequent failures", async () => {
    const s = await setup();
    for (let i = 0; i < 2; i++) { await s.run("processing"); vi.advanceTimersByTime(60_000); }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(calendar("")));
    expect(await s.run()).toBe("empty");
    expect(await s.state()).toMatchObject({ consecutiveErrors: 0, enabled: true, lastSyncAt: LAST_SUCCESS, lastSyncStatus: "empty" });
    expect((await s.state())?.lastSyncError).toBeUndefined();
    for (let i = 1; i <= 3; i++) {
      vi.advanceTimersByTime(60_000);
      await s.run("processing");
      expect(await s.state()).toMatchObject({ consecutiveErrors: i, enabled: i < 3, lastSyncAt: LAST_SUCCESS });
    }
  });

  it("rejects inconsistent empty results before any state change", async () => {
    const s = await setup();
    await s.begin("empty-inconsistent");
    const before = await s.state();
    await expect(s.t.mutation(sync.processSyncResults, { connectionId: s.connectionId, attemptId: "empty-inconsistent", snapshotStatus: "valid_empty", reservations: parseICalFeed(feed).reservations, totalEvents: 0, skipped: 0 })).rejects.toThrow("Inconsistent empty");
    expect(await s.state()).toEqual(before);
    expect(await s.t.run((ctx) => ctx.db.query("jobs").collect())).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).toEqual([]);
  });

  it("rolls back empty completion atomically when log persistence fails", async () => {
    const s = await setup();
    await s.begin("empty-rollback");
    const before = await s.state();
    await expect(s.t.run(async (ctx) => {
      const db = new Proxy(ctx.db, { get(target, key) {
        if (key === "insert") return async () => { throw new Error("Injected empty log failure"); };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      await (processSyncResults as any)._handler({ ...ctx, db }, { connectionId: s.connectionId, attemptId: "empty-rollback", snapshotStatus: "valid_empty", reservations: [], totalEvents: 0, skipped: 0 });
    })).rejects.toThrow("Injected empty log failure");
    expect(await s.state()).toEqual(before);
  });

  it("ignores stale empty results and lost empty acknowledgements", async () => {
    const s = await setup();
    await s.begin("old");
    vi.advanceTimersByTime(10 * 60_000);
    await s.run();
    const before = await s.state();
    expect(await s.t.mutation(sync.processSyncResults, { connectionId: s.connectionId, attemptId: "old", snapshotStatus: "valid_empty", reservations: [], totalEvents: 0, skipped: 0 })).toBe("skipped");
    expect(await s.state()).toEqual(before);
    vi.advanceTimersByTime(60_000);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(calendar("")));
    expect(await s.run("ack")).toBe("skipped");
    expect(await s.state()).toMatchObject({ enabled: true, lastSyncStatus: "empty", consecutiveErrors: 0 });
    expect((await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).map(log => log.status)).toEqual(["success", "empty"]);
  });

  it("fences an invalid old response after a newer successful attempt", async () => {
    const s = await setup();
    let release!: (response: Response) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    vi.mocked(fetch).mockImplementationOnce(() => { entered(); return new Promise(resolve => { release = resolve; }); });
    const old = s.run();
    await started;
    vi.advanceTimersByTime(10 * 60_000);
    expect(await s.run()).toBe("success");
    const state = await s.state();
    const reservations = await s.t.run((ctx) => ctx.db.query("calendarReservations").collect());
    release(new Response("<html>Error</html>"));
    expect(await old).toBe("skipped");
    expect(await s.state()).toEqual(state);
    expect(await s.t.run((ctx) => ctx.db.query("calendarReservations").collect())).toEqual(reservations);
    expect(await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).toHaveLength(1);
  });

  it.each(["blank", "HTTP error", "fetch exception", "parser exception"])("contains %s responses with existing records", async (failure) => {
    const s = await setup();
    await s.run();
    const before = await s.t.run(async (ctx) => ({ jobs: await ctx.db.query("jobs").collect(), reservations: await ctx.db.query("calendarReservations").collect() }));
    vi.advanceTimersByTime(60_000);
    if (failure === "blank") vi.mocked(fetch).mockResolvedValueOnce(new Response(""));
    if (failure === "HTTP error") vi.mocked(fetch).mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    if (failure === "fetch exception") vi.mocked(fetch).mockRejectedValueOnce(new Error("Injected fetch failure"));
    if (failure === "parser exception") vi.mocked(parseICalFeed).mockImplementationOnce(() => { throw new Error("Injected parser failure"); });
    expect(await s.run()).toBe("failed");
    expect(await s.t.run(async (ctx) => ({ jobs: await ctx.db.query("jobs").collect(), reservations: await ctx.db.query("calendarReservations").collect() }))).toEqual(before);
    expect(await s.state()).toMatchObject({ lastSyncAt: NOW, lastSyncStatus: "error" });
  });

  it.each(["fetch", "parse", "processing"] as const)("records %s failure without advancing the last success", async (stage) => {
    const s = await setup();
    if (stage === "fetch") vi.mocked(fetch).mockRejectedValueOnce(new Error("Fetch unavailable"));
    if (stage === "parse") vi.mocked(parseICalFeed).mockImplementationOnce(() => { throw new Error("Invalid calendar"); });
    await s.run(stage === "processing" ? "processing" : undefined);
    expect(await s.state()).toMatchObject({ consecutiveErrors: 1, lastSyncAt: LAST_SUCCESS, lastSyncStatus: "error", enabled: true });
    expect((await s.state())?.lastSyncError).toContain(stage === "processing" ? "Processing" : stage === "parse" ? "Parse" : "Fetch");
    const records = await s.t.run(async (ctx) => ({ logs: await ctx.db.query("calendarSyncLogs").collect(), reservations: await ctx.db.query("calendarReservations").collect(), jobs: await ctx.db.query("jobs").collect() }));
    expect(records.logs).toHaveLength(1);
    expect(records.logs[0].status).toBe("error");
    expect(records.reservations).toEqual([]);
    expect(records.jobs).toEqual([]);
  });

  it("suspends after three processing failures and cron never reschedules disabled work", async () => {
    const s = await setup();
    for (let i = 0; i < 3; i++) { await s.run("processing"); vi.advanceTimersByTime(15 * 60_000); }
    expect(await s.state()).toMatchObject({ enabled: false, consecutiveErrors: 3, lastSyncAt: LAST_SUCCESS });
    await s.run();
    await s.t.mutation(sync.cronTick, {});
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
  });

  it("keeps expensive attempts bounded even when error recording itself fails", async () => {
    const s = await setup();
    for (let i = 0; i < 3; i++) {
      await expect(s.run("recording")).rejects.toThrow("Error recording unavailable");
      vi.advanceTimersByTime(15 * 60_000);
    }
    await s.t.mutation(sync.cronTick, {});
    await s.run();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await s.state()).toMatchObject({ enabled: false, consecutiveErrors: 3, lastSyncAt: LAST_SUCCESS, lastSyncStatus: "error" });
    expect(await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
  });

  it("resets failures on success, preserves same-day jobs and manual time overrides, and does not duplicate records", async () => {
    const s = await setup();
    await s.run("processing");
    vi.advanceTimersByTime(60_000);
    await s.run();
    expect(await s.state()).toMatchObject({ enabled: true, consecutiveErrors: 0, lastSyncStatus: "success", lastSyncAt: NOW + 60_000 });
    expect((await s.state())?.lastSyncError).toBeUndefined();
    await s.confirm();
    vi.advanceTimersByTime(60_000);
    await s.run();
    const records = await s.t.run(async (ctx) => ({ reservations: await ctx.db.query("calendarReservations").collect(), jobs: await ctx.db.query("jobs").collect() }));
    expect(records.reservations).toHaveLength(1);
    expect(records.jobs).toHaveLength(1);
    expect(records.jobs[0]).toMatchObject({ companyId: s.companyId, scheduledDate: "2026-10-27", type: "turnover" });
    expect(records.jobs[0].startTime).toBeUndefined();
    expect(records.reservations[0].linkedJobId).toBe(records.jobs[0]._id);
  });

  it("does not relabel a committed success when its acknowledgement is lost", async () => {
    const s = await setup();
    await s.run("ack");
    expect(await s.state()).toMatchObject({ lastSyncStatus: "success", lastSyncAt: NOW, consecutiveErrors: 0 });
    expect((await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).map(log => log.status)).toEqual(["success"]);
  });

  it("refuses external work after three interrupted attempts even before cron suspends it", async () => {
    const s = await setup();
    for (let i = 0; i < 3; i++) {
      expect(await s.begin(`interrupted-${i}`)).toBe("https://calendar.example/feed.ics");
      vi.advanceTimersByTime(15 * 60_000);
    }
    await s.run();
    expect(fetch).not.toHaveBeenCalled();
    expect(await s.state()).toMatchObject({ enabled: false, consecutiveErrors: 3, lastSyncAt: LAST_SUCCESS, lastSyncStatus: "error" });
  });

  it("does not persist or cancel anything when disabled during the fetch", async () => {
    const s = await setup();
    const existingId = await s.t.run((ctx) => ctx.db.insert("calendarReservations", { companyId: s.companyId, propertyId: s.propertyId, connectionId: s.connectionId, externalUid: "must-remain-active", checkIn: "2026-10-24", checkOut: "2026-10-25", rawHash: "old", status: "active", firstSeenAt: NOW, lastSeenAt: NOW }));
    vi.mocked(fetch).mockImplementationOnce(async () => {
      await s.t.run((ctx) => ctx.db.patch(s.connectionId, { enabled: false }));
      return new Response(feed);
    });
    expect(await s.run()).toBe("skipped");
    expect(await s.state()).toMatchObject({ enabled: false, lastSyncAt: LAST_SUCCESS });
    expect(await s.t.run((ctx) => ctx.db.query("calendarReservations").collect())).toEqual([expect.objectContaining({ _id: existingId, status: "active", lastSeenAt: NOW })]);
    expect(await s.t.run((ctx) => ctx.db.query("jobs").collect())).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).toEqual([]);
  });

  it("rolls back reservations, jobs, cancellations and success state on a late persistence failure", async () => {
    const s = await setup();
    const oldId = await s.t.run((ctx) => ctx.db.insert("calendarReservations", { companyId: s.companyId, propertyId: s.propertyId, connectionId: s.connectionId, externalUid: "keep-on-failure", checkIn: "2026-10-24", checkOut: "2026-10-25", rawHash: "old", status: "active", firstSeenAt: NOW, lastSeenAt: NOW }));
    await s.begin("persistence-failure");
    await expect(s.t.run(async (ctx) => {
      const db = new Proxy(ctx.db, { get(target, key) {
        if (key === "insert") return async (table: string, value: any) => {
          if (table === "calendarSyncLogs") throw new Error("Injected persistence failure");
          return target.insert(table as any, value);
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      await (processSyncResults as any)._handler({ ...ctx, db }, { connectionId: s.connectionId, attemptId: "persistence-failure", ...parseICalFeed(feed), snapshotStatus: "valid" });
    })).rejects.toThrow("Injected persistence failure");
    await s.t.mutation(sync.recordSyncError, { connectionId: s.connectionId, attemptId: "persistence-failure", errorMessage: "Processing error: Injected persistence failure" });
    expect(await s.state()).toMatchObject({ lastSyncAt: LAST_SUCCESS, lastSyncStatus: "error", consecutiveErrors: 1 });
    expect(await s.t.run((ctx) => ctx.db.query("jobs").collect())).toEqual([]);
    const reservations = await s.t.run((ctx) => ctx.db.query("calendarReservations").collect());
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({ _id: oldId, status: "active" });
  });

  it("allows explicit owner re-enable after suspension and preserves tenant authorization", async () => {
    const s = await setup();
    for (let i = 0; i < 3; i++) { await s.run("processing"); vi.advanceTimersByTime(60_000); }
    const session = await s.t.action(api.authActions.signIn, { email: "calendar@test.dev", password: "test-password-123" });
    await expect(s.t.mutation(api.mutations.calendarSync.triggerSync, { sessionToken: session.sessionToken, connectionId: s.connectionId })).rejects.toThrow("Connection is disabled");
    const otherId = await s.t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Other", timezone: "America/New_York" });
      return ctx.db.insert("calendarConnections", { companyId, propertyId: s.propertyId, createdBy: s.ownerId, platform: "other", icalUrl: "https://other.example", enabled: false, consecutiveErrors: 3, lastSyncStatus: "error", initialSyncCutoff: "2026-10-25", createdAt: NOW });
    });
    await expect(s.t.mutation(api.mutations.calendarConnections.setEnabled, { sessionToken: session.sessionToken, connectionId: otherId, enabled: true })).rejects.toThrow("Not your company");
    await s.t.mutation(api.mutations.calendarConnections.setEnabled, { sessionToken: session.sessionToken, connectionId: s.connectionId, enabled: true });
    expect(await s.state()).toMatchObject({ enabled: true, consecutiveErrors: 0, lastSyncAt: LAST_SUCCESS });
    await s.run();
    expect(await s.state()).toMatchObject({ lastSyncStatus: "success", consecutiveErrors: 0 });
    expect(await s.t.run((ctx) => ctx.db.get(otherId))).toMatchObject({ enabled: false, consecutiveErrors: 3 });
  });

  it.each(["disabled", "deleted"] as const)("returns skipped rather than success when the connection is %s before persistence", async (change) => {
    const s = await setup();
    await s.begin("cancelled");
    await s.t.run((ctx) => change === "deleted"
      ? ctx.db.delete(s.connectionId)
      : ctx.db.patch(s.connectionId, { enabled: false }));
    expect(await s.process("cancelled")).toBe("skipped");
    expect(await s.fail("cancelled")).toBe("skipped");
    expect(await s.run()).toBe("skipped");
    expect(fetch).not.toHaveBeenCalled();
    expect(await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.query("calendarReservations").collect())).toEqual([]);
  });

  it("rejects overlaps without charging them and fences stale callbacks after a newer attempt starts", async () => {
    const s = await setup();
    expect(await s.begin("a")).toBe("https://calendar.example/feed.ics");
    for (const id of ["b", "c", "d"]) expect(await s.begin(id)).toBeNull();
    expect(await s.state()).toMatchObject({ enabled: true, consecutiveErrors: 1, syncAttempt: { id: "a", chargedAt: NOW } });
    const pending = await s.state();
    expect(await s.fail("d")).toBe("skipped");
    expect(await s.process("b")).toBe("skipped");
    expect(await s.state()).toEqual(pending);
    expect(await s.process("a")).toBe("success");
    vi.advanceTimersByTime(60_000);
    await s.begin("new-after-success");
    const next = await s.state();
    expect(await s.fail("a")).toBe("skipped"); // Lost success acknowledgement after a new start.
    expect(await s.fail("c")).toBe("skipped");
    expect(await s.process("a", [])).toBe("skipped"); // Must not cancel the committed reservation.
    expect(await s.state()).toEqual(next);
    const reservations = await s.t.run((ctx) => ctx.db.query("calendarReservations").collect());
    expect(reservations).toHaveLength(1);
    expect(reservations[0].status).toBe("active");
    expect(await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).toHaveLength(1);
    expect(await s.process("new-after-success")).toBe("success");
    expect(await s.t.run((ctx) => ctx.db.query("jobs").collect())).toHaveLength(0);
  });

  it("skips an overlapping action before fetching and keeps the admitted success authoritative", async () => {
    const s = await setup();
    let releaseOlder!: (response: Response) => void;
    let enteredOlder!: () => void;
    const olderEntered = new Promise<void>(resolve => { enteredOlder = resolve; });
    const olderResponse = new Promise<Response>(resolve => { releaseOlder = resolve; });
    vi.mocked(fetch).mockImplementationOnce(() => { enteredOlder(); return olderResponse; });
    const older = s.run();
    await olderEntered;
    expect(await s.run()).toBe("skipped");
    expect(fetch).toHaveBeenCalledTimes(1);
    releaseOlder(new Response(feed));
    expect(await older).toBe("success");
    expect(await s.state()).toMatchObject({ lastSyncStatus: "success", consecutiveErrors: 0, enabled: true });
    expect(await s.t.run((ctx) => ctx.db.query("calendarReservations").collect())).toEqual([expect.objectContaining({ externalUid: "reservation-one", status: "active" })]);
    expect(await s.t.run((ctx) => ctx.db.query("jobs").collect())).toHaveLength(0);
    expect(await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).toHaveLength(1);
  });

  it("does not suspend the third unfinished round merely because another action or cron overlaps", async () => {
    const s = await setup();
    for (const id of ["failure-1", "failure-2"]) { await s.begin(id); await s.fail(id); vi.advanceTimersByTime(60_000); }
    await s.begin("third");
    expect(await s.begin("third-overlap")).toBeNull();
    const schedule = vi.fn();
    await s.t.run((ctx) => (cronTick as any)._handler({ ...ctx, scheduler: { runAfter: schedule } }, {}));
    expect(await s.state()).toMatchObject({ enabled: true, consecutiveErrors: 3 });
    expect(schedule).not.toHaveBeenCalled();
    expect(await s.process("third")).toBe("success");
    expect(await s.fail("third-overlap")).toBe("skipped");
    expect(await s.state()).toMatchObject({ enabled: true, consecutiveErrors: 0, lastSyncStatus: "success" });
  });

  it("ignores duplicate failure callbacks even after a new round starts", async () => {
    const s = await setup();
    await s.begin("old");
    expect(await s.fail("old")).toBe("failed");
    vi.advanceTimersByTime(60_000);
    await s.begin("current");
    const current = await s.state();
    expect(await s.fail("old")).toBe("skipped");
    expect(await s.state()).toEqual(current);
    expect(await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).toHaveLength(1);
    expect(await s.process("current")).toBe("success");
  });

  it("owner disable/re-enable invalidates old callbacks even after a recovered attempt consumes budget", async () => {
    const s = await setup();
    const session = await s.t.action(api.authActions.signIn, { email: "calendar@test.dev", password: "test-password-123" });
    await s.begin("old-epoch");
    await s.t.mutation(api.mutations.calendarConnections.setEnabled, { sessionToken: session.sessionToken, connectionId: s.connectionId, enabled: false });
    expect(await s.fail("old-epoch")).toBe("skipped");
    await s.t.mutation(api.mutations.calendarConnections.setEnabled, { sessionToken: session.sessionToken, connectionId: s.connectionId, enabled: true });
    await s.begin("recovered");
    const recovered = await s.state();
    expect(await s.fail("old-epoch")).toBe("skipped");
    expect(await s.process("old-epoch")).toBe("skipped");
    expect(await s.state()).toEqual(recovered);
    expect(await s.process("recovered")).toBe("success");
  });

  it("overlaps do not extend the unfinished-round deadline or let expired callbacks mutate current work", async () => {
    const s = await setup();
    await s.begin("first");
    vi.advanceTimersByTime(5 * 60_000);
    expect(await s.begin("overlap")).toBeNull();
    expect((await s.state())?.syncAttempt?.chargedAt).toBe(NOW);
    vi.advanceTimersByTime(5 * 60_000);
    expect(await s.process("first")).toBe("skipped");
    expect(await s.fail("first")).toBe("skipped");
    await s.begin("second-round");
    expect(await s.state()).toMatchObject({ consecutiveErrors: 2, syncAttempt: { id: "second-round", chargedAt: NOW + 10 * 60_000 } });
    const current = await s.state();
    expect(await s.fail("first")).toBe("skipped");
    expect(await s.state()).toEqual(current);
    expect(await s.process("second-round")).toBe("success");
  });

  it("an owner feed URL edit invalidates results fetched from the old URL", async () => {
    const s = await setup();
    const session = await s.t.action(api.authActions.signIn, { email: "calendar@test.dev", password: "test-password-123" });
    await s.begin("old-feed");
    await s.t.mutation(api.mutations.calendarConnections.update, { sessionToken: session.sessionToken, connectionId: s.connectionId, icalUrl: "https://calendar.example/repaired.ics" });
    expect(await s.process("old-feed")).toBe("skipped");
    expect(await s.fail("old-feed")).toBe("skipped");
    expect(await s.begin("new-feed")).toBe("https://calendar.example/repaired.ics");
    expect(await s.process("new-feed")).toBe("success");
  });
});
