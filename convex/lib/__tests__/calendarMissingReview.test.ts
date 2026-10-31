import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { parseICalFeed } from "../../actions/icalParser";
import { hashPassword } from "../password";
import { calendar, cancelledEvent, reservationEvent } from "./calendarSnapshotFixtures";

const modules = import.meta.glob("../../**/*.ts");
const sync = internal.mutations.calendarSync;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const a = reservationEvent("stay-a");
const b = reservationEvent("stay-b").replace("20261027", "20261028");
const full = calendar(`${a}\r\n${b}`);
const onlyB = calendar(b);

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword("calendar-test-password");
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Missing Review", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other", timezone: "UTC" });
    const ownerId = await ctx.db.insert("users", { companyId, email: "owner@missing.test", passwordHash, name: "Owner", role: "owner", status: "active" });
    const managerId = await ctx.db.insert("users", { companyId, email: "manager@missing.test", passwordHash, name: "Manager", role: "manager", status: "active" });
    const cleanerId = await ctx.db.insert("users", { companyId, email: "cleaner@missing.test", passwordHash, name: "Cleaner", role: "cleaner", status: "active" });
    const otherOwnerId = await ctx.db.insert("users", { companyId: otherCompanyId, email: "other@missing.test", passwordHash, name: "Other Owner", role: "owner", status: "active" });
    const propertyId = await ctx.db.insert("properties", { companyId, name: "Rental", address: "1 Test", type: "residential", amenities: [], active: true });
    const secondPropertyId = await ctx.db.insert("properties", { companyId, name: "Other Rental", address: "2 Test", type: "residential", amenities: [], active: true });
    const foreignPropertyId = await ctx.db.insert("properties", { companyId: otherCompanyId, name: "Foreign Rental", address: "3 Test", type: "residential", amenities: [], active: true });
    const connectionId = await ctx.db.insert("calendarConnections", { companyId, propertyId, createdBy: ownerId, platform: "other", label: "Primary", icalUrl: "https://synthetic.test/private.ics", enabled: true, lastSyncStatus: "pending", initialSyncCutoff: "2026-10-25", consecutiveErrors: 0, createdAt: NOW });
    const original = (await ctx.db.get(connectionId))!;
    const { _id: _id, _creationTime: _time, ...fields } = original;
    const secondConnectionId = await ctx.db.insert("calendarConnections", { ...fields, label: "Second feed" });
    const thirdConnectionId = await ctx.db.insert("calendarConnections", { ...fields, propertyId: secondPropertyId });
    const foreignConnectionId = await ctx.db.insert("calendarConnections", { ...fields, companyId: otherCompanyId, propertyId: foreignPropertyId, createdBy: otherOwnerId });
    await ctx.db.insert("jobAutomationRules", { companyId, propertyId, enabled: true, jobType: "turnover", defaultDurationMinutes: 180 });
    return { companyId, otherCompanyId, ownerId, managerId, cleanerId, otherOwnerId, propertyId, connectionId, secondConnectionId, thirdConnectionId, foreignConnectionId };
  });
  const state = () => t.run((ctx) => ctx.db.get(ids.connectionId));
  const reservation = (uid = "stay-a", connectionId = ids.connectionId) => t.run((ctx) => ctx.db.query("calendarReservations").withIndex("by_connectionId_externalUid", q => q.eq("connectionId", connectionId).eq("externalUid", uid)).first());
  const run = async (content: string, connectionId = ids.connectionId) => {
    vi.advanceTimersByTime(60_000);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(content));
    return t.action(internal.actions.calendarSync.syncConnection, { connectionId });
  };
  const login = async (email = "owner@missing.test") => (await t.action(api.authActions.signIn, { email, password: "calendar-test-password" })).sessionToken;
  const audit = () => t.run((ctx) => ctx.db.query("auditLog").collect());
  const protectedRecords = () => t.run(async (ctx) => ({ jobs: await ctx.db.query("jobs").collect(), payments: await ctx.db.query("cleanerPayments").collect(), paymentJobs: await ctx.db.query("cleanerPaymentJobs").collect() }));
  const protectJob = async (status: "scheduled" | "in_progress" | "submitted" | "approved" = "approved") => {
    const res = (await reservation())!;
    await t.run(async (ctx) => {
      const paymentId = await ctx.db.insert("cleanerPayments", { companyId: ids.companyId, jobId: res.linkedJobId!, cleanerUserId: ids.cleanerId, amountCents: 15000, status: "PAID", createdAt: NOW, paidAt: NOW, paidByUserId: ids.ownerId });
      await ctx.db.insert("cleanerPaymentJobs", { cleanerPaymentId: paymentId, jobId: res.linkedJobId!, amountCents: 15000 });
      await ctx.db.patch(res.linkedJobId!, { status, notes: "Human decision", startTime: "09:15", cleanerIds: [ids.cleanerId], plannedCleanerPayCents: 15000, cleanerPaymentId: paymentId,
        executionHistory: [{ sequence: 1, provenance: "submission_confirmed", confirmedById: ids.ownerId, confirmedAt: NOW, scheduledDate: res.checkOut, workers: [{ userId: ids.cleanerId, displayName: "Cleaner", role: "cleaner" }] }], submittedExecutionSequence: 1,
        ...(status === "approved" ? { approvedExecutionSequence: 1, approvedAt: NOW } : {}),
      });
    });
  };
  return { t, ...ids, state, reservation, run, login, audit, protectedRecords, protectJob };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv("APP_URL", "https://scrub.example"); vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unmocked external request"); }));
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("missing reservation review lifecycle", () => {
  it("imports present reservations normally without missing alerts", async () => {
    const s = await setup();
    expect(await s.run(full)).toBe("success");
    expect(await s.reservation()).toMatchObject({ status: "active" });
    expect((await s.reservation())?.missing).toBeUndefined();
    expect((await s.audit()).filter(row => row.action.startsWith("calendar_reservation_"))).toEqual([]);
    expect((await s.protectedRecords()).jobs).toHaveLength(2);
  });

  it.each(["scheduled", "in_progress", "submitted", "approved"] as const)("flags disappearance without altering a linked %s job or finances", async (status) => {
    const s = await setup();
    await s.run(full); await s.protectJob(status);
    const original = (await s.reservation())!;
    const before = await s.protectedRecords();
    expect(await s.run(onlyB)).toBe("success");
    const missing = (await s.reservation())!;
    expect(missing).toMatchObject({ status: "active", lastSeenAt: original.lastSeenAt, linkedJobId: original.linkedJobId,
      missing: { observations: 1, firstMissingAt: Date.now(), lastMissingAt: Date.now() } });
    expect(missing.cancelledAt).toBeUndefined(); expect(missing.cancellationFlagged).toBeUndefined();
    expect(await s.protectedRecords()).toEqual(before);
    expect(await s.state()).toMatchObject({ enabled: true, consecutiveErrors: 0, lastSyncStatus: "success" });
  });

  it("counts repeated nonempty absences without repeated alerts or automatic cancellation", async () => {
    const s = await setup(); await s.run(full);
    const notifications = await s.t.run(ctx => ctx.db.query("notifications").collect());
    await s.run(onlyB);
    const first = (await s.reservation())!.missing!;
    for (let i = 2; i <= 4; i++) {
      await s.run(onlyB);
      expect((await s.reservation())!.missing).toMatchObject({ episodeId: first.episodeId, firstMissingAt: first.firstMissingAt, observations: i, lastMissingAt: Date.now() });
    }
    expect((await s.reservation())!.status).toBe("active");
    expect((await s.audit()).filter(row => row.action === "calendar_reservation_missing")).toHaveLength(1);
    expect(await s.t.run(ctx => ctx.db.query("notifications").collect())).toEqual(notifications);
    expect(await s.state()).toMatchObject({ enabled: true, consecutiveErrors: 0 });
  });

  it("cannot count the same committed attempt twice", async () => {
    const s = await setup(); await s.run(full); vi.advanceTimersByTime(60_000);
    await s.t.mutation(sync.beginSyncAttempt, { connectionId: s.connectionId, attemptId: "once" });
    const parsed = parseICalFeed(onlyB);
    const args = { connectionId: s.connectionId, attemptId: "once", snapshotStatus: "valid" as const, reservations: parsed.reservations, totalEvents: 1, skipped: 0 };
    expect(await s.t.mutation(sync.processSyncResults, args)).toBe("success");
    const before = await s.reservation();
    expect(await s.t.mutation(sync.processSyncResults, args)).toBe("skipped");
    expect(await s.reservation()).toEqual(before);
  });

  it("records explicit evidence only for the matching connection/UID and preserves jobs", async () => {
    const s = await setup(); await s.run(full); await s.run(full, s.secondConnectionId);
    await s.protectJob(); const before = await s.protectedRecords();
    await s.run(calendar(`${b}\r\n${cancelledEvent("stay-a")}`));
    expect(await s.reservation()).toMatchObject({ status: "cancelled", cancellationFlagged: true, cancellationEvidence: { source: "ical_status_cancelled", observedAt: Date.now() } });
    expect(await s.reservation("stay-b")).toMatchObject({ status: "active" });
    expect(await s.reservation("stay-a", s.secondConnectionId)).toMatchObject({ status: "active" });
    expect(await s.protectedRecords()).toEqual(before);
    const evidence = (await s.reservation())!.cancellationEvidence;
    await s.run(calendar(`${b}\r\n${cancelledEvent("stay-a")}`));
    expect((await s.reservation())!.cancellationEvidence).toEqual(evidence);
    expect((await s.audit()).filter(row => row.action === "calendar_reservation_explicitly_cancelled")).toHaveLength(1);
  });

  it("closes missing state on explicit cancellation without modifying the job", async () => {
    const s = await setup(); await s.run(full); await s.run(onlyB);
    const episode = (await s.reservation())!.missing!;
    const jobs = await s.protectedRecords();
    await s.run(calendar(cancelledEvent("stay-a")));
    expect((await s.reservation())!.missing).toBeUndefined();
    expect((await s.reservation())!.status).toBe("cancelled");
    expect(await s.protectedRecords()).toEqual(jobs);
    const record = (await s.audit()).find(row => row.action === "calendar_reservation_explicitly_cancelled")!;
    expect(JSON.parse(record.details!).missingEpisode.episodeId).toBe(episode.episodeId);
    expect((await s.reservation("stay-b"))!.status).toBe("active");
  });

  it("resolves reappearance without duplicate jobs and starts a distinct subsequent episode", async () => {
    const s = await setup(); await s.run(full); await s.run(onlyB);
    const first = (await s.reservation())!.missing!;
    const jobs = await s.protectedRecords();
    await s.run(full);
    expect((await s.reservation())!.missing).toBeUndefined();
    expect((await s.reservation())!.status).toBe("active");
    expect(await s.protectedRecords()).toEqual(jobs);
    const resolved = (await s.audit()).find(row => row.action === "calendar_reservation_missing_resolved")!;
    expect(JSON.parse(resolved.details!)).toMatchObject({ episodeId: first.episodeId, resolution: "reappeared" });
    await s.run(onlyB);
    expect((await s.reservation())!.missing!.episodeId).not.toBe(first.episodeId);
    expect((await s.reservation())!.missing!.observations).toBe(1);
  });

  it.each([
    ["invalid", "<html>Error</html>", "failed"],
    ["degraded", calendar(b.replace("20261028", "invalid")), "failed"],
    ["empty", calendar(""), "empty"],
  ])("does not advance missing state for an %s snapshot", async (_label, feed, result) => {
    const s = await setup(); await s.run(full); await s.run(onlyB);
    const before = await s.reservation(); const jobs = await s.protectedRecords(); const audit = await s.audit();
    expect(await s.run(feed)).toBe(result);
    expect(await s.reservation()).toEqual(before); expect(await s.protectedRecords()).toEqual(jobs); expect(await s.audit()).toEqual(audit);
  });

  it("fences stale callbacks before missing, cancellation or audit writes", async () => {
    const s = await setup(); await s.run(full); await s.run(onlyB); vi.advanceTimersByTime(60_000);
    await s.t.mutation(sync.beginSyncAttempt, { connectionId: s.connectionId, attemptId: "old" });
    vi.advanceTimersByTime(10 * 60_000); await s.run(onlyB);
    const before = await s.reservation(); const audit = await s.audit();
    expect(await s.t.mutation(sync.processSyncResults, { connectionId: s.connectionId, attemptId: "old", snapshotStatus: "valid", reservations: [], cancelledUids: ["stay-a"], totalEvents: 1, skipped: 0 })).toBe("skipped");
    for (const content of [full, onlyB]) {
      const parsed = parseICalFeed(content);
      expect(await s.t.mutation(sync.processSyncResults, { connectionId: s.connectionId, attemptId: "old", snapshotStatus: "valid", reservations: parsed.reservations, totalEvents: parsed.totalEvents, skipped: 0 })).toBe("skipped");
    }
    expect(await s.reservation()).toEqual(before); expect(await s.audit()).toEqual(audit);
  });

  it("does not reinterpret or repair historical cancelled reservations on omission", async () => {
    const s = await setup(); await s.run(full);
    const original = (await s.reservation())!;
    await s.t.run(ctx => ctx.db.patch(original._id, { status: "cancelled", cancelledAt: NOW - 60_000 }));
    const legacy = await s.reservation();
    await s.run(onlyB);
    expect(await s.reservation()).toEqual(legacy);
    await s.run(calendar(`${b}\r\n${cancelledEvent("stay-a")}`));
    expect(await s.reservation()).toMatchObject({ status: "cancelled", cancelledAt: NOW - 60_000,
      cancellationEvidence: { source: "ical_status_cancelled", observedAt: Date.now() } });
  });

  it("isolates missing observations by connection, property and company", async () => {
    const s = await setup();
    for (const connection of [s.connectionId, s.secondConnectionId, s.thirdConnectionId, s.foreignConnectionId]) await s.run(full, connection);
    const unaffected = await Promise.all([s.secondConnectionId, s.thirdConnectionId, s.foreignConnectionId].map(id => s.reservation("stay-a", id)));
    await s.run(onlyB);
    expect((await s.reservation())!.missing!.observations).toBe(1);
    expect(await Promise.all([s.secondConnectionId, s.thirdConnectionId, s.foreignConnectionId].map(id => s.reservation("stay-a", id)))).toEqual(unaffected);
  });

  it("acknowledges once without resolving absence or touching jobs/payment history", async () => {
    const s = await setup(); await s.run(full); await s.protectJob(); await s.run(onlyB);
    const reservation = (await s.reservation())!; const records = await s.protectedRecords();
    const sessionToken = await s.login();
    const args = { sessionToken, reservationId: reservation._id, episodeId: reservation.missing!.episodeId };
    expect(await s.t.mutation(sync.acknowledgeMissingReservation, args)).toBe("acknowledged");
    expect(await s.t.mutation(sync.acknowledgeMissingReservation, args)).toBe("already_acknowledged");
    expect((await s.reservation())!.missing).toMatchObject({ acknowledgedBy: s.ownerId, acknowledgedAt: Date.now(), observations: 1 });
    await s.run(onlyB);
    expect((await s.reservation())!.missing).toMatchObject({ acknowledgedBy: s.ownerId, observations: 2 });
    expect(await s.protectedRecords()).toEqual(records);
    expect((await s.audit()).filter(row => row.action === "acknowledge_calendar_reservation_missing")).toHaveLength(1);
    await s.run(full);
    const resolved = (await s.audit()).find(row => row.action === "calendar_reservation_missing_resolved")!;
    expect(JSON.parse(resolved.details!).acknowledgedBy).toBe(s.ownerId);
  });

  it.each(["manager@missing.test", "cleaner@missing.test", "other@missing.test", "invalid"])("rejects unauthorized acknowledgement by %s", async (email) => {
    const s = await setup(); await s.run(full); await s.run(onlyB);
    const res = (await s.reservation())!; const before = await s.audit();
    const sessionToken = email === "invalid" ? "invalid" : await s.login(email);
    await expect(s.t.mutation(sync.acknowledgeMissingReservation, { sessionToken, reservationId: res._id, episodeId: res.missing!.episodeId })).rejects.toThrow();
    expect(await s.reservation()).toEqual(res); expect(await s.audit()).toEqual(before);
  });

  it("rejects spoofed owner identity and stale episode acknowledgement", async () => {
    const s = await setup(); await s.run(full); await s.run(onlyB);
    const res = (await s.reservation())!; const sessionToken = await s.login();
    await expect(s.t.mutation(sync.acknowledgeMissingReservation, { sessionToken, userId: s.otherOwnerId, reservationId: res._id, episodeId: res.missing!.episodeId })).rejects.toThrow();
    await s.run(full); await s.run(onlyB);
    await expect(s.t.mutation(sync.acknowledgeMissingReservation, { sessionToken, reservationId: res._id, episodeId: res.missing!.episodeId })).rejects.toThrow("episode has changed");
    expect((await s.reservation())!.missing!.acknowledgedAt).toBeUndefined();
  });
});
