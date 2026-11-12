import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";
import { CalendarFeedError, FEED_ERRORS, type FeedErrorCode } from "../calendarFeedSecurity";
import { parseICalFeed } from "../../actions/icalParser";
import { calendar, reservationEvent, confirmGuestForTest } from "./calendarSnapshotFixtures";

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../actions/calendarFeedFetch", () => ({ fetchCalendarFeed: transport.fetch }));
const modules = import.meta.glob("../../**/*.ts");
const sync = internal.mutations.calendarSync;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const SECRET = "https://calendar.example.com/private-secret?token=private-query";
let passwordHash: Promise<string> | undefined;
async function setup() {
  const t = convexTest(schema, modules);
  const hash = await (passwordHash ??= hashPassword("calendar-security-password"));
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Feed security", timezone: "UTC" });
    const foreignId = await ctx.db.insert("companies", { name: "Other", timezone: "UTC" });
    const users: Record<string, any> = {};
    for (const role of ["owner", "manager", "cleaner", "maintenance", "foreign"] as const) {
      users[role] = await ctx.db.insert("users", { companyId: role === "foreign" ? foreignId : companyId, name: role, email: `${role}@security.test`, passwordHash: hash, role: role === "foreign" ? "owner" : role, status: "active" });
    }
    const propertyId = await ctx.db.insert("properties", { companyId, name: "Rental", address: "1 Test", type: "residential", amenities: [], active: true });
    const connectionId = await ctx.db.insert("calendarConnections", { companyId, propertyId, createdBy: users.owner, platform: "other", icalUrl: SECRET, enabled: true, lastSyncStatus: "pending", consecutiveErrors: 0, initialSyncCutoff: "2026-10-25", createdAt: NOW });
    await ctx.db.insert("jobAutomationRules", { companyId, propertyId, enabled: true, jobType: "turnover", defaultDurationMinutes: 60 });
    return { companyId, foreignId, users, propertyId, connectionId };
  });
  const login = async (role = "owner") => (await t.action(api.authActions.signIn, { email: `${role}@security.test`, password: "calendar-security-password" })).sessionToken;
  const connection = () => t.run(ctx => ctx.db.get(ids.connectionId));
  const run = () => t.action(internal.actions.calendarSync.syncConnection, { connectionId: ids.connectionId });
  const protectedState = () => t.run(async ctx => ({
    reservations: await ctx.db.query("calendarReservations").collect(), jobs: await ctx.db.query("jobs").collect(),
    payments: await ctx.db.query("cleanerPayments").collect(), paymentJobs: await ctx.db.query("cleanerPaymentJobs").collect(),
    audit: await ctx.db.query("auditLog").collect(), notifications: await ctx.db.query("notifications").collect(),
  }));
  const process = async (content: string, attemptId: string) => {
    await t.mutation(sync.beginSyncAttempt, { connectionId: ids.connectionId, attemptId });
    const parsed = parseICalFeed(content);
    return t.mutation(sync.processSyncResults, { connectionId: ids.connectionId, attemptId, snapshotStatus: "valid", reservations: parsed.reservations, totalEvents: parsed.totalEvents, skipped: parsed.skipped });
  };
  const seedProtected = async () => {
    await process(calendar(reservationEvent()), "seed");
    const res = (await protectedState()).reservations[0];
    await confirmGuestForTest(t, res._id, await login());
    vi.advanceTimersByTime(60_000);
    await process(calendar(reservationEvent("second-stay")), "missing");
    const job = (await protectedState()).jobs[0];
    await t.run(async ctx => {
      const paymentId = await ctx.db.insert("cleanerPayments", { companyId: ids.companyId, jobId: job._id, cleanerUserId: ids.users.cleaner, amountCents: 15000, status: "PAID", createdAt: NOW });
      await ctx.db.insert("cleanerPaymentJobs", { cleanerPaymentId: paymentId, jobId: job._id, amountCents: 15000 });
      await ctx.db.patch(job._id, { cleanerIds: [ids.users.cleaner], notes: "Human edit", cleanerPaymentId: paymentId });
    });
    vi.advanceTimersByTime(60_000);
  };
  return { t, ...ids, login, connection, run, protectedState, seedProtected };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv("APP_URL", "https://scrub.example"); vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
  transport.fetch.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("feed security transactional containment", () => {
  it("uses the internal reservation ID in audit details rather than a URL-bearing provider UID", async () => {
    const s = await setup();
    const raw = calendar(reservationEvent()).replace("UID:reservation-one", `UID:${SECRET}`);
    transport.fetch.mockResolvedValueOnce(raw); expect(await s.run()).toBe("success");
    const reservation = (await s.protectedState()).reservations[0];
    await confirmGuestForTest(s.t, reservation._id, await s.login());
    const audits = (await s.protectedState()).audit;
    expect(audits.some(a => a.action === "calendar_sync_create_job")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain("private-secret");
  });
  it.each(Object.keys(FEED_ERRORS) as FeedErrorCode[])("contains %s without changing reservations, missing/classification decisions, jobs or finances", async code => {
    const s = await setup(); await s.seedProtected();
    const before = await s.protectedState(); const last = await s.connection();
    expect(before.reservations.some(r => r.missing)).toBe(true);
    expect(before.reservations.some(r => r.classification?.source === "owner")).toBe(true);
    transport.fetch.mockRejectedValueOnce(new CalendarFeedError(code));
    expect(await s.run()).toBe("failed");
    expect(await s.protectedState()).toEqual(before);
    expect(await s.connection()).toMatchObject({ lastSyncAt: last!.lastSyncAt, lastCheckedAt: last!.lastCheckedAt, lastSyncStatus: "error", consecutiveErrors: 1, enabled: true });
    expect(JSON.stringify(await s.t.run(ctx => ctx.db.query("calendarSyncLogs").collect()))).not.toContain("private-secret");
  });
  it("sanitizes raw injected exceptions in console, connection and logs, including legacy callbacks", async () => {
    const s = await setup(); transport.fetch.mockRejectedValueOnce(new Error(`${SECRET}\nprivate-body stack`));
    await s.run();
    const output = JSON.stringify([await s.connection(), await s.t.run(ctx => ctx.db.query("calendarSyncLogs").collect()), vi.mocked(console.error).mock.calls]);
    // The credential remains only in backend storage, never error fields/logs.
    expect((await s.connection())!.icalUrl).toBe(SECRET);
    expect((await s.connection())!.lastSyncError).not.toContain("private-");
    expect(output.split(SECRET)).toHaveLength(2);
    vi.advanceTimersByTime(60_000); await s.t.mutation(sync.beginSyncAttempt, { connectionId: s.connectionId, attemptId: "legacy" });
    await s.t.mutation(sync.recordSyncError, { connectionId: s.connectionId, attemptId: "legacy", errorMessage: SECRET });
    expect((await s.connection())!.lastSyncError).toBe(FEED_ERRORS.unavailable);
  });
  it("retains cooldown, suspension after three failures, and explicit re-enable recovery", async () => {
    const s = await setup(); transport.fetch.mockRejectedValue(new CalendarFeedError("unsafe_destination"));
    for (let i = 0; i < 3; i++) {
      expect(await s.run()).toBe("failed"); expect(await s.run()).toBe("skipped"); vi.advanceTimersByTime(60_000);
    }
    expect(await s.connection()).toMatchObject({ enabled: false, consecutiveErrors: 3 });
    expect(await s.run()).toBe("skipped");
    await s.t.mutation(api.mutations.calendarConnections.setEnabled, { sessionToken: await s.login(), connectionId: s.connectionId, enabled: true });
    transport.fetch.mockResolvedValueOnce(calendar(""));
    expect(await s.run()).toBe("empty");
    expect(await s.connection()).toMatchObject({ enabled: true, consecutiveErrors: 0, lastSyncStatus: "empty" });
    expect((await s.connection())!.lastSyncAt).toBeUndefined();
  });
});

describe("credential-free queries and safe URL replacement", () => {
  it.each(["owner", "manager", "cleaner", "maintenance"])("never exposes the URL or legacy errors to %s", async role => {
    const s = await setup(); await s.t.run(ctx => ctx.db.patch(s.connectionId, { lastSyncError: `${SECRET} body-secret` }));
    const rows = await s.t.query(api.queries.calendarConnections.listByProperty, { sessionToken: await s.login(role), userId: s.users[role], companyId: s.companyId, propertyId: s.propertyId });
    expect(rows).toHaveLength(1); expect(rows[0]).not.toHaveProperty("icalUrl");
    expect(rows[0]).not.toHaveProperty("syncAttempt"); expect(rows[0].hasFeedUrl).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("private-"); expect(JSON.stringify(rows)).not.toContain("body-secret");
  });
  it("rejects cross-company queries, spoofed identities and non-owner changes", async () => {
    const s = await setup(); const token = await s.login("foreign");
    await expect(s.t.query(api.queries.calendarConnections.listByProperty, { sessionToken: token, userId: s.users.foreign, companyId: s.companyId, propertyId: s.propertyId })).rejects.toThrow();
    await expect(s.t.query(api.queries.calendarConnections.listByProperty, { sessionToken: token, userId: s.users.owner, companyId: s.companyId, propertyId: s.propertyId })).rejects.toThrow();
    for (const role of ["foreign", "manager", "cleaner", "maintenance"]) await expect(s.t.mutation(api.mutations.calendarConnections.update, { sessionToken: await s.login(role), connectionId: s.connectionId, icalUrl: "https://example.com/replacement" })).rejects.toThrow();
    expect((await s.connection())!.icalUrl).toBe(SECRET);
  });
  it("validates create server-side without inserting unsafe input", async () => {
    const s = await setup(); const sessionToken = await s.login();
    const args = { sessionToken, companyId: s.companyId, propertyId: s.propertyId, platform: "other" as const };
    await expect(s.t.mutation(api.mutations.calendarConnections.create, { ...args, icalUrl: "http://127.0.0.1/private" })).rejects.toThrow("Invalid feed URL");
    expect(await s.t.run(ctx => ctx.db.query("calendarConnections").collect())).toHaveLength(1);
    await s.t.mutation(api.mutations.calendarConnections.create, { ...args, icalUrl: SECRET });
    expect(await s.t.run(ctx => ctx.db.query("calendarConnections").collect())).toHaveLength(2);
  });
  it("preserves metadata editing and fences in-flight results/errors on replacement", async () => {
    const s = await setup(); await s.seedProtected(); const sessionToken = await s.login();
    const before = await s.protectedState();
    await s.t.mutation(sync.beginSyncAttempt, { connectionId: s.connectionId, attemptId: "old" });
    const charged = await s.connection();
    await expect(s.t.mutation(api.mutations.calendarConnections.update, { sessionToken, connectionId: s.connectionId, icalUrl: "https://169.254.169.254/metadata" })).rejects.toThrow("Unsafe destination");
    expect(await s.connection()).toEqual(charged);
    await s.t.mutation(api.mutations.calendarConnections.update, { sessionToken, connectionId: s.connectionId, label: "Renamed", platform: "vrbo" });
    expect(await s.connection()).toMatchObject({ icalUrl: SECRET, syncAttempt: { id: "old" } });
    const replacement = "https://other.example.com/feed?z=signed%2Fvalue&a=second";
    await s.t.mutation(api.mutations.calendarConnections.update, { sessionToken, connectionId: s.connectionId, icalUrl: replacement });
    expect(await s.connection()).toMatchObject({ icalUrl: replacement, feedRevision: 1, consecutiveErrors: 0 });
    expect((await s.connection())!.syncAttempt).toBeUndefined();
    expect(await s.t.mutation(sync.recordSyncError, { connectionId: s.connectionId, attemptId: "old", errorMessage: SECRET })).toBe("skipped");
    expect(await s.t.mutation(sync.processSyncResults, { connectionId: s.connectionId, attemptId: "old", snapshotStatus: "valid", reservations: [], totalEvents: 1, skipped: 0 })).toBe("skipped");
    const after = await s.protectedState(); expect(after.reservations).toEqual(before.reservations); expect(after.jobs).toEqual(before.jobs); expect(after.payments).toEqual(before.payments);
    transport.fetch.mockResolvedValueOnce(calendar("")); expect(await s.run()).toBe("empty"); expect(transport.fetch).toHaveBeenCalledWith(replacement);
  });
});
