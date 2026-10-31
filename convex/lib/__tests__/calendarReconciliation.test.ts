import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { parseICalFeed } from "../../actions/icalParser";
import { hashPassword } from "../password";
import { calendar, cancelledEvent } from "./calendarSnapshotFixtures";
const modules = import.meta.glob("../../**/*.ts");
const sync = internal.mutations.calendarSync;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const event = (uid = "stay-a", checkIn = "20261110", checkOut = "20261112", summary = "Reserved") => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;VALUE=DATE:${checkIn}\r\nDTEND;VALUE=DATE:${checkOut}\r\nSUMMARY:${summary}\r\nEND:VEVENT`;
let cachedHash: Promise<string> | undefined;

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await (cachedHash ??= hashPassword("reconciliation-test-password"));
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Reconciliation", timezone: "UTC" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Other", timezone: "UTC" });
    const users: Record<string, any> = {};
    for (const role of ["owner", "second", "manager", "cleaner", "foreign"] as const) users[role] = await ctx.db.insert("users", { name: role, email: `${role}@reconcile.test`, passwordHash, companyId: role === "foreign" ? foreignCompany : companyId, role: role === "second" || role === "foreign" ? "owner" : role, status: "active" });
    const propertyId = await ctx.db.insert("properties", { companyId, name: "Rental", address: "1 Test", type: "residential", active: true, amenities: [] });
    const otherProperty = await ctx.db.insert("properties", { companyId, name: "Second", address: "2 Test", type: "residential", active: true, amenities: [] });
    const foreignProperty = await ctx.db.insert("properties", { companyId: foreignCompany, name: "Foreign", address: "3 Test", type: "residential", active: true, amenities: [] });
    const create = (propertyId: any, companyId: any, createdBy: any) => ctx.db.insert("calendarConnections", { companyId, propertyId, createdBy, platform: "other", icalUrl: "https://synthetic.test/feed", enabled: true, lastSyncStatus: "pending", consecutiveErrors: 0, initialSyncCutoff: "2026-10-25", createdAt: NOW });
    const connectionId = await create(propertyId, companyId, users.owner);
    const secondConnection = await create(propertyId, companyId, users.owner);
    const otherConnection = await create(otherProperty, companyId, users.owner);
    const foreignConnection = await create(foreignProperty, foreignCompany, users.foreign);
    await ctx.db.insert("jobAutomationRules", { companyId, propertyId, enabled: true, jobType: "turnover", defaultDurationMinutes: 180 });
    return { companyId, foreignCompany, propertyId, otherProperty, foreignProperty, users, connectionId, secondConnection, otherConnection, foreignConnection };
  });
  let round = 0;
  const login = async (role = "owner") => (await t.action(api.authActions.signIn, { email: `${role}@reconcile.test`, password: "reconciliation-test-password" })).sessionToken;
  const row = (uid = "stay-a", connectionId = ids.connectionId) => t.run(ctx => ctx.db.query("calendarReservations").withIndex("by_connectionId_externalUid", q => q.eq("connectionId", connectionId).eq("externalUid", uid)).unique());
  const run = async (content = calendar(event()), connectionId = ids.connectionId) => {
    vi.advanceTimersByTime(60_000); const attemptId = `round-${++round}`;
    await t.mutation(sync.beginSyncAttempt, { connectionId, attemptId });
    const result = parseICalFeed(content);
    return t.mutation(sync.processSyncResults, { connectionId, attemptId, snapshotStatus: result.status, reservations: result.reservations, cancelledUids: result.cancelledUids, totalEvents: result.totalEvents, skipped: result.skipped });
  };
  const authArgs = async (uid = "stay-a", connectionId = ids.connectionId, role = "owner") => {
    const reservation = (await row(uid, connectionId))!;
    const connection = (await t.run(ctx => ctx.db.get(connectionId)))!;
    return { sessionToken: await login(role), reservationId: reservation._id, expectedEventVersion: reservation.eventVersion!, expectedFeedRevision: connection.feedRevision ?? 0 };
  };
  const identityArgs = async (uid: string, decision: "distinct" | "duplicate", duplicateOf?: any, connectionId = ids.connectionId, role = "owner") => ({ ...await authArgs(uid, connectionId, role), expectedRevision: (await row(uid, connectionId))!.identityReview!.revision, decision, ...(duplicateOf ? { duplicateOf } : {}) });
  const classify = async (uid = "stay-a", kind: "guest_reservation" | "non_guest_block" = "guest_reservation", connectionId = ids.connectionId) => {
    const r = (await row(uid, connectionId))!;
    return t.mutation(api.mutations.calendarSync.confirmEventClassification, { ...await authArgs(uid, connectionId), kind, expectedRevision: r.classification?.revision ?? 0, expectedMissingEpisode: r.missing?.episodeId });
  };
  const dateArgs = async (uid = "stay-a") => ({ ...await authArgs(uid), expectedRevision: (await row(uid))!.dateReview!.revision });
  const jobs = () => t.run(ctx => ctx.db.query("jobs").collect());
  const protectedState = () => t.run(async ctx => ({ jobs: await ctx.db.query("jobs").collect(), payments: await ctx.db.query("cleanerPayments").collect(), paymentJobs: await ctx.db.query("cleanerPaymentJobs").collect(), forms: await ctx.db.query("forms").collect(), items: await ctx.db.query("formItems").collect(), invoices: await ctx.db.query("invoices").collect() }));
  const protect = async (status: "scheduled" | "in_progress" | "submitted" | "approved" | "cancelled") => {
    const job = (await jobs())[0];
    await t.run(async ctx => {
      const payment = await ctx.db.insert("cleanerPayments", { companyId: ids.companyId, jobId: job._id, cleanerUserId: ids.users.cleaner, amountCents: 15000, status: "PAID", createdAt: NOW, paidAt: NOW });
      await ctx.db.insert("cleanerPaymentJobs", { cleanerPaymentId: payment, jobId: job._id, amountCents: 15000 });
      const form = await ctx.db.insert("forms", { companyId: ids.companyId, jobId: job._id, cleanerId: ids.users.cleaner, status: "approved", submittedAt: NOW, ownerNotes: "Reviewed checklist", finalPass: true });
      await ctx.db.insert("formItems", { formId: form, section: "Kitchen", itemName: "Done", completed: true, note: "Manual note", isRedFlag: false, order: 1 });
      await ctx.db.insert("invoices", { companyId: ids.companyId, sourceJobId: job._id, title: "Paid service", invoiceNumber: "TEST-1", status: "paid", subtotalCents: 25000, taxCents: 0, totalCents: 25000, jobIds: [job._id], createdAt: NOW, updatedAt: NOW, paidAt: NOW });
      await ctx.db.patch(job._id, { status, cleanerIds: [ids.users.cleaner], startTime: "09:15", notes: "Human override", cleanerPaymentId: payment, plannedCleanerPayCents: 15000,
        executionHistory: [{ sequence: 1, provenance: "submission_confirmed", confirmedAt: NOW, confirmedById: ids.users.owner, scheduledDate: job.scheduledDate, workers: [{ userId: ids.users.cleaner, displayName: "Cleaner", role: "cleaner" }] }], submittedExecutionSequence: 1,
        ...(status === "approved" ? { approvedAt: NOW, approvedExecutionSequence: 1 } : {}) });
    });
  };
  return { t, ...ids, login, row, run, authArgs, identityArgs, classify, dateArgs, jobs, protectedState, protect };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("conservative reservation identity", () => {
  it.each([false, true])("holds both same-snapshot collisions regardless of event order (reverse=%s)", async reverse => {
    const s = await setup();
    const events = [event("stay-a"), event("stay-b")];
    await s.run(calendar((reverse ? events.reverse() : events).join("\r\n")));
    const before = [(await s.row())!.identityReview, (await s.row("stay-b"))!.identityReview];
    for (const review of before) expect(review).toMatchObject({ state: "pending", incomplete: false });
    await s.run(calendar(events.join("\r\n")));
    expect([(await s.row())!.identityReview, (await s.row("stay-b"))!.identityReview]).toEqual(before);
    expect((await s.t.run(ctx => ctx.db.query("auditLog").collect())).filter(a => a.action === "calendar_identity_review_required")).toHaveLength(2);
    expect(await s.classify()).toMatchObject({ outcome: "not_eligible", skipReason: "identity_review_required" });
    expect(await s.jobs()).toEqual([]);
  });
  it("is idempotent for identical observations and concurrent/retried owner classifications", async () => {
    const s = await setup(); await s.run(); await s.run();
    expect(await s.t.run(ctx => ctx.db.query("calendarReservations").collect())).toHaveLength(1);
    expect((await s.row())!.identityReview).toBeUndefined();
    const args = { ...await s.authArgs(), expectedRevision: 1, kind: "guest_reservation" as const };
    const results = await Promise.allSettled([s.t.mutation(api.mutations.calendarSync.confirmEventClassification, args), s.t.mutation(api.mutations.calendarSync.confirmEventClassification, args)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await s.run(); expect(await s.jobs()).toHaveLength(1);
  });
  it.each([false, true])("holds a rotated UID with changed dates=%s without merging or a second job", async changed => {
    const s = await setup(); await s.run(); await s.classify(); const original = (await s.row())!;
    const before = await s.protectedState();
    const rotated = calendar(event("new-uid", changed ? "20261120" : "20261110", changed ? "20261124" : "20261112"));
    await s.run(rotated);
    const next = (await s.row("new-uid"))!;
    expect(next.identityReview).toMatchObject({ state: "pending", candidateIds: [original._id] });
    expect((await s.row())!.missing).toBeDefined();
    expect(await s.classify("new-uid")).toMatchObject({ outcome: "not_eligible", skipReason: "identity_review_required" });
    const args = await s.identityArgs("new-uid", "duplicate", original._id);
    expect(await s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, args)).toBe("reviewed");
    expect(await s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, args)).toBe("already_reviewed");
    await s.run(rotated); expect((await s.row("new-uid"))!.identityReview!.state).toBe("duplicate");
    expect(await s.protectedState()).toEqual(before);
    expect(await s.t.run(ctx => ctx.db.query("calendarReservations").collect())).toHaveLength(2);
  });
  it("never silently merges genuinely distinct similar events and requires explicit separate-booking review", async () => {
    const s = await setup(); const content = calendar(`${event()}\r\n${event("stay-b", "20261111", "20261113", "Reserved")}`);
    await s.run(content);
    expect((await s.row())!.identityReview!.state).toBe("pending"); expect((await s.row("stay-b"))!.identityReview!.state).toBe("pending");
    expect(await s.jobs()).toEqual([]);
    await s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, await s.identityArgs("stay-a", "distinct"));
    await s.classify();
    // Evidence was refreshed when the candidate gained a job; inspect the new
    // revision and explicitly attest distinctness, rather than bypassing it.
    const stale = await s.identityArgs("stay-b", "distinct");
    expect(await s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, stale)).toBe("stale");
    await s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, await s.identityArgs("stay-b", "distinct"));
    await s.classify("stay-b"); expect(await s.jobs()).toHaveLength(2);
    expect(await s.t.run(ctx => ctx.db.query("calendarReservations").collect())).toHaveLength(2);
  });
  it("detects cross-feed duplication/movement without matching across properties or tenants", async () => {
    const s = await setup(); await s.run(); await s.classify();
    await s.run(calendar(event()), s.secondConnection);
    expect((await s.row("stay-a", s.secondConnection))!.identityReview!.reasons).toContain("same_uid_other_feed");
    expect(await s.classify("stay-a", "guest_reservation", s.secondConnection)).toMatchObject({ outcome: "not_eligible" });
    await s.run(calendar(event()), s.otherConnection); await s.run(calendar(event()), s.foreignConnection);
    expect((await s.row("stay-a", s.otherConnection))!.identityReview).toBeUndefined();
    expect((await s.row("stay-a", s.foreignConnection))!.identityReview).toBeUndefined();
    expect(await s.jobs()).toHaveLength(1);
  });
  it("retains possible duplicate evidence after a source feed is removed", async () => {
    const s = await setup(); await s.run(); await s.classify(); const original = (await s.row())!;
    await s.t.mutation(api.mutations.calendarConnections.remove, { sessionToken: await s.login(), connectionId: s.connectionId });
    await s.run(calendar(event("rotated")), s.secondConnection);
    expect((await s.row("rotated", s.secondConnection))!.identityReview!.candidateIds).toContain(original._id);
    expect(await s.jobs()).toHaveLength(1);
  });
  it("refreshes stale candidate evidence atomically and serializes conflicting/retried reviews", async () => {
    const s = await setup(); await s.run(calendar(`${event()}\r\n${event("stay-b")}`));
    const a = (await s.row())!;
    const args = await s.identityArgs("stay-b", "duplicate", a._id);
    await s.t.run(ctx => ctx.db.patch(a._id, { eventVersion: "0:changed-candidate" }));
    expect(await s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, args)).toBe("stale");
    expect((await s.row("stay-b"))!.identityReview!.revision).toBeGreaterThan(args.expectedRevision);
    const duplicate = await s.identityArgs("stay-b", "duplicate", a._id);
    const separate = { ...duplicate, decision: "distinct" as const, duplicateOf: undefined };
    const result = await Promise.all([s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, duplicate), s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, separate)]);
    expect(result.sort()).toEqual(["reviewed", "stale"]);
    expect(await s.jobs()).toEqual([]);
  });
  it.each(["manager", "cleaner", "foreign"])("denies review by %s and rejects candidate scope spoofing", async role => {
    const s = await setup(); await s.run(calendar(`${event()}\r\n${event("stay-b")}`));
    const args = await s.identityArgs("stay-b", "distinct", undefined, s.connectionId, role);
    await expect(s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, args)).rejects.toThrow();
    await s.run(calendar(event()), s.foreignConnection);
    const bad = await s.identityArgs("stay-b", "duplicate", (await s.row("stay-a", s.foreignConnection))!._id);
    await expect(s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, bad)).rejects.toThrow("candidate");
    expect(await s.jobs()).toEqual([]);
  });
  it("keeps non-guest classification and identity suppression separate from job automation", async () => {
    const s = await setup(); await s.run(calendar(`${event()}\r\n${event("stay-b")}`));
    await s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, await s.identityArgs("stay-b", "distinct"));
    expect(await s.classify("stay-b", "non_guest_block")).toMatchObject({ outcome: "not_eligible", skipReason: "non_guest_block" });
    await s.run(calendar(`${event()}\r\n${event("stay-b")}`)); expect(await s.jobs()).toEqual([]);
  });
});

describe("versioned date change review and downstream preservation", () => {
  it.each(["scheduled", "in_progress", "submitted", "approved", "cancelled"] as const)("preserves a manually edited %s job, checklist, execution, invoices and paid records", async status => {
    const s = await setup(); await s.run(); await s.classify(); await s.protect(status);
    const before = await s.protectedState();
    await s.run(calendar(event("stay-a", "20261109", "20261115")));
    expect((await s.row())!.dateReview).toMatchObject({ state: "pending", previousCheckIn: "2026-11-10", previousCheckOut: "2026-11-12", proposedCheckIn: "2026-11-09", proposedCheckOut: "2026-11-15" });
    const firstArgs = await s.dateArgs();
    expect(await s.t.mutation(api.mutations.calendarSync.acknowledgeReservationDates, firstArgs)).toBe("acknowledged");
    expect(await s.t.mutation(api.mutations.calendarSync.acknowledgeReservationDates, firstArgs)).toBe("already_acknowledged");
    await s.run(calendar(event("stay-a", "20261111", "20261112")));
    expect((await s.row())!.dateReview).toMatchObject({ state: "pending", previousCheckIn: "2026-11-09", previousCheckOut: "2026-11-15", proposedCheckIn: "2026-11-11", proposedCheckOut: "2026-11-12" });
    await expect(s.t.mutation(api.mutations.calendarSync.acknowledgeReservationDates, firstArgs)).rejects.toThrow("changed");
    await s.classify(); expect(await s.protectedState()).toEqual(before);
    expect((await s.row())!.originalCheckOut).toBe("2026-11-12");
    expect((await s.row())!.dateConflict).toBe(true);
  });
  it("retains the first unacknowledged dates, records every transition once, and blocks unlinked job creation", async () => {
    const s = await setup(); await s.run();
    await s.run(calendar(event("stay-a", "20261109", "20261114")));
    await s.run(calendar(event("stay-a", "20261108", "20261115")));
    const before = (await s.row())!.dateReview;
    await s.run(calendar(event("stay-a", "20261108", "20261115")));
    expect((await s.row())!.dateReview).toEqual(before);
    expect(before).toMatchObject({ previousCheckIn: "2026-11-10", previousCheckOut: "2026-11-12", proposedCheckIn: "2026-11-08", proposedCheckOut: "2026-11-15" });
    expect(await s.classify()).toMatchObject({ outcome: "not_eligible", skipReason: "date_review_required" });
    const args = await s.dateArgs();
    await expect(s.t.mutation(api.mutations.calendarSync.acknowledgeReservationDates, { ...args, sessionToken: await s.login("manager") })).rejects.toThrow();
    await s.t.mutation(api.mutations.calendarSync.acknowledgeReservationDates, args);
    expect(await s.classify()).toMatchObject({ outcome: "created" });
    expect(await s.t.run(ctx => ctx.db.query("auditLog").collect())).toEqual(expect.arrayContaining([expect.objectContaining({ action: "calendar_reservation_dates_changed" })]));
    expect((await s.t.run(ctx => ctx.db.query("auditLog").collect())).filter(a => a.action === "calendar_reservation_dates_changed")).toHaveLength(2);
  });
  it("tracks arrival-only changes and rejects reviews across feed generations or cancellations", async () => {
    const s = await setup(); await s.run(); await s.run(calendar(event("stay-a", "20261109")));
    expect((await s.row())!.dateReview!.state).toBe("pending");
    const args = await s.dateArgs();
    await s.t.mutation(api.mutations.calendarConnections.update, { sessionToken: args.sessionToken, connectionId: s.connectionId, icalUrl: "https://synthetic.test/replaced" });
    await expect(s.t.mutation(api.mutations.calendarSync.acknowledgeReservationDates, args)).rejects.toThrow("changed");
    await s.run(calendar(event("stay-a", "20261109")));
    const fresh = await s.dateArgs(); await s.run(calendar(cancelledEvent("stay-a")));
    await expect(s.t.mutation(api.mutations.calendarSync.acknowledgeReservationDates, fresh)).rejects.toThrow("changed");
  });
  it("retains original-job protection when cancellation and UID rotation arrive together", async () => {
    const s = await setup(); await s.run(); await s.classify(); const before = await s.protectedState();
    await s.run(calendar(`${cancelledEvent("stay-a")}\r\n${event("new-uid", "20261120", "20261122")}`));
    expect((await s.row())!.status).toBe("cancelled");
    expect((await s.row("new-uid"))!.identityReview!.state).toBe("pending");
    await s.classify("new-uid"); expect(await s.protectedState()).toEqual(before);
  });
  it("rejects malformed fields, duplicate stored UID rows and stale attempt callbacks without partial writes", async () => {
    const s = await setup(); await s.run(); const before = await s.row();
    await expect(s.run(calendar(event().replace("20261112", "20260230")))).rejects.toThrow("Unsafe");
    expect(await s.row()).toEqual(before);
    // Finish that failed internal-only test round before starting a fresh one.
    await s.t.run(ctx => ctx.db.patch(s.connectionId, { syncAttempt: undefined }));
    const raw = (await s.row())!;
    await s.t.run(ctx => { const { _id, _creationTime, ...fields } = raw; return ctx.db.insert("calendarReservations", fields); });
    const snapshot = await s.protectedState();
    await expect(s.run()).rejects.toThrow(); expect(await s.protectedState()).toEqual(snapshot);
    expect(await s.t.mutation(sync.processSyncResults, { connectionId: s.connectionId, attemptId: "stale", snapshotStatus: "valid", reservations: [], totalEvents: 1, skipped: 0 })).toBe("skipped");
  });
  it("fails closed when the bounded property scan cannot establish complete evidence", async () => {
    const s = await setup(); await s.run(); const original = (await s.row())!;
    await s.t.run(async ctx => {
      const { _id, _creationTime, identityReview, ...fields } = original;
      for (let i = 0; i < 201; i++) await ctx.db.insert("calendarReservations", { ...fields, externalUid: `legacy-${i}`, checkIn: "2025-01-01", checkOut: "2025-01-02" });
    });
    await s.run(); expect((await s.row())!.identityReview).toMatchObject({ state: "pending", incomplete: true });
    await expect(s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, await s.identityArgs("stay-a", "distinct"))).rejects.toThrow("incomplete");
    await s.classify(); expect(await s.jobs()).toEqual([]);
  });
  it("caps excessive candidates and refuses a separate-booking attestation over incomplete evidence", async () => {
    const s = await setup();
    await s.run(calendar(Array.from({ length: 22 }, (_, i) => event(i === 0 ? "stay-a" : `candidate-${i}`)).join("\r\n")));
    expect((await s.row())!.identityReview).toMatchObject({ state: "pending", incomplete: true });
    expect((await s.row())!.identityReview!.candidateIds).toHaveLength(20);
    await expect(s.t.mutation(api.mutations.calendarSync.reviewReservationIdentity, await s.identityArgs("stay-a", "distinct"))).rejects.toThrow("incomplete");
    expect(await s.jobs()).toEqual([]);
  });
});
