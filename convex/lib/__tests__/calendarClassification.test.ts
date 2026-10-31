import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { classifyICalEvent } from "../calendarClassification";
import { parseICalFeed } from "../../actions/icalParser";
import { hashPassword } from "../password";
import { calendar, cancelledEvent, reservationEvent } from "./calendarSnapshotFixtures";

const modules = import.meta.glob("../../**/*.ts");
const sync = internal.mutations.calendarSync;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const feed = calendar(reservationEvent());
let cachedHash: Promise<string> | undefined;

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await (cachedHash ??= hashPassword("classification-test-password"));
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Classification", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other", timezone: "UTC" });
    const users: Record<string, any> = {};
    for (const [name, role, company] of [["owner", "owner", companyId], ["second", "owner", companyId], ["manager", "manager", companyId], ["worker", "cleaner", companyId], ["foreign", "owner", otherCompanyId]] as const) {
      users[name] = await ctx.db.insert("users", { companyId: company, name, email: `${name}@class.test`, passwordHash, role, status: "active" });
    }
    const propertyId = await ctx.db.insert("properties", { companyId, name: "Rental", address: "1 Test", type: "residential", amenities: [], active: true });
    const otherPropertyId = await ctx.db.insert("properties", { companyId, name: "Second Rental", address: "2 Test", type: "residential", amenities: [], active: true });
    const connectionId = await ctx.db.insert("calendarConnections", { companyId, propertyId, createdBy: users.owner, platform: "airbnb", icalUrl: "https://synthetic.test/private-feed-token", enabled: true, lastSyncStatus: "pending", consecutiveErrors: 0, initialSyncCutoff: "2026-10-25", createdAt: NOW });
    const secondConnectionId = await ctx.db.insert("calendarConnections", { companyId, propertyId: otherPropertyId, createdBy: users.owner, platform: "vrbo", icalUrl: "https://synthetic.test/second", enabled: true, lastSyncStatus: "pending", consecutiveErrors: 0, initialSyncCutoff: "2026-10-25", createdAt: NOW });
    const ruleId = await ctx.db.insert("jobAutomationRules", { companyId, propertyId, enabled: true, jobType: "turnover", defaultDurationMinutes: 180, defaultStartTime: "" });
    return { companyId, otherCompanyId, propertyId, connectionId, secondConnectionId, ruleId, users };
  });
  const login = async (name = "owner") => (await t.action(api.authActions.signIn, { email: `${name}@class.test`, password: "classification-test-password" })).sessionToken;
  const run = async (content = feed, connectionId = ids.connectionId) => {
    vi.advanceTimersByTime(60_000); vi.mocked(fetch).mockResolvedValueOnce(new Response(content));
    return t.action(internal.actions.calendarSync.syncConnection, { connectionId });
  };
  const reservation = (connectionId = ids.connectionId, uid = "reservation-one") => t.run(ctx => ctx.db.query("calendarReservations").withIndex("by_connectionId_externalUid", q => q.eq("connectionId", connectionId).eq("externalUid", uid)).first());
  const decisionArgs = async (kind: "guest_reservation" | "non_guest_block" = "guest_reservation", name = "owner", connectionId = ids.connectionId, uid = "reservation-one") => {
    const row = (await reservation(connectionId, uid))!;
    const connection = (await t.run(ctx => ctx.db.get(connectionId)))!;
    return { sessionToken: await login(name), reservationId: row._id, kind, expectedEventVersion: row.eventVersion!, expectedRevision: row.classification?.revision ?? 0,
      expectedFeedRevision: connection.feedRevision ?? 0, expectedMissingEpisode: row.missing?.episodeId };
  };
  const decide = async (kind: "guest_reservation" | "non_guest_block" = "guest_reservation", name = "owner") => t.mutation(api.mutations.calendarSync.confirmEventClassification, await decisionArgs(kind, name));
  const jobs = () => t.run(ctx => ctx.db.query("jobs").collect());
  const audits = () => t.run(ctx => ctx.db.query("auditLog").collect());
  return { t, ...ids, login, run, reservation, decisionArgs, decide, jobs, audits };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv("APP_URL", "https://scrub.example"); vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unmocked fetch"); }));
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("conservative iCal classification", () => {
  it.each(["Reserved", "Booked", "Guest", "Airbnb", "Blocked", "Owner use", "Maintenance"])("does not trust the title %s or a selected platform", async summary => {
    expect(classifyICalEvent({ platform: "airbnb", summary, status: "CONFIRMED", transparency: "OPAQUE", categories: ["RESERVATION"] }).kind).toBe("needs_review");
    const s = await setup();
    expect(await s.run(feed.replace("SUMMARY:Reserved", `SUMMARY:${summary}\r\nSTATUS:CONFIRMED\r\nTRANSP:OPAQUE\r\nCATEGORIES:RESERVATION\r\nX-RESERVATION-ID:booking-123`))).toBe("success");
    expect((await s.reservation())!.classification).toMatchObject({ kind: "needs_review", source: "unverified_ical", reason: "insufficient_verified_evidence" });
    expect(await s.jobs()).toEqual([]);
  });

  it("keeps identical ambiguous feeds healthy without duplicate reviews or alerts", async () => {
    const s = await setup(); await s.run(); const first = (await s.reservation())!.classification;
    for (let i = 0; i < 3; i++) await s.run();
    expect((await s.reservation())!.classification).toEqual(first);
    expect(await s.jobs()).toEqual([]); expect(await s.audits()).toEqual([]);
    expect(await s.t.run(ctx => ctx.db.query("notifications").collect())).toEqual([]);
    expect(await s.t.run(ctx => ctx.db.get(s.connectionId))).toMatchObject({ enabled: true, consecutiveErrors: 0, lastSyncStatus: "success" });
  });

  it("creates a job only after an authorized guest decision and never duplicates it", async () => {
    const s = await setup(); await s.run(); const args = await s.decisionArgs();
    expect(await s.t.mutation(api.mutations.calendarSync.confirmEventClassification, args)).toMatchObject({ outcome: "created", manualJobReviewRequired: false });
    const row = (await s.reservation())!;
    expect(row.classification).toMatchObject({ kind: "guest_reservation", source: "owner", ownerDecision: { actorId: s.users.owner, eventVersion: row.eventVersion } });
    await expect(s.t.mutation(api.mutations.calendarSync.confirmEventClassification, args)).rejects.toThrow("changed");
    expect(await s.decide()).toMatchObject({ outcome: "already_linked" });
    await s.run();
    expect((await s.reservation())!.classification).toEqual(row.classification);
    expect(await s.jobs()).toHaveLength(1);
    expect((await s.audits()).filter(row => row.action === "calendar_event_classified")).toHaveLength(1);
  });

  it("records owner-confirmed non-guest blocks without creating work", async () => {
    const s = await setup(); await s.run();
    expect(await s.decide("non_guest_block")).toMatchObject({ outcome: "not_eligible", skipReason: "non_guest_block" });
    await s.run();
    expect((await s.reservation())!.classification).toMatchObject({ kind: "non_guest_block", source: "owner" });
    expect(await s.jobs()).toEqual([]);
  });

  it.each(["rules_disabled", "connection_disabled", "cutoff", "past", "missing"])("retains the %s job gate after guest confirmation", async gate => {
    const s = await setup();
    if (gate === "rules_disabled") await s.t.run(ctx => ctx.db.patch(s.ruleId, { enabled: false }));
    if (gate === "cutoff") await s.t.run(ctx => ctx.db.patch(s.connectionId, { initialSyncCutoff: "2026-10-27" }));
    await s.run(gate === "past" ? feed.replace("20261026", "20261024").replace("20261027", "20261026") : feed);
    if (gate === "connection_disabled") await s.t.run(ctx => ctx.db.patch(s.connectionId, { enabled: false }));
    if (gate === "missing") await s.run(calendar(reservationEvent("other-stay")));
    expect(await s.decide()).toMatchObject({ outcome: "not_eligible" });
    expect(await s.jobs()).toEqual([]);
    if (gate === "missing") { await s.run(); expect(await s.jobs()).toHaveLength(1); }
    if (gate === "rules_disabled") {
      await s.t.run(ctx => ctx.db.patch(s.ruleId, { enabled: true })); await s.run(); expect(await s.jobs()).toHaveLength(1);
    }
  });

  it("ignores routine timestamp/sequence changes but revalidates material evidence", async () => {
    const s = await setup(); await s.run(); await s.decide();
    const first = (await s.reservation())!;
    const originalJobs = await s.jobs();
    await s.run(feed.replace("SUMMARY:Reserved", "SUMMARY:Reserved\r\nDTSTAMP:20261027T120000Z\r\nSEQUENCE:99\r\nLAST-MODIFIED:20261027T120000Z"));
    expect((await s.reservation())!.classification).toEqual(first.classification);
    await s.run(feed.replace("SUMMARY:Reserved", "SUMMARY:Reserved\r\nDESCRIPTION:changed purpose\r\nX-EVENT-TYPE:private-hold"));
    expect((await s.reservation())!.classification).toMatchObject({ kind: "needs_review", reason: "material_event_changed", ownerDecision: first.classification!.ownerDecision });
    expect(await s.jobs()).toEqual(originalJobs);
    expect((await s.audits()).filter(row => row.action === "calendar_classification_review_required")).toHaveLength(1);
  });

  it("rejects stale event/missing state and binds decisions to the feed URL generation", async () => {
    const s = await setup(); await s.run(); const old = await s.decisionArgs();
    await s.run(feed.replace("20261027", "20261028"));
    await expect(s.t.mutation(api.mutations.calendarSync.confirmEventClassification, old)).rejects.toThrow("changed");
    const beforeMissing = await s.decisionArgs(); await s.run(calendar(reservationEvent("other")));
    await expect(s.t.mutation(api.mutations.calendarSync.confirmEventClassification, beforeMissing)).rejects.toThrow("changed");
    await s.run(); await s.decide(); const ownerChoice = (await s.reservation())!.classification!.ownerDecision;
    const beforeUrl = await s.decisionArgs();
    await s.t.mutation(api.mutations.calendarConnections.update, { sessionToken: beforeUrl.sessionToken, connectionId: s.connectionId, icalUrl: "https://synthetic.test/replacement" });
    await expect(s.t.mutation(api.mutations.calendarSync.confirmEventClassification, beforeUrl)).rejects.toThrow("changed");
    await s.run();
    expect((await s.reservation())!.classification).toMatchObject({ kind: "needs_review", reason: "material_event_changed", ownerDecision: ownerChoice });
    expect(await s.jobs()).toHaveLength(1);
  });

  it("preserves approved job/assignment/execution/payment records when an owner changes classification", async () => {
    const s = await setup(); await s.run(); await s.decide();
    await s.t.run(async ctx => {
      const job = (await ctx.db.query("jobs").first())!;
      const paymentId = await ctx.db.insert("cleanerPayments", { companyId: s.companyId, jobId: job._id, cleanerUserId: s.users.worker, amountCents: 12500, status: "PAID", createdAt: NOW, paidAt: NOW });
      await ctx.db.patch(job._id, { status: "approved", approvedAt: NOW, cleanerIds: [s.users.worker], notes: "Manual override", plannedCleanerPayCents: 12500, cleanerPaymentId: paymentId,
        executionHistory: [{ sequence: 1, provenance: "submission_confirmed", confirmedById: s.users.owner, confirmedAt: NOW, scheduledDate: job.scheduledDate, workers: [{ userId: s.users.worker, displayName: "Worker", role: "cleaner" }] }] });
    });
    const records = async () => ({ jobs: await s.jobs(), payments: await s.t.run(ctx => ctx.db.query("cleanerPayments").collect()) });
    const before = await records();
    expect(await s.decide("non_guest_block")).toMatchObject({ outcome: "already_linked", manualJobReviewRequired: true });
    expect(await records()).toEqual(before);
    await s.run(); expect(await records()).toEqual(before);
    await s.run(calendar(cancelledEvent())); expect(await records()).toEqual(before);
  });

  it.each(["manager", "worker", "foreign", "invalid"])("rejects classification by %s", async name => {
    const s = await setup(); await s.run(); const before = await s.reservation();
    const args = await s.decisionArgs();
    args.sessionToken = name === "invalid" ? "invalid" : await s.login(name);
    await expect(s.t.mutation(api.mutations.calendarSync.confirmEventClassification, args)).rejects.toThrow();
    expect(await s.reservation()).toEqual(before); expect(await s.jobs()).toEqual([]);
  });

  it("rejects spoofed actors and removed/mismatched property or connection", async () => {
    const s = await setup(); await s.run(); const args = await s.decisionArgs();
    await expect(s.t.mutation(api.mutations.calendarSync.confirmEventClassification, { ...args, userId: s.users.foreign })).rejects.toThrow();
    await s.t.run(ctx => ctx.db.patch(s.propertyId, { companyId: s.otherCompanyId }));
    await expect(s.t.mutation(api.mutations.calendarSync.confirmEventClassification, args)).rejects.toThrow("unavailable");
    expect(await s.jobs()).toEqual([]);
  });

  it("serializes concurrent owners using the event revision", async () => {
    const s = await setup(); await s.run();
    const guest = await s.decisionArgs("guest_reservation", "owner");
    const block = await s.decisionArgs("non_guest_block", "second");
    const results = await Promise.allSettled([s.t.mutation(api.mutations.calendarSync.confirmEventClassification, guest), s.t.mutation(api.mutations.calendarSync.confirmEventClassification, block)]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(row => row.status === "rejected")).toHaveLength(1);
    const row = (await s.reservation())!;
    expect(row.classification!.source).toBe("owner");
    expect(await s.jobs()).toHaveLength(row.classification!.kind === "guest_reservation" ? 1 : 0);
    expect((await s.audits()).filter(row => row.action === "calendar_event_classified")).toHaveLength(1);
  });

  it("retains cross-feed checkout deduplication during concurrent owner confirmations", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.secondConnectionId, { propertyId: s.propertyId }));
    await s.run(); await s.run(feed, s.secondConnectionId);
    const first = await s.decisionArgs("guest_reservation", "owner");
    const second = await s.decisionArgs("guest_reservation", "second", s.secondConnectionId);
    const results = await Promise.all([s.t.mutation(api.mutations.calendarSync.confirmEventClassification, first), s.t.mutation(api.mutations.calendarSync.confirmEventClassification, second)]);
    expect(results.map(row => row.outcome).sort()).toEqual(["created", "not_eligible"]);
    expect(results.find(row => row.outcome === "not_eligible")!.skipReason).toBe("duplicate_checkout_date");
    expect(await s.jobs()).toHaveLength(1);
  });

  it("does not create a previously confirmed unlinked job when its evidence changes", async () => {
    const s = await setup(); await s.t.run(ctx => ctx.db.patch(s.ruleId, { enabled: false }));
    await s.run(); await s.decide();
    await s.t.run(ctx => ctx.db.patch(s.ruleId, { enabled: true }));
    const changed = feed.replace("SUMMARY:Reserved", "SUMMARY:Reserved\r\nSTATUS:TENTATIVE");
    await s.run(changed);
    expect((await s.reservation())!.classification!.kind).toBe("needs_review"); expect(await s.jobs()).toEqual([]);
    await s.decide(); expect(await s.jobs()).toHaveLength(1);
  });

  it("enforces the initial cutoff on unflagged legacy rows", async () => {
    const s = await setup(); await s.run();
    const row = (await s.reservation())!;
    await s.t.run(async ctx => {
      await ctx.db.patch(s.connectionId, { initialSyncCutoff: row.checkOut });
      await ctx.db.patch(row._id, { classification: undefined, jobCreationSkipped: undefined, skipReason: undefined });
    });
    expect(await s.decide()).toMatchObject({ outcome: "not_eligible", skipReason: "before_initial_sync_cutoff" });
    expect(await s.jobs()).toEqual([]);
  });

  it("keeps different properties/connections isolated", async () => {
    const s = await setup(); await s.run(); await s.run(feed, s.secondConnectionId);
    const other = await s.reservation(s.secondConnectionId);
    await s.decide();
    expect(await s.reservation(s.secondConnectionId)).toEqual(other);
    expect((await s.jobs())[0].propertyId).toBe(s.propertyId);
  });

  it.each(["invalid", "degraded", "empty"])("preserves classification through %s snapshots", async scenario => {
    const s = await setup(); await s.run(); await s.decide();
    const before = await s.reservation(); const jobs = await s.jobs(); const audits = await s.audits();
    await s.run(scenario === "invalid" ? "<html>error</html>" : scenario === "degraded" ? feed.replace("20261027", "invalid") : calendar(""));
    expect(await s.reservation()).toEqual(before); expect(await s.jobs()).toEqual(jobs); expect(await s.audits()).toEqual(audits);
  });

  it("preserves human decisions against fenced older sync results", async () => {
    const s = await setup(); await s.run(); vi.advanceTimersByTime(60_000);
    await s.t.mutation(sync.beginSyncAttempt, { connectionId: s.connectionId, attemptId: "old" });
    await s.decide(); vi.advanceTimersByTime(10 * 60_000); await s.run();
    const before = await s.reservation();
    const changed = parseICalFeed(feed.replace("SUMMARY:Reserved", "SUMMARY:other purpose"));
    expect(await s.t.mutation(sync.processSyncResults, { connectionId: s.connectionId, attemptId: "old", snapshotStatus: "valid", reservations: changed.reservations, totalEvents: 1, skipped: 0 })).toBe("skipped");
    expect(await s.reservation()).toEqual(before); expect(await s.jobs()).toHaveLength(1);
  });

  it("keeps missing acknowledgement distinct from classification and cancellation", async () => {
    const s = await setup(); await s.run(); await s.run(calendar(reservationEvent("other")));
    const row = (await s.reservation())!; const sessionToken = await s.login();
    await s.t.mutation(api.mutations.calendarSync.acknowledgeMissingReservation, { sessionToken, reservationId: row._id, episodeId: row.missing!.episodeId });
    expect((await s.reservation())!.classification!.kind).toBe("needs_review"); expect(await s.jobs()).toEqual([]);
    await s.run(calendar(cancelledEvent()));
    expect((await s.reservation())!.status).toBe("cancelled");
    await expect(s.decide()).rejects.toThrow("changed");
  });

  it.each([true, false])("keeps unchanged legacy imports unconfirmed without backfill (linked: %s)", async linked => {
    const s = await setup(); const parsed = parseICalFeed(feed).reservations[0];
    const id = await s.t.run(async ctx => {
      const jobId = linked ? await ctx.db.insert("jobs", { companyId: s.companyId, propertyId: s.propertyId, cleanerIds: [s.users.worker], type: "turnover", status: "approved", scheduledDate: parsed.checkOut, durationMinutes: 180, notes: "Historical decision", reworkCount: 0 }) : undefined;
      return ctx.db.insert("calendarReservations", { companyId: s.companyId, connectionId: s.connectionId, propertyId: s.propertyId, externalUid: parsed.uid, summary: parsed.summary, checkIn: parsed.checkIn, checkOut: parsed.checkOut, rawHash: parsed.rawHash, status: "active", firstSeenAt: NOW - 1000, lastSeenAt: NOW - 1000, ...(jobId ? { linkedJobId: jobId } : {}) });
    });
    const oldJobs = await s.jobs(); await s.run();
    expect((await s.reservation())!.classification).toBeUndefined(); expect(await s.jobs()).toEqual(oldJobs);
    expect((await s.audits()).filter(row => row.action.startsWith("calendar_classification"))).toEqual([]);
    expect(await s.decide()).toMatchObject({ outcome: linked ? "already_linked" : "created" });
    expect((await s.t.run(ctx => ctx.db.get(id)))!.classification!.source).toBe("owner");
  });
});
