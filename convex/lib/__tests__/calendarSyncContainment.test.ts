import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { syncConnection } from "../../actions/calendarSync";
import { processSyncResults } from "../../mutations/calendarSync";
import { parseICalFeed } from "../../actions/icalParser";
import { hashPassword } from "../password";

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
    for (let i = 0; i < 3; i++) await expect(s.run("recording")).rejects.toThrow("Error recording unavailable");
    await s.t.mutation(sync.cronTick, {});
    await s.run();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await s.state()).toMatchObject({ enabled: false, consecutiveErrors: 3, lastSyncAt: LAST_SUCCESS, lastSyncStatus: "error" });
    expect(await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
  });

  it("resets failures on success, preserves same-day jobs and manual time overrides, and does not duplicate records", async () => {
    const s = await setup();
    await s.run("processing");
    await s.run();
    expect(await s.state()).toMatchObject({ enabled: true, consecutiveErrors: 0, lastSyncStatus: "success", lastSyncAt: NOW });
    expect((await s.state())?.lastSyncError).toBeUndefined();
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
    for (let i = 0; i < 3; i++) expect(await s.t.mutation(sync.beginSyncAttempt, { connectionId: s.connectionId })).toBe(true);
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
    await s.run();
    expect(await s.state()).toMatchObject({ enabled: false, lastSyncAt: LAST_SUCCESS });
    expect(await s.t.run((ctx) => ctx.db.query("calendarReservations").collect())).toEqual([expect.objectContaining({ _id: existingId, status: "active", lastSeenAt: NOW })]);
    expect(await s.t.run((ctx) => ctx.db.query("jobs").collect())).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.query("calendarSyncLogs").collect())).toEqual([]);
  });

  it("rolls back reservations, jobs, cancellations and success state on a late persistence failure", async () => {
    const s = await setup();
    const oldId = await s.t.run((ctx) => ctx.db.insert("calendarReservations", { companyId: s.companyId, propertyId: s.propertyId, connectionId: s.connectionId, externalUid: "keep-on-failure", checkIn: "2026-10-24", checkOut: "2026-10-25", rawHash: "old", status: "active", firstSeenAt: NOW, lastSeenAt: NOW }));
    await s.t.mutation(sync.beginSyncAttempt, { connectionId: s.connectionId });
    await expect(s.t.run(async (ctx) => {
      const db = new Proxy(ctx.db, { get(target, key) {
        if (key === "insert") return async (table: string, value: any) => {
          if (table === "calendarSyncLogs") throw new Error("Injected persistence failure");
          return target.insert(table as any, value);
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      await (processSyncResults as any)._handler({ ...ctx, db }, { connectionId: s.connectionId, ...parseICalFeed(feed) });
    })).rejects.toThrow("Injected persistence failure");
    await s.t.mutation(sync.recordSyncError, { connectionId: s.connectionId, errorMessage: "Processing error: Injected persistence failure" });
    expect(await s.state()).toMatchObject({ lastSyncAt: LAST_SUCCESS, lastSyncStatus: "error", consecutiveErrors: 1 });
    expect(await s.t.run((ctx) => ctx.db.query("jobs").collect())).toEqual([]);
    const reservations = await s.t.run((ctx) => ctx.db.query("calendarReservations").collect());
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({ _id: oldId, status: "active" });
  });

  it("allows explicit owner re-enable after suspension and preserves tenant authorization", async () => {
    const s = await setup();
    for (let i = 0; i < 3; i++) await s.run("processing");
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
});
