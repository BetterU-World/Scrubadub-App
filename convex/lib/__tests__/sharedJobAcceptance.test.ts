import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashToken } from "../tokens";
import { SHARED_JOB_PENDING, SHARED_JOB_REJECTED, SHARED_JOB_REVIEW } from "../sharedJobAuthorization";
const modules = import.meta.glob("../../**/*.ts");
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

async function setup(progress = true) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const a = await ctx.db.insert("companies", { name: "Synthetic A", timezone: "UTC" });
    const b = await ctx.db.insert("companies", { name: "Synthetic B", timezone: "UTC" });
    const makeUser = async (name: string, role: "owner" | "manager" | "cleaner", companyId = b) => { const id = await ctx.db.insert("users", {
      companyId, name, role, email: `${name}@acceptance.test`, passwordHash: "unused", status: "active",
      canCreateJobs: role === "manager", canAssignCleaners: role === "manager", canApproveForms: role === "manager",
      canRequestRework: role === "manager", canSeeAllJobs: role === "manager", canResolveRedFlags: role === "manager",
    });
    await ctx.db.insert("authSessions", { principalType: "staff", userId: id, tokenHash: hashToken(name), version: 1, createdAt: Date.now(), lastUsedAt: Date.now(), expiresAt: Date.now() + 3600000, idleExpiresAt: Date.now() + 3600000 });
    return id; };
    const origin = await makeUser("origin", "owner", a), owner = await makeUser("owner", "owner");
    const manager = await makeUser("manager", "manager"), worker = await makeUser("worker", "cleaner");
    const connection = await ctx.db.insert("ownerConnections", { companyAId: a, companyBId: b, status: "active", createdAt: Date.now() });
    const property = await ctx.db.insert("properties", { companyId: a, name: "Synthetic", type: "residential", address: "Test only", amenities: [], active: true });
    const original = await ctx.db.insert("jobs", { companyId: a, propertyId: property, cleanerIds: [], type: "standard", status: "scheduled", scheduledDate: "2026-11-05", durationMinutes: 60, reworkCount: 0 });
    const team = await ctx.db.insert("teams", { companyId: b, name: "Synthetic team", active: true, createdBy: owner, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("teamMembers", { companyId: b, teamId: team, userId: worker, role: "lead", active: true, addedAt: 1 });
    return { a, b, origin, owner, manager, worker, connection, property, original, team };
  });
  // Seed verified sessions like the existing attachment/ledger suites; every handler still resolves its real session and role.
  const login = async (name: "origin" | "owner" | "worker" | "manager") => ({ userId: ids[name], sessionToken: name });
  const origin = await login("origin"), owner = await login("owner"), worker = await login("worker"), manager = await login("manager");
  const share = await t.mutation(api.mutations.partners.shareJob, { ...origin, jobId: ids.original, toCompanyId: ids.b, sharePackage: true });
  const evidence = await t.run(async ctx => {
    // Deliberately inconsistent historical state exercises every independent entry point.
    if (progress) await ctx.db.patch(share.copiedJobId, { cleanerIds: [ids.worker], assignedManagerId: ids.owner, status: "in_progress",
      startedAt: 1, inventoryChecklist: [{ name: "Soap", category: "bathroom", parLevel: 1, required: true }] });
    const form = progress ? await ctx.db.insert("forms", { jobId: share.copiedJobId, companyId: ids.b, cleanerId: ids.worker, status: "in_progress" }) : null;
    const item = form ? await ctx.db.insert("formItems", { formId: form, section: "Kitchen", itemName: "Sink", completed: false, isRedFlag: false, order: 0 }) : null;
    const storage = await ctx.storage.store(new Blob(["synthetic"], { type: "image/jpeg" }));
    const intent = await ctx.db.insert("attachmentUploadIntents", { userId: ids.worker, companyId: ids.b, targetKey: `formPhoto:${form}`, nonce: "synthetic", mimeType: "image/jpeg", status: "pending", createdAt: 1, expiresAt: Date.now() + 10000 });
    const flag = progress ? await ctx.db.insert("redFlags", { companyId: ids.b, propertyId: ids.property, jobId: share.copiedJobId, category: "damage", severity: "low", note: "Synthetic historical flag", status: "open" }) : null;
    return { form, item, storage, intent, flag };
  });
  const snapshot = () => t.run(async ctx => {
    const result: Record<string, unknown> = {};
    for (const table of ["jobs", "forms", "formItems", "sharedJobs", "notifications", "auditLog", "managerInspections", "redFlags", "attachmentUploadIntents", "outgoingTerms", "outgoingObligations", "outgoingEvents", "outgoingSettlements", "outgoingSettlementAllocations", "servicePriceOffers"] as const) result[table] = await ctx.db.query(table).collect();
    result.scheduled = await ctx.db.system.query("_scheduled_functions").collect();
    return result;
  });
  return { t, ...ids, ...share, ...evidence, ownerAuth: owner, originAuth: origin, workerAuth: worker, managerAuth: manager, snapshot };
}
type S = Awaited<ReturnType<typeof setup>>;
const jobArgs = (s: S) => ({ ...s.workerAuth, jobId: s.copiedJobId });
const ownerArgs = (s: S) => ({ ...s.ownerAuth, jobId: s.copiedJobId });
const formArgs = (s: S) => ({ ...s.workerAuth, formId: s.form! });
const cases: [string, (s: S) => Promise<unknown>][] = [
  ["reshare", s => s.t.mutation(api.mutations.partners.shareJob, { ...s.ownerAuth, jobId: s.copiedJobId, toCompanyId: s.a, sharePackage: false })],
  ["jobs.update individual assignment", s => s.t.mutation(api.mutations.jobs.update, { ...ownerArgs(s), cleanerIds: [s.worker] })],
  ["jobs.update team assignment", s => s.t.mutation(api.mutations.jobs.update, { ...s.managerAuth, jobId: s.copiedJobId, assignedTeamId: s.team })],
  ["jobs.update Owner self-assignment", s => s.t.mutation(api.mutations.jobs.update, { ...ownerArgs(s), assignedManagerId: s.owner })],
  ["jobs.update notes", s => s.t.mutation(api.mutations.jobs.update, { ...ownerArgs(s), notes: "blocked" })],
  ["reassignJob", s => s.t.mutation(api.mutations.jobs.reassignJob, { ...ownerArgs(s), newCleanerId: s.worker })],
  ["worker accept", s => s.t.mutation(api.mutations.jobs.acceptJob, jobArgs(s))],
  ["worker deny", s => s.t.mutation(api.mutations.jobs.denyJob, jobArgs(s))],
  ["worker cancel", s => s.t.mutation(api.mutations.jobs.cleanerCancelJob, jobArgs(s))],
  ["arrival", s => s.t.mutation(api.mutations.jobs.arriveJob, jobArgs(s))],
  ["start", s => s.t.mutation(api.mutations.jobs.startJob, jobArgs(s))],
  ["pause", s => s.t.mutation(api.mutations.jobs.pauseJob, { ...jobArgs(s), reason: "other", note: "test" })],
  ["resume", s => s.t.mutation(api.mutations.jobs.resumeJob, jobArgs(s))],
  ["Owner start", s => s.t.mutation(api.mutations.jobs.ownerStartJob, ownerArgs(s))],
  ["Owner pause", s => s.t.mutation(api.mutations.jobs.ownerPauseJob, { ...ownerArgs(s), reason: "other", note: "test" })],
  ["Owner resume", s => s.t.mutation(api.mutations.jobs.ownerResumeJob, ownerArgs(s))],
  ["Owner complete", s => s.t.mutation(api.mutations.jobs.ownerCompleteJob, { ...ownerArgs(s), performedWorkerIds: [s.owner] })],
  ["cancel job", s => s.t.mutation(api.mutations.jobs.cancel, { ...ownerArgs(s), reason: "other", notes: "test" })],
  ["form creation", s => s.t.mutation(api.mutations.forms.createFromTemplate, { cleanerId: s.worker, sessionToken: s.workerAuth.sessionToken, companyId: s.b, jobId: s.copiedJobId })],
  ["task update", s => s.t.mutation(api.mutations.forms.updateItem, { ...s.workerAuth, itemId: s.item!, completed: true })],
  ["score", s => s.t.mutation(api.mutations.forms.updateScore, { ...formArgs(s), cleanerScore: 8 })],
  ["Fast Mode", s => s.t.mutation(api.mutations.forms.confirmSection, { ...formArgs(s), section: "Kitchen" })],
  ["legacy markAllComplete", s => s.t.mutation(api.mutations.forms.markAllComplete, formArgs(s))],
  ["inventory", s => s.t.mutation(api.mutations.jobs.updateInventoryChecklistItem, { ...jobArgs(s), itemName: "Soap", status: "ok" })],
  ["photo attach", s => s.t.mutation(api.mutations.forms.addPhoto, { ...formArgs(s), photoStorageId: s.storage, uploadIntentId: s.intent })],
  ["photo upload", s => s.t.mutation(api.attachmentUploads.begin, { sessionToken: s.workerAuth.sessionToken, target: { kind: "formPhoto", formId: s.form! }, mimeType: "image/jpeg" })],
  ["item photo upload", s => s.t.mutation(api.attachmentUploads.begin, { sessionToken: s.workerAuth.sessionToken, target: { kind: "formItemPhoto", itemId: s.item! }, mimeType: "image/jpeg" })],
  ["inspection upload", s => s.t.mutation(api.attachmentUploads.begin, { sessionToken: s.managerAuth.sessionToken, target: { kind: "inspectionPhoto", jobId: s.copiedJobId }, mimeType: "image/jpeg" })],
  ["red flag upload", s => s.t.mutation(api.attachmentUploads.begin, { sessionToken: s.workerAuth.sessionToken, target: { kind: "redFlagPhoto", jobId: s.copiedJobId }, mimeType: "image/jpeg" })],
  ["inspection", s => s.t.mutation(api.mutations.inspections.submit, { ...s.managerAuth, jobId: s.copiedJobId, readinessScore: 8, severity: "none" })],
  ["reinspection", s => s.t.mutation(api.mutations.inspections.reopenInspection, ownerArgs(s))],
  ["Owner inspection", s => s.t.mutation(api.mutations.jobs.ownerSubmitInspection, { ...ownerArgs(s), readinessScore: 8, severity: "none" })],
  ["red flag", s => s.t.mutation(api.mutations.redFlags.create, { ...s.workerAuth, companyId: s.b, jobId: s.copiedJobId, propertyId: s.property, category: "damage", severity: "low", note: "test" })],
  ["form submit", s => s.t.mutation(api.mutations.forms.submit, { ...formArgs(s), performedWorkerIds: [s.worker] })],
  ["job complete", s => s.t.mutation(api.mutations.jobs.completeJob, { ...jobArgs(s), performedWorkerIds: [s.worker] })],
  ["approval", s => s.t.mutation(api.mutations.forms.approve, { ...s.ownerAuth, formId: s.form! })],
  ["rework", s => s.t.mutation(api.mutations.forms.requestRework, { ...s.managerAuth, formId: s.form!, notes: "test" })],
  ["worker compensation", s => s.t.mutation(api.workerCompensation.reviewCompensation, { ...ownerArgs(s), workerId: s.worker, amountCents: 1000, reason: "test" })],
  ["red flag status", s => s.t.mutation(api.mutations.redFlags.updateStatus, { ...s.ownerAuth, flagId: s.flag!, status: "in_progress" })],
  ["manager red flag resolve", s => s.t.mutation(api.mutations.redFlags.managerResolveRedFlag, { ...s.managerAuth, flagId: s.flag! })],
  ["manager red flag lifecycle", s => s.t.mutation(api.mutations.redFlags.managerUpdateLifecycle, { ...s.managerAuth, flagId: s.flag!, status: "in_progress" })],
  ["red flag maintenance creation", s => s.t.mutation(api.mutations.redFlags.createMaintenanceJob, { ...s.ownerAuth, flagId: s.flag!, scheduledDate: "2026-11-05", cleanerIds: [] })],
  ["generic worker financial terms", s => s.t.mutation(api.outgoingMutations.createDraftTerms, { ...s.ownerAuth, source: { type: "worker_job", jobId: s.copiedJobId }, currency: "USD", lines: [{ lineId: "synthetic", recipient: { type: "worker", userId: s.worker }, amountCents: 1000, basis: "Synthetic" }] })],
  ["historical worker confirmation", s => s.t.mutation(api.workerCompensation.confirmHistoricalWorkers, { ...ownerArgs(s), performedWorkerIds: [s.worker] })],
];

describe("shared-work acceptance enforcement", () => {
  it.each(cases)("Pending denies %s with no operational or financial side effects", async (_name, call) => {
    const s = await setup(); const before = await s.snapshot();
    await expect(call(s)).rejects.toThrow(SHARED_JOB_REVIEW);
    expect(await s.snapshot()).toEqual(before);
  });
  it.each(cases)("Rejected denies %s with evidence unchanged", async (_name, call) => {
    const s = await setup(); await s.t.run(ctx => ctx.db.patch(s.sharedJobId, { status: "rejected" }));
    const before = await s.snapshot(); await expect(call(s)).rejects.toThrow(SHARED_JOB_REJECTED);
    expect(await s.snapshot()).toEqual(before);
  });
  it.each(["missing bridge", "missing marker", "foreign original", "duplicate bridge", "wrong recipient"])("fails closed for %s", async variant => {
    const s = await setup();
    await s.t.run(async ctx => {
      if (variant === "missing bridge") await ctx.db.delete(s.sharedJobId);
      if (variant === "missing marker") await ctx.db.patch(s.copiedJobId, { sharedFromJobId: undefined, sharedFromCompanyName: undefined });
      if (variant === "foreign original") await ctx.db.patch(s.original, { companyId: s.b });
      if (variant === "wrong recipient") await ctx.db.patch(s.sharedJobId, { toCompanyId: s.a });
      if (variant === "duplicate bridge") { const row = await ctx.db.get(s.sharedJobId); const { _id, _creationTime, ...fields } = row!; await ctx.db.insert("sharedJobs", fields); }
    });
    const before = await s.snapshot(); await expect(cases[0][1](s)).rejects.toThrow(SHARED_JOB_REVIEW); expect(await s.snapshot()).toEqual(before);
    expect((await s.t.query(api.queries.jobs.get, ownerArgs(s)))?.sharedWorkAccess).toEqual({ allowed: false, status: "manual_review" });
  });
  it.each(["accept", "reject"])("preserves inconsistent evidence on late %s", async action => {
    const s = await setup(); const before = await s.snapshot();
    await expect(s.t.mutation(action === "accept" ? api.mutations.partners.acceptSharedJob : api.mutations.partners.rejectSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId })).rejects.toThrow(SHARED_JOB_REVIEW);
    expect(await s.snapshot()).toEqual(before);
  });
  it("does not accept a cancelled copy", async () => {
    const s = await setup(false); await s.t.run(ctx => ctx.db.patch(s.copiedJobId, { status: "cancelled" }));
    const before = await s.snapshot(); await expect(s.t.mutation(api.mutations.partners.acceptSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId })).rejects.toThrow(SHARED_JOB_REVIEW); expect(await s.snapshot()).toEqual(before);
  });
  it("rejects untouched Pending copies and blocks repeat responses", async () => {
    const s = await setup(false); await s.t.mutation(api.mutations.partners.rejectSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId });
    expect(await s.t.run(ctx => ctx.db.get(s.copiedJobId))).toMatchObject({ status: "cancelled", cancelledBy: s.owner });
    const before = await s.snapshot(); await expect(s.t.mutation(api.mutations.partners.acceptSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId })).rejects.toThrow("not pending"); expect(await s.snapshot()).toEqual(before);
  });
  it("disconnect invalidates untouched requests in both directions but preserves inconsistent evidence", async () => {
    const s = await setup(false);
    const recipientOriginal = await s.t.run(ctx => ctx.db.insert("jobs", { companyId: s.b, cleanerIds: [], type: "standard", status: "scheduled", scheduledDate: "2026-11-05", durationMinutes: 60, reworkCount: 0 }));
    const back = await s.t.mutation(api.mutations.partners.shareJob, { ...s.ownerAuth, jobId: recipientOriginal, toCompanyId: s.a, sharePackage: false });
    const progressed = await s.t.run(async ctx => {
      const original = await ctx.db.get(s.original); const { _id, _creationTime, ...fields } = original!; const id = await ctx.db.insert("jobs", fields); return id;
    });
    const other = await s.t.mutation(api.mutations.partners.shareJob, { ...s.originAuth, jobId: progressed, toCompanyId: s.b, sharePackage: false });
    await s.t.run(ctx => ctx.db.patch(other.copiedJobId, { status: "in_progress", startedAt: 1 }));
    const prior = await s.t.run(ctx => ctx.db.get(other.copiedJobId));
    const result = await s.t.mutation(api.mutations.partners.disconnectConnection, { ...s.originAuth, connectionId: s.connection });
    expect(result.invalidatedCount).toBe(2); expect(result.manualReviewSharedJobIds).toEqual([String(other.sharedJobId)]);
    expect(await s.t.run(ctx => ctx.db.get(other.copiedJobId))).toEqual(prior);
    expect((await s.t.run(ctx => ctx.db.get(back.sharedJobId)))?.status).toBe("rejected");
    expect((await s.t.run(ctx => ctx.db.get(s.sharedJobId)))?.status).toBe("rejected");
    expect((await s.t.run(ctx => ctx.db.query("auditLog").collect())).some(row => row.action === "shared_job_manual_review_required")).toBe(true);
    await expect(s.t.mutation(api.mutations.partners.acceptSharedJob, { ...s.ownerAuth, sharedJobId: other.sharedJobId })).rejects.toThrow(SHARED_JOB_REVIEW);
    await expect(s.t.mutation(api.mutations.partners.shareJob, { ...s.originAuth, jobId: s.original, toCompanyId: s.b, sharePackage: false })).rejects.toThrow("Not connected");
  });
  it("accepted work survives disconnect and completes/reworks with safe duplicate submission", async () => {
    const s = await setup(false);
    await s.t.mutation(api.mutations.partners.acceptSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId });
    await s.t.mutation(api.mutations.partners.disconnectConnection, { ...s.ownerAuth, connectionId: s.connection });
    await s.t.mutation(api.mutations.jobs.reassignJob, { ...ownerArgs(s), newCleanerId: s.worker });
    await s.t.mutation(api.mutations.jobs.acceptJob, jobArgs(s)); await s.t.mutation(api.mutations.jobs.startJob, jobArgs(s));
    const f = await s.t.run(ctx => ctx.db.query("forms").withIndex("by_jobId", q => q.eq("jobId", s.copiedJobId)).first());
    const items = await s.t.run(ctx => ctx.db.query("formItems").withIndex("by_formId", q => q.eq("formId", f!._id)).collect());
    for (const item of items) await s.t.mutation(api.mutations.forms.updateItem, { ...s.workerAuth, itemId: item._id, completed: true });
    const submit = () => s.t.mutation(api.mutations.forms.submit, { ...s.workerAuth, formId: f!._id, performedWorkerIds: [s.worker] });
    await submit(); expect(await submit()).toMatchObject({ alreadySubmitted: true });
    await s.t.mutation(api.mutations.forms.requestRework, { ...s.ownerAuth, formId: f!._id, notes: "Synthetic correction" });
    await s.t.mutation(api.mutations.jobs.startJob, jobArgs(s)); await submit();
    await s.t.mutation(api.mutations.forms.approve, { ...s.managerAuth, formId: f!._id });
    expect((await s.t.run(ctx => ctx.db.get(s.sharedJobId)))?.status).toBe("completed");
    const debt = await s.t.mutation(api.workerCompensation.reviewCompensation, { ...ownerArgs(s), workerId: s.worker, amountCents: 1000, reason: "Synthetic approved work" });
    expect(await s.t.mutation(api.workerCompensation.reviewCompensation, { ...ownerArgs(s), workerId: s.worker, amountCents: 1000, reason: "Synthetic approved work" })).toBe(debt);
    // Existing frozen financial retry remains available even if mutable linkage is later inconsistent.
    await s.t.run(ctx => ctx.db.patch(s.sharedJobId, { status: "pending" }));
    expect(await s.t.mutation(api.workerCompensation.reviewCompensation, { ...ownerArgs(s), workerId: s.worker, amountCents: 1000, reason: "Synthetic approved work" })).toBe(debt);
  });
  it("retains session, company and delegated assignment restrictions", async () => {
    const s = await setup(false); await s.t.mutation(api.mutations.partners.acceptSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId });
    const before = await s.snapshot();
    await expect(s.t.mutation(api.mutations.jobs.reassignJob, { ...s.originAuth, jobId: s.copiedJobId, newCleanerId: s.worker })).rejects.toThrow("Not your company");
    await expect(s.t.mutation(api.mutations.jobs.update, { ...s.ownerAuth, sessionToken: "invalid", jobId: s.copiedJobId, cleanerIds: [s.worker] })).rejects.toThrow();
    await s.t.run(ctx => ctx.db.patch(s.manager, { canAssignCleaners: false }));
    await expect(s.t.mutation(api.mutations.jobs.update, { ...s.managerAuth, jobId: s.copiedJobId, cleanerIds: [s.worker] })).rejects.toThrow("assignment permission");
    expect(await s.snapshot()).toEqual(before);
  });
  it("does not mutate non-shared jobs differently and keeps normal submission checks", async () => {
    const s = await setup();
    await s.t.run(async ctx => { await ctx.db.delete(s.sharedJobId); await ctx.db.patch(s.copiedJobId, { sharedFromJobId: undefined, sharedFromCompanyName: undefined }); });
    await expect(s.t.mutation(api.mutations.forms.submit, { ...formArgs(s), performedWorkerIds: [s.worker] })).rejects.toThrow("not completed");
    await s.t.mutation(api.mutations.forms.updateItem, { ...s.workerAuth, itemId: s.item!, completed: true });
    await expect(s.t.mutation(api.mutations.forms.submit, { ...formArgs(s), performedWorkerIds: [s.worker] })).rejects.toThrow("inventory");
    await s.t.mutation(api.mutations.jobs.updateInventoryChecklistItem, { ...jobArgs(s), itemName: "Soap", status: "low" });
    await s.t.mutation(api.mutations.forms.submit, { ...formArgs(s), performedWorkerIds: [s.worker] });
    await s.t.mutation(api.mutations.forms.approve, { ...s.ownerAuth, formId: s.form! });
    expect((await s.t.run(ctx => ctx.db.get(s.copiedJobId)))?.status).toBe("approved");
  });
  it("serializes rejection versus assignment without allowing Pending execution", async () => {
    const s = await setup(false);
    const results = await Promise.allSettled([
      s.t.mutation(api.mutations.partners.rejectSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId }),
      s.t.mutation(api.mutations.jobs.update, { ...ownerArgs(s), cleanerIds: [s.worker] }),
    ]);
    expect(results[0].status).toBe("fulfilled"); expect(results[1].status).toBe("rejected");
    expect(await s.t.run(ctx => ctx.db.get(s.copiedJobId))).toMatchObject({ status: "cancelled", cleanerIds: [] });
  });
  it("revoked sessions cannot use an accepted copy", async () => {
    const s = await setup(false); await s.t.mutation(api.mutations.partners.acceptSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId });
    await s.t.run(async ctx => { for (const session of await ctx.db.query("authSessions").collect()) if (session.userId === s.owner) await ctx.db.patch(session._id, { revokedAt: Date.now() }); });
    const before = await s.snapshot(); await expect(cases[1][1](s)).rejects.toThrow("verified session"); expect(await s.snapshot()).toEqual(before);
  });

  it.each([0, 1, 2, 3, 4, 5])("untouched Pending rejects assignment/edit/reshare path %s without writes", async index => {
    const s = await setup(false); const before = await s.snapshot();
    await expect(cases[index][1](s)).rejects.toThrow(SHARED_JOB_PENDING);
    expect(await s.snapshot()).toEqual(before);
    expect((await s.t.query(api.queries.jobs.get, ownerArgs(s)))?.sharedWorkAccess).toEqual({ allowed: false, status: "pending" });
  });
  it("accepted shared Fast Mode remains an explicit section confirmation", async () => {
    const s = await setup(false); await s.t.mutation(api.mutations.partners.acceptSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId });
    await s.t.mutation(api.mutations.jobs.reassignJob, { ...ownerArgs(s), newCleanerId: s.worker });
    await s.t.mutation(api.mutations.jobs.acceptJob, jobArgs(s)); await s.t.mutation(api.mutations.jobs.startJob, jobArgs(s));
    await s.t.mutation(api.mutations.workers.setFastModeEligibility, { ...s.ownerAuth, workerUserId: s.worker, eligible: true });
    const f = await s.t.run(ctx => ctx.db.query("forms").withIndex("by_jobId", q => q.eq("jobId", s.copiedJobId)).first());
    const items = await s.t.run(ctx => ctx.db.query("formItems").withIndex("by_formId", q => q.eq("formId", f!._id)).collect());
    const result = await s.t.mutation(api.mutations.forms.confirmSection, { ...s.workerAuth, formId: f!._id, section: items[0].section });
    expect(result.completedCount).toBe(items.filter(item => item.section === items[0].section).length);
  });

  it.each(["pending", "rejected"] as const)("denies independent customer-price metadata mutations on %s work", async status => {
    const s = await setup(false);
    await s.t.run(async ctx => {
      const relationship = await ctx.db.insert("clientRelationships", { companyId: s.b, displayName: "Synthetic client", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
      await ctx.db.patch(s.copiedJobId, { clientRelationshipId: relationship });
      await ctx.db.patch(s.sharedJobId, { status });
    });
    const before = await s.snapshot();
    const error = status === "pending" ? SHARED_JOB_PENDING : SHARED_JOB_REJECTED;
    await expect(s.t.mutation(api.mutations.servicePriceOffers.issue, { ...ownerArgs(s), expectedRevision: 0, baseChargeCents: 1000, addOns: [] })).rejects.toThrow(error);
    await expect(s.t.mutation(api.mutations.servicePriceOffers.markNoCharge, { ...ownerArgs(s), expectedRevision: 0, reason: "complimentary" })).rejects.toThrow(error);
    expect(await s.snapshot()).toEqual(before);
  });

  it("serializes acceptance against disconnection without leaving executable Pending work", async () => {
    const s = await setup(false);
    const results = await Promise.allSettled([
      s.t.mutation(api.mutations.partners.acceptSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId }),
      s.t.mutation(api.mutations.partners.disconnectConnection, { ...s.originAuth, connectionId: s.connection }),
    ]);
    expect(results[1].status).toBe("fulfilled");
    const share = await s.t.run(ctx => ctx.db.get(s.sharedJobId));
    expect(["accepted", "rejected"]).toContain(share!.status);
    if (share!.status === "accepted") {
      await s.t.mutation(api.mutations.jobs.reassignJob, { ...ownerArgs(s), newCleanerId: s.worker });
    } else {
      const before = await s.snapshot(); await expect(cases[1][1](s)).rejects.toThrow(SHARED_JOB_REJECTED); expect(await s.snapshot()).toEqual(before);
    }
  });
  it("guards existing unapproved worker terms at internal materialization too", async () => {
    const s = await setup(); await s.t.run(ctx => ctx.db.patch(s.sharedJobId, { status: "accepted" }));
    const termsId = await s.t.mutation(api.outgoingMutations.createDraftTerms, { ...s.ownerAuth, source: { type: "worker_job", jobId: s.copiedJobId }, currency: "USD", lines: [{ lineId: "synthetic", recipient: { type: "worker", userId: s.worker }, amountCents: 1000, basis: "Synthetic" }] });
    await s.t.run(ctx => ctx.db.patch(s.sharedJobId, { status: "pending" }));
    const before = await s.snapshot();
    await expect(s.t.mutation(internal.outgoingMutations.approveAndMaterialize, { termsId, approverUserId: s.owner, expectedRevision: 1 })).rejects.toThrow(SHARED_JOB_REVIEW);
    expect(await s.snapshot()).toEqual(before);
  });
  it("accepted Maintenance shared work executes and submits after disconnect", async () => {
    const s = await setup(false);
    await s.t.run(async ctx => { await ctx.db.patch(s.worker, { role: "maintenance" }); await ctx.db.patch(s.copiedJobId, { type: "maintenance" }); });
    await s.t.mutation(api.mutations.partners.acceptSharedJob, { ...s.ownerAuth, sharedJobId: s.sharedJobId });
    await s.t.mutation(api.mutations.partners.disconnectConnection, { ...s.ownerAuth, connectionId: s.connection });
    await s.t.mutation(api.mutations.jobs.reassignJob, { ...ownerArgs(s), newCleanerId: s.worker });
    await s.t.mutation(api.mutations.jobs.acceptJob, jobArgs(s)); await s.t.mutation(api.mutations.jobs.startJob, jobArgs(s));
    const form = await s.t.run(ctx => ctx.db.query("forms").withIndex("by_jobId", q => q.eq("jobId", s.copiedJobId)).first());
    const items = await s.t.run(ctx => ctx.db.query("formItems").withIndex("by_formId", q => q.eq("formId", form!._id)).collect());
    for (const item of items) await s.t.mutation(api.mutations.forms.updateItem, { ...s.workerAuth, itemId: item._id, completed: true });
    await s.t.mutation(api.mutations.forms.submit, { ...s.workerAuth, formId: form!._id, performedWorkerIds: [s.worker] });
    await s.t.mutation(api.mutations.forms.approve, { ...s.ownerAuth, formId: form!._id });
    expect((await s.t.run(ctx => ctx.db.get(s.sharedJobId)))?.status).toBe("completed");
  });

});
