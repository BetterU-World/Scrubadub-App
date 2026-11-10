import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { hashToken } from "../tokens";
import { ensureOperationalEmail } from "../operationalEmailQueue";
import { EMAIL_CLAIM_MS, EMAIL_RECOVERY_BATCH, EMAIL_RECOVERY_WINDOW_MS, MAX_EMAIL_ATTEMPTS } from "../operationalEmailModel";
import { deliverJobAssignedEmail, deliverJobCompletedEmail, deliverJobApprovedEmail } from "../email";
import { finish as finishDelivery } from "../../operationalEmailDelivery";
import { assignmentEmailState } from "../../jobAssignmentNotifications";

vi.mock("../email", async importOriginal => ({
  ...await importOriginal<typeof import("../email")>(),
  deliverJobAssignedEmail: vi.fn(), deliverJobCompletedEmail: vi.fn(), deliverJobApprovedEmail: vi.fn(),
}));
const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.parse("2030-01-01T12:00:00Z");
beforeEach(() => {
  vi.useFakeTimers({ now: NOW }); vi.stubEnv("APP_URL", "http://localhost:5173");
  for (const send of [deliverJobAssignedEmail, deliverJobCompletedEmail, deliverJobApprovedEmail]) {
    vi.mocked(send).mockReset(); vi.mocked(send).mockResolvedValue({ status: "provider_accepted", providerMessageId: "provider-123" });
  }
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Delivery", timezone: "UTC", subscriptionStatus: "active" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Foreign", timezone: "UTC" });
    const user = async (name: string, role: Doc<"users">["role"] = "cleaner", company = companyId) => {
      const id = await ctx.db.insert("users", { name, role, companyId: company, status: "active", email: `${name}@delivery.test`, passwordHash: "unused" });
      await ctx.db.insert("authSessions", { principalType: "staff", userId: id, tokenHash: hashToken(name), version: 1,
        createdAt: NOW, lastUsedAt: NOW, expiresAt: NOW + 7200000, idleExpiresAt: NOW + 7200000 });
      return id;
    };
    const owner = await user("owner", "owner"), worker = await user("worker"), teamWorker = await user("teamWorker");
    const manager = await user("manager", "manager"), foreignOwner = await user("foreignOwner", "owner", foreignCompany);
    const property = await ctx.db.insert("properties", { companyId, name: "Private property", address: "Private address", type: "residential", active: true, amenities: [] });
    const team = await ctx.db.insert("teams", { companyId, name: "Team", active: true, createdBy: owner, createdAt: NOW, updatedAt: NOW });
    for (const userId of [worker, teamWorker]) await ctx.db.insert("teamMembers", { companyId, teamId: team, userId, role: "member", active: true, addedAt: NOW });
    const job = await ctx.db.insert("jobs", { companyId, propertyId: property, cleanerIds: [worker], assignedTeamId: team,
      type: "standard", status: "confirmed", scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0, assignmentRevision: 1 });
    return { companyId, foreignCompany, owner, worker, teamWorker, manager, foreignOwner, property, team, job };
  });
  const event = { kind: "assignment" as const, companyId: ids.companyId, jobId: ids.job, recipientId: ids.worker, revision: 1 };
  const enqueue = () => t.run(ctx => ensureOperationalEmail(ctx, event));
  const id = await enqueue();
  const dispatch = () => t.action(internal.operationalEmailActions.dispatch, { deliveryId: id });
  const row = () => t.run(ctx => ctx.db.get(id));
  const rows = () => t.run(ctx => ctx.db.query("operationalEmailDeliveries").collect());
  const scheduled = () => t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
  const auth = (name: "owner" | "worker" | "manager" | "foreignOwner" = "owner") => ({ userId: ids[name], sessionToken: name });
  return { t, ...ids, event, id, enqueue, dispatch, row, rows, scheduled, auth };
}

describe("operational email ledger and dispatch", () => {
  it("deduplicates event/recipient registration including concurrent calls and queued-context adoption", async () => {
    const s = await setup();
    const registered = await Promise.all(Array.from({ length: 6 }, () => s.enqueue()));
    expect(new Set(registered)).toEqual(new Set([s.id]));
    await s.t.mutation(internal.operationalEmailDelivery.adoptQueued, { event: { kind: "assignment", jobId: s.job, recipientId: s.worker, revision: 1 } });
    expect(await s.rows()).toHaveLength(1);
    await Promise.all([s.dispatch(), s.dispatch(), s.dispatch()]);
    expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(1);
    expect(await s.row()).toMatchObject({ state: "provider_accepted", attemptCount: 1, providerMessageId: "provider-123" });
    await s.dispatch(); expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(1);
  });

  it("producer creation uses a unique team/direct union and unchanged edits do not recreate deliveries", async () => {
    const s = await setup();
    const job = await s.t.mutation(api.mutations.jobs.create, { ...s.auth(), companyId: s.companyId, propertyId: s.property,
      cleanerIds: [s.worker, s.worker], assignedTeamId: s.team, type: "standard", scheduledDate: "2030-01-03", durationMinutes: 60 });
    const deliveries = (await s.rows()).filter(row => row.jobId === job);
    expect(new Set(deliveries.map(row => row.recipientId))).toEqual(new Set([s.worker, s.teamWorker]));
    expect(deliveries).toHaveLength(2); expect(await s.scheduled()).toHaveLength(2);
    expect(deliveries.every(row => row.scheduledFunctionId)).toBe(true);
    await s.t.mutation(api.mutations.jobs.update, { ...s.auth(), jobId: job, cleanerIds: [s.worker], assignedTeamId: s.team });
    expect((await s.rows()).filter(row => row.jobId === job)).toHaveLength(2);
    expect(await s.scheduled()).toHaveLength(2);
  });

  it("claims atomically and only allows one beginSend for that attempt", async () => {
    const s = await setup();
    const results = await Promise.all(Array.from({ length: 5 }, () => s.t.mutation(internal.operationalEmailDelivery.claim, { deliveryId: s.id })));
    expect(results.filter(Boolean)).toHaveLength(1);
    const args = { deliveryId: s.id, attemptNumber: 1 };
    const begins = await Promise.all([s.t.mutation(internal.operationalEmailDelivery.beginSend, args), s.t.mutation(internal.operationalEmailDelivery.beginSend, args)]);
    expect(begins.filter(Boolean)).toHaveLength(1);
    expect(await s.row()).toMatchObject({ state: "claimed", attemptCount: 1 });
  });

  it.each([true, false])("records provider acceptance with optional ID present=%s", async present => {
    const s = await setup(); vi.mocked(deliverJobAssignedEmail).mockResolvedValue({ status: "provider_accepted", ...(present ? { providerMessageId: "real-id" } : {}) });
    await s.dispatch();
    expect(await s.row()).toMatchObject({ state: "provider_accepted", attemptCount: 1, attempts: [{ number: 1, state: "provider_accepted", finishedAt: NOW }] });
    expect((await s.row())?.providerMessageId).toBe(present ? "real-id" : undefined);
    expect((await s.row())?.nextAttemptAt).toBeUndefined();
  });

  it("caps definite rate-limit retries with increasing bounded backoff", async () => {
    const s = await setup(); vi.mocked(deliverJobAssignedEmail).mockResolvedValue({ status: "failed", category: "rate_limited" });
    for (let number = 1; number <= MAX_EMAIL_ATTEMPTS; number++) {
      const now = Date.now(); await s.dispatch(); const row = await s.row();
      expect(row).toMatchObject({ state: "failed", attemptCount: number });
      if (number < MAX_EMAIL_ATTEMPTS) {
        const delay = row!.nextAttemptAt! - now;
        expect(delay).toBeGreaterThanOrEqual([60000, 300000, 900000][number - 1]);
        expect(delay).toBeLessThanOrEqual([60000, 300000, 900000][number - 1] + 30000);
        await s.dispatch(); expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(number);
        vi.setSystemTime(row!.nextAttemptAt!);
      } else expect(row?.nextAttemptAt).toBeUndefined();
    }
    await s.t.mutation(internal.operationalEmailDelivery.recover, {}); await s.dispatch();
    expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(4);
    expect((await s.row())?.attempts).toHaveLength(4);
  });

  it("permits bounded recovery after a definite failure before the send stage", async () => {
    const s = await setup(); const claim = await s.t.mutation(internal.operationalEmailDelivery.claim, { deliveryId: s.id });
    await s.t.mutation(internal.operationalEmailDelivery.finish, { deliveryId: s.id, attemptNumber: claim!.attemptNumber,
      outcome: { status: "failed", category: "pre_send_unavailable" } });
    expect(deliverJobAssignedEmail).not.toHaveBeenCalled();
    vi.setSystemTime((await s.row())!.nextAttemptAt!); await s.dispatch();
    expect(await s.row()).toMatchObject({ state: "provider_accepted", attemptCount: 2 });
  });

  it("classifies an eligibility-query outage before any provider call as safely retryable", async () => {
    const s = await setup();
    const query = vi.spyOn(assignmentEmailState as unknown as { _handler: (...args: unknown[]) => Promise<unknown> }, "_handler")
      .mockRejectedValueOnce(new Error("query unavailable"));
    try { await s.dispatch(); } finally { query.mockRestore(); }
    expect(await s.row()).toMatchObject({ state: "failed", category: "pre_send_unavailable" });
    expect(deliverJobAssignedEmail).not.toHaveBeenCalled();
    vi.setSystemTime((await s.row())!.nextAttemptAt!); await s.dispatch();
    expect((await s.row())?.state).toBe("provider_accepted");
  });

  it("leaves provider acceptance followed by failed persistence for unknown recovery, never resend", async () => {
    const s = await setup();
    const finish = vi.spyOn(finishDelivery as unknown as { _handler: (...args: unknown[]) => Promise<unknown> }, "_handler")
      .mockRejectedValueOnce(new Error("persistence unavailable"));
    try { await expect(s.dispatch()).rejects.toThrow("persistence unavailable"); } finally { finish.mockRestore(); }
    expect(await s.row()).toMatchObject({ state: "claimed", attemptCount: 1, sendStartedAt: NOW });
    vi.setSystemTime(NOW + EMAIL_CLAIM_MS); await s.t.mutation(internal.operationalEmailDelivery.recover, {}); await s.dispatch();
    expect(await s.row()).toMatchObject({ state: "unknown", category: "claim_expired" });
    expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(1);
  });

  it("executes a scheduled bounded retry and ignores the older claim watchdog", async () => {
    const s = await setup(); vi.mocked(deliverJobAssignedEmail).mockResolvedValueOnce({ status: "failed", category: "rate_limited" });
    await s.dispatch();
    await s.t.finishAllScheduledFunctions(() => { vi.runAllTimers(); });
    expect(await s.row()).toMatchObject({ state: "provider_accepted", attemptCount: 2 });
    expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(2);
  });

  it.each(["configuration", "provider_rejected"] as const)("does not automatically retry permanent %s failures", async category => {
    const s = await setup(); vi.mocked(deliverJobAssignedEmail).mockResolvedValue({ status: "failed", category });
    await s.dispatch(); vi.setSystemTime(NOW + 600000); await s.t.mutation(internal.operationalEmailDelivery.recover, {}); await s.dispatch();
    expect(await s.row()).toMatchObject({ state: "failed", category, attemptCount: 1 });
    expect((await s.row())?.nextAttemptAt).toBeUndefined(); expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(1);
  });

  it.each(["returned", "thrown"] as const)("never retries an ambiguous %s network outcome", async mode => {
    const s = await setup();
    if (mode === "returned") vi.mocked(deliverJobAssignedEmail).mockResolvedValue({ status: "unknown", category: "provider_uncertain" });
    else vi.mocked(deliverJobAssignedEmail).mockRejectedValue(new Error("timeout after provider acceptance: private@delivery.test"));
    const log = vi.spyOn(console, "error");
    try {
      await s.dispatch(); vi.setSystemTime(NOW + 600000); await s.t.mutation(internal.operationalEmailDelivery.recover, {}); await s.dispatch();
      expect(await s.row()).toMatchObject({ state: "unknown", category: "provider_uncertain", attemptCount: 1 });
      expect((await s.row())?.nextAttemptAt).toBeUndefined(); expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(1); expect(log).not.toHaveBeenCalled();
      expect(JSON.stringify(await s.row())).not.toContain("private@");
    } finally { log.mockRestore(); }
  });

  it("expires a crashed in-flight claim to unknown and fences a delayed beginSend", async () => {
    const s = await setup(); await s.t.mutation(internal.operationalEmailDelivery.claim, { deliveryId: s.id });
    vi.setSystemTime(NOW + EMAIL_CLAIM_MS);
    expect(await s.t.mutation(internal.operationalEmailDelivery.beginSend, { deliveryId: s.id, attemptNumber: 1 })).toBe(false);
    await s.t.mutation(internal.operationalEmailDelivery.recover, {}); await s.dispatch();
    expect(await s.row()).toMatchObject({ state: "unknown", category: "claim_expired", attemptCount: 1 });
    expect(deliverJobAssignedEmail).not.toHaveBeenCalled();
    await s.t.mutation(internal.operationalEmailDelivery.finish, { deliveryId: s.id, attemptNumber: 1, outcome: { status: "failed", category: "rate_limited" } });
    expect((await s.row())?.state).toBe("unknown");
    await s.t.mutation(internal.operationalEmailDelivery.finish, { deliveryId: s.id, attemptNumber: 1, outcome: { status: "provider_accepted", providerMessageId: "late-proof" } });
    expect(await s.row()).toMatchObject({ state: "provider_accepted", providerMessageId: "late-proof", attemptCount: 1 });
  });

  it("does not turn an overdue unfinished claim into retryable failure when its watchdog is delayed", async () => {
    const s = await setup(); await s.t.mutation(internal.operationalEmailDelivery.claim, { deliveryId: s.id });
    vi.setSystemTime(NOW + EMAIL_CLAIM_MS + 1);
    await s.t.mutation(internal.operationalEmailDelivery.finish, { deliveryId: s.id, attemptNumber: 1, outcome: { status: "failed", category: "pre_send_unavailable" } });
    expect(await s.row()).toMatchObject({ state: "unknown", category: "claim_expired" });
  });

  it.each(["inactive", "removed", "foreign-worker", "foreign-job", "cancelled", "superseded", "profile-inactive", "profile-archived", "duplicate-profile", "foreign-profile"] as const)("revalidates %s between attempts", async change => {
    const s = await setup(); vi.mocked(deliverJobAssignedEmail).mockResolvedValueOnce({ status: "failed", category: "rate_limited" });
    await s.dispatch(); const next = (await s.row())!.nextAttemptAt!;
    await s.t.run(async ctx => {
      if (change === "inactive") await ctx.db.patch(s.worker, { status: "inactive" });
      if (change.startsWith("profile-") || change === "duplicate-profile" || change === "foreign-profile") {
        const profile = { companyId: change === "foreign-profile" ? s.foreignCompany : s.companyId, userId: s.worker, workerType: "w2_employee" as const, workerStatus: change === "profile-inactive" ? "inactive" as const : change === "profile-archived" ? "archived" as const : "active" as const, primaryRole: "cleaner" as const, eligibleRoles: ["cleaner" as const], onboardingStatus: "complete" as const, jobEligibilityStatus: "eligible" as const, createdAt: NOW, updatedAt: NOW };
        await ctx.db.insert("workerProfiles", profile);
        if (change === "duplicate-profile") await ctx.db.insert("workerProfiles", profile);
      }
      if (change === "foreign-worker") await ctx.db.patch(s.worker, { companyId: s.foreignCompany });
      if (change === "foreign-job") await ctx.db.patch(s.job, { companyId: s.foreignCompany });
      if (change === "removed") { await ctx.db.patch(s.job, { cleanerIds: [] }); const m = await ctx.db.query("teamMembers").withIndex("by_teamId_userId", q => q.eq("teamId", s.team).eq("userId", s.worker)).unique(); await ctx.db.patch(m!._id, { active: false }); }
      if (change === "cancelled") await ctx.db.patch(s.job, { status: "cancelled" });
      if (change === "superseded") await ctx.db.patch(s.job, { assignmentRevision: 2 });
    });
    vi.setSystemTime(next); await s.dispatch();
    expect(await s.row()).toMatchObject({ state: "skipped", category: "ineligible", attemptCount: 2 });
    expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(1);
  });

  it("resolves fresh recipient details on retry", async () => {
    const s = await setup(); vi.mocked(deliverJobAssignedEmail).mockResolvedValueOnce({ status: "failed", category: "rate_limited" });
    await s.dispatch(); const next = (await s.row())!.nextAttemptAt!;
    await s.t.run(ctx => ctx.db.patch(s.worker, { email: "changed@delivery.test" }));
    vi.setSystemTime(next); await s.dispatch();
    expect(vi.mocked(deliverJobAssignedEmail).mock.calls[1][0]).toBe("changed@delivery.test");
  });

  it("persists completion before scheduling and keeps rapid approval relevant with separate event identities", async () => {
    const s = await setup();
    const form = await s.t.run(async ctx => { await ctx.db.patch(s.job, { status: "in_progress", startedAt: NOW }); return ctx.db.insert("forms", { companyId: s.companyId, jobId: s.job, cleanerId: s.worker, status: "in_progress" }); });
    const submitArgs = { ...s.auth("worker"), formId: form, performedWorkerIds: [s.worker] };
    await s.t.mutation(api.mutations.forms.submit, submitArgs); await s.t.mutation(api.mutations.forms.submit, submitArgs);
    await s.t.mutation(api.mutations.forms.approve, { ...s.auth(), formId: form });
    await s.t.mutation(api.mutations.forms.approve, { ...s.auth(), formId: form });
    const completed = (await s.rows()).filter(row => row.event.kind === "completion");
    const approvals = (await s.rows()).filter(row => row.event.kind === "approval");
    expect(completed).toHaveLength(1); expect(approvals).toHaveLength(2);
    for (const row of [...completed, ...approvals]) await s.t.action(internal.operationalEmailActions.dispatch, { deliveryId: row._id });
    expect(deliverJobCompletedEmail).toHaveBeenCalledTimes(1); expect(deliverJobApprovedEmail).toHaveBeenCalledTimes(2);
  });

  it.each(["pending", "rejected", "malformed"] as const)("suppresses a shared-copy retry after %s state", async status => {
    const s = await setup();
    const share = await s.t.run(async ctx => {
      const original = await ctx.db.insert("jobs", { companyId: s.foreignCompany, cleanerIds: [], type: "standard", status: "scheduled", scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0 });
      await ctx.db.patch(s.job, { sharedFromJobId: original, sharedFromCompanyName: "Partner", propertyId: undefined,
        propertySnapshot: { name: "Shared safe snapshot", address: "Synthetic", type: "residential" } });
      return ctx.db.insert("sharedJobs", { originalJobId: original, copiedJobId: s.job, fromCompanyId: s.foreignCompany, toCompanyId: s.companyId, sharePackage: false, status: "accepted" });
    });
    vi.mocked(deliverJobAssignedEmail).mockResolvedValueOnce({ status: "failed", category: "rate_limited" });
    await s.dispatch(); const next = (await s.row())!.nextAttemptAt!;
    await s.t.run(ctx => ctx.db.patch(share, status === "malformed" ? { toCompanyId: s.foreignCompany } : { status }));
    vi.setSystemTime(next); await s.dispatch();
    expect((await s.row())?.state).toBe("skipped"); expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(1);
  });

  it("recovers unscheduled pending work once, expires old work and never scans historical jobs", async () => {
    const s = await setup(); await s.t.mutation(internal.operationalEmailDelivery.recover, {});
    expect(await s.scheduled()).toHaveLength(1);
    await s.t.mutation(internal.operationalEmailDelivery.recover, {}); expect(await s.scheduled()).toHaveLength(1);
    vi.setSystemTime(NOW + EMAIL_RECOVERY_WINDOW_MS); await s.t.mutation(internal.operationalEmailDelivery.recover, {});
    expect(await s.row()).toMatchObject({ state: "skipped", category: "retry_window_expired", attemptCount: 0 });
    expect(await s.rows()).toHaveLength(1); expect(deliverJobAssignedEmail).not.toHaveBeenCalled();
  });

  it("bounds each recovery selection", async () => {
    const s = await setup();
    await s.t.run(async ctx => { for (let revision = 2; revision <= EMAIL_RECOVERY_BATCH + 10; revision++) await ensureOperationalEmail(ctx, { ...s.event, revision }); });
    await s.t.mutation(internal.operationalEmailDelivery.recover, {});
    expect(await s.scheduled()).toHaveLength(EMAIL_RECOVERY_BATCH);
  });

  it("exposes only sanitized paginated metadata to verified owners in their own tenant", async () => {
    const s = await setup(); await s.dispatch();
    const args = { ...s.auth(), paginationOpts: { numItems: 10, cursor: null } };
    const result = await s.t.query(api.operationalEmailDelivery.listForOwner, args);
    expect(result.page).toHaveLength(1); expect(result.page[0]).toMatchObject({ id: s.id, state: "provider_accepted", attemptCount: 1 });
    const json = JSON.stringify(result); for (const value of ["Private property", "Private address", "@delivery.test", "emailBody", "passwordHash"]) expect(json).not.toContain(value);
    for (const name of ["worker", "manager"] as const) await expect(s.t.query(api.operationalEmailDelivery.listForOwner, { ...args, ...s.auth(name) })).rejects.toThrow();
    expect((await s.t.query(api.operationalEmailDelivery.listForOwner, { ...args, ...s.auth("foreignOwner") })).page).toEqual([]);
    await expect(s.t.query(api.operationalEmailDelivery.listForOwner, { ...args, sessionToken: "invalid" })).rejects.toThrow();
    await expect(s.t.query(api.operationalEmailDelivery.listForOwner, { ...args, paginationOpts: { numItems: 51, cursor: null } })).rejects.toThrow();
    await s.t.run(ctx => ctx.db.patch(s.owner, { status: "inactive" }));
    await expect(s.t.query(api.operationalEmailDelivery.listForOwner, args)).rejects.toThrow();
  });
});
