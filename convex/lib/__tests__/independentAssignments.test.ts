import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.parse("2030-01-01T12:00:00Z");
beforeEach(() => { vi.useFakeTimers({ now: NOW }); vi.stubEnv("APP_URL", "http://localhost:5173"); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Independent", timezone: "UTC", subscriptionStatus: "active" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Foreign", timezone: "UTC" });
    const user = async (name: string, role: Doc<"users">["role"] = "cleaner", company = companyId, flags = {}) => {
      const id = await ctx.db.insert("users", { companyId: company, name, role, status: "active", email: `${name}@assign.test`, passwordHash: "unused", ...flags });
      await ctx.db.insert("authSessions", { principalType: "staff", userId: id, tokenHash: hashToken(name), version: 1, createdAt: NOW, lastUsedAt: NOW, expiresAt: NOW + 3600000, idleExpiresAt: NOW + 3600000 });
      return id;
    };
    const owner = await user("owner", "owner"), a = await user("a"), b = await user("b"), c = await user("c");
    const manager = await user("manager", "manager", companyId, { canCreateJobs: true, canAssignCleaners: true });
    const noAssign = await user("noAssign", "manager", companyId, { canCreateJobs: true });
    const noEdit = await user("noEdit", "manager", companyId, { canAssignCleaners: true });
    const foreign = await user("foreign", "cleaner", foreignCompany), foreignOwner = await user("foreignOwner", "owner", foreignCompany);
    const maintenance = await user("maintenance", "maintenance"), inactive = await user("inactive", "cleaner", companyId, { status: "inactive" });
    const team = await ctx.db.insert("teams", { companyId, name: "Team", active: true, createdBy: owner, createdAt: NOW, updatedAt: NOW });
    const emptyTeam = await ctx.db.insert("teams", { companyId, name: "Empty", active: true, createdBy: owner, createdAt: NOW, updatedAt: NOW });
    const foreignTeam = await ctx.db.insert("teams", { companyId: foreignCompany, name: "Foreign", active: true, createdBy: foreignOwner, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("teamMembers", { companyId, teamId: team, userId: a, role: "lead", active: true, addedAt: NOW });
    await ctx.db.insert("teamMembers", { companyId, teamId: team, userId: b, role: "member", active: true, addedAt: NOW });
    const property = await ctx.db.insert("properties", { companyId, name: "Place", address: "1 Main", type: "residential", active: true, amenities: [] });
    const job = await ctx.db.insert("jobs", { companyId, propertyId: property, cleanerIds: [a], type: "standard", status: "confirmed", acceptanceStatus: "accepted", acceptedAt: NOW - 1000, scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0 });
    return { companyId, foreignCompany, owner, a, b, c, manager, noAssign, noEdit, foreign, foreignOwner, maintenance, inactive, team, emptyTeam, foreignTeam, property, job };
  });
  const auth = (name: "owner" | "manager" | "noAssign" | "noEdit" | "a" | "foreignOwner" = "owner") => ({ userId: ids[name], sessionToken: name });
  const update = (edit: { cleanerIds?: Id<"users">[]; assignedTeamId?: Id<"teams">; clearAssignedTeam?: boolean; type?: Doc<"jobs">["type"]; notes?: string } = {}) => t.mutation(api.mutations.jobs.update, { ...auth(), jobId: ids.job, ...edit });
  const patch = (edit: Partial<Doc<"jobs">>) => t.run(ctx => ctx.db.patch(ids.job, edit));
  const job = () => t.run(ctx => ctx.db.get(ids.job));
  const state = () => t.run(async ctx => ({ job: await ctx.db.get(ids.job), notifications: await ctx.db.query("notifications").collect(), audits: await ctx.db.query("auditLog").collect(), scheduled: await ctx.db.system.query("_scheduled_functions").collect(), reviews: await ctx.db.query("workerDeclineReviews").collect(), forms: await ctx.db.query("forms").collect(), members: await ctx.db.query("teamMembers").collect(), shares: await ctx.db.query("sharedJobs").collect() }));
  const createArgs = { ...auth(), companyId: ids.companyId, propertyId: ids.property, cleanerIds: [ids.a, ids.a, ids.c], assignedTeamId: ids.team, type: "standard" as const, scheduledDate: "2030-01-03", durationMinutes: 60 };
  const review = () => t.mutation(api.mutations.jobs.denyJob, { ...auth("a"), jobId: ids.job, reason: "Unavailable" });
  return { t, ...ids, auth, update, patch, jobDoc: job, state, createArgs, review };
}

describe("independent job assignment mutations", () => {
  it.each(["create", "createQuick"] as const)("%s permits combined normalized assignments and unique recipients", async name => {
    const s = await setup();
    const id = await s.t.mutation(api.mutations.jobs[name], s.createArgs);
    const state = await s.state();
    expect(await s.t.run(ctx => ctx.db.get(id))).toMatchObject({ cleanerIds: [s.a, s.c], assignedTeamId: s.team, assignmentRevision: 0 });
    expect(new Set(state.notifications.map(n => n.userId))).toEqual(new Set([s.a, s.b, s.c]));
    expect(state.notifications).toHaveLength(3); expect(state.scheduled).toHaveLength(3);
    expect(state.scheduled.every(f => (f.args[0] as { assignmentContext?: unknown }).assignmentContext)).toBe(true);
  });
  it("independently adds, replaces and clears both sources while omissions preserve values", async () => {
    const s = await setup();
    await s.update({ assignedTeamId: s.team });
    expect(await s.jobDoc()).toMatchObject({ cleanerIds: [s.a], assignedTeamId: s.team });
    await s.update({ cleanerIds: [s.c, s.c] });
    expect(await s.jobDoc()).toMatchObject({ cleanerIds: [s.c], assignedTeamId: s.team });
    await s.update({ cleanerIds: [] });
    expect(await s.jobDoc()).toMatchObject({ cleanerIds: [], assignedTeamId: s.team });
    await s.update({ cleanerIds: [s.c] });
    await s.update({ clearAssignedTeam: true });
    expect(await s.jobDoc()).toMatchObject({ cleanerIds: [s.c] }); expect((await s.jobDoc())?.assignedTeamId).toBeUndefined();
    await s.update({ assignedTeamId: s.emptyTeam });
    await s.update({ notes: "notes only" });
    expect(await s.jobDoc()).toMatchObject({ cleanerIds: [s.c], assignedTeamId: s.emptyTeam });
  });
  it("reordered, duplicate, omitted and concurrent unchanged assignments are complete no-ops", async () => {
    const s = await setup(); await s.patch({ cleanerIds: [s.a, s.c], assignedTeamId: s.team });
    const before = await s.state();
    await s.update(); await s.update({ clearAssignedTeam: false });
    await Promise.all(Array.from({ length: 6 }, () => s.update({ cleanerIds: [s.c, s.a, s.a], assignedTeamId: s.team })));
    expect(await s.state()).toEqual(before);
  });
  it("concurrent changed retries create one audit and one recipient delta", async () => {
    const s = await setup();
    await Promise.all(Array.from({ length: 5 }, () => s.update({ cleanerIds: [s.a, s.c], assignedTeamId: s.team })));
    const state = await s.state(); expect(state.audits).toHaveLength(1); expect(state.notifications).toHaveLength(2); expect(state.scheduled).toHaveLength(2);
    expect(state.job?.assignmentRevision).toBe(1);
  });
  it("overlapping paths do not create false removal or duplicate messages; audit records actor and both states", async () => {
    const s = await setup(); await s.patch({ cleanerIds: [s.a, s.c], assignedTeamId: s.team });
    await s.update({ cleanerIds: [s.c] });
    let state = await s.state(); expect(state.notifications).toHaveLength(0);
    const details = JSON.parse(state.audits[0].details!);
    expect(state.audits[0].userId).toBe(s.owner);
    expect(details).toMatchObject({ before: { cleanerIds: [s.a, s.c], assignedTeamId: s.team }, after: { cleanerIds: [s.c], assignedTeamId: s.team }, addedWorkerIds: [], removedWorkerIds: [] });
    await s.update({ clearAssignedTeam: true });
    state = await s.state(); expect(new Set(state.notifications.map(n => n.userId))).toEqual(new Set([s.a, s.b]));
    expect(state.notifications.every(n => n.relatedJobId === undefined && n.title === "Job Assignment Removed")).toBe(true);
    expect(state.scheduled).toHaveLength(0);
    await expect(s.t.query(api.queries.jobs.getForCleaner, { ...s.auth("a"), jobId: s.job })).rejects.toThrow();
  });
  it.each(["scheduled", "confirmed", "denied", "in_progress", "submitted", "approved", "rework_requested"] as const)("actual changes preserve %s lifecycle and all durable evidence", async status => {
    const s = await setup();
    await s.patch({ status, startedAt: NOW - 100, completedAt: NOW - 50, deniedAt: NOW - 200, denyReason: "old", submittedExecutionSequence: 1,
      executionHistory: [{ sequence: 1, provenance: "submission_confirmed", confirmedById: s.a, confirmedAt: NOW - 50, scheduledDate: "2030-01-02", workers: [{ userId: s.a, displayName: "a", role: "cleaner" }] }] });
    await s.t.run(ctx => ctx.db.insert("forms", { companyId: s.companyId, jobId: s.job, cleanerId: s.a, status: "submitted", submittedAt: NOW - 50 }));
    const before = await s.state();
    await s.t.mutation(api.mutations.jobs.reassignJob, { ...s.auth(), jobId: s.job, newCleanerId: s.c });
    const after = await s.state();
    expect(after.job).toEqual({ ...before.job, cleanerIds: [s.c], assignmentRevision: 1 });
    expect(after.forms).toEqual(before.forms); expect(after.members).toEqual(before.members); expect(after.shares).toEqual(before.shares); expect(after.scheduled).toHaveLength(0);
  });
  it("resolves only reviews whose worker loses every assignment path and preserves originals", async () => {
    const s = await setup(); await s.patch({ status: "scheduled", acceptanceStatus: "pending", assignedTeamId: s.team });
    const result = await s.review(); expect(result?.reviewRequested).toBe(true);
    const original = (await s.state()).reviews[0];
    await s.update({ cleanerIds: [] }); expect((await s.state()).reviews[0]).toEqual(original);
    await s.update({ assignedTeamId: s.emptyTeam });
    const state = await s.state(); expect(state.reviews[0]).toEqual({ ...original, status: "resolved", resolutionReason: "assignment_removed", resolvedAt: NOW, resolvedBy: s.owner, resolvedByName: "owner" });
    expect(JSON.parse(state.audits.at(-1)!.details!).resolvedReviewIds).toEqual([original._id]);
    await expect(s.review()).rejects.toThrow();
    await s.update({ cleanerIds: [s.a, s.c] }); await s.review(); expect((await s.state()).reviews).toHaveLength(2);
  });
  it.each(["foreign", "inactive", "maintenance"] as const)("rejects invalid direct %s assignment atomically", async name => {
    const s = await setup(); const before = await s.state();
    await expect(s.update({ cleanerIds: [s[name]], assignedTeamId: s.team })).rejects.toThrow();
    expect(await s.state()).toEqual(before);
    await expect(s.t.mutation(api.mutations.jobs.create, { ...s.createArgs, cleanerIds: [s[name]] })).rejects.toThrow();
  });
  it("rejects foreign/archived teams, conflicting set/clear and incompatible type changes", async () => {
    const s = await setup(); const before = await s.state();
    await expect(s.update({ assignedTeamId: s.foreignTeam })).rejects.toThrow();
    await expect(s.update({ assignedTeamId: s.team, clearAssignedTeam: true })).rejects.toThrow("set and clear");
    await expect(s.update({ type: "maintenance" })).rejects.toThrow();
    expect(await s.state()).toEqual(before);
    await s.t.run(ctx => ctx.db.patch(s.team, { active: false })); await expect(s.update({ assignedTeamId: s.team })).rejects.toThrow("archived");
  });
  it("preserves delegated manager, owner-only replacement and tenant boundaries", async () => {
    const s = await setup();
    for (const name of ["noAssign", "noEdit", "a", "foreignOwner"] as const) await expect(s.t.mutation(api.mutations.jobs.update, { ...s.auth(name), jobId: s.job, cleanerIds: [s.c], assignedTeamId: s.team })).rejects.toThrow();
    await expect(s.t.mutation(api.mutations.jobs.update, { ...s.auth(), sessionToken: "invalid", jobId: s.job, cleanerIds: [] })).rejects.toThrow();
    await expect(s.t.mutation(api.mutations.jobs.reassignJob, { ...s.auth("manager"), jobId: s.job, newCleanerId: s.c })).rejects.toThrow();
    await s.t.mutation(api.mutations.jobs.update, { ...s.auth("manager"), jobId: s.job, cleanerIds: [s.c], assignedTeamId: s.team });
    expect((await s.state()).audits[0].userId).toBe(s.manager);
  });
  it("supports combined accepted recipient-company assignments and rejects pending/rejected/foreign edits", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.insert("ownerConnections", { companyAId: s.companyId, companyBId: s.foreignCompany, status: "active", createdAt: NOW }));
    const share = await s.t.mutation(api.mutations.partners.shareJob, { ...s.auth(), jobId: s.job, toCompanyId: s.foreignCompany, sharePackage: true });
    const args = { ...s.auth("foreignOwner"), jobId: share.copiedJobId, cleanerIds: [s.foreign, s.foreignOwner], assignedTeamId: s.foreignTeam };
    const original = await s.jobDoc();
    await expect(s.t.mutation(api.mutations.jobs.update, args)).rejects.toThrow(/accept|pending/i);
    expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, { jobId: share.copiedJobId, workerId: s.foreign, revision: 0 })).toBeNull();
    await s.t.mutation(api.mutations.partners.acceptSharedJob, { ...s.auth("foreignOwner"), sharedJobId: share.sharedJobId });
    await s.t.mutation(api.mutations.jobs.update, args);
    const copied = await s.t.run(ctx => ctx.db.get(share.copiedJobId));
    expect(copied).toMatchObject({ cleanerIds: [s.foreign, s.foreignOwner], assignedTeamId: s.foreignTeam });
    expect(await s.jobDoc()).toEqual(original);
    await expect(s.t.mutation(api.mutations.jobs.update, { ...args, ...s.auth() })).rejects.toThrow("Not your company");
    await expect(s.t.mutation(api.mutations.jobs.update, { ...args, cleanerIds: [s.a] })).rejects.toThrow();
    await s.t.run(ctx => ctx.db.patch(share.sharedJobId, { status: "rejected" }));
    await expect(s.t.mutation(api.mutations.jobs.update, { ...args, cleanerIds: [] })).rejects.toThrow(/reject/i);
    expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, { jobId: share.copiedJobId, workerId: s.foreign, revision: 1 })).toBeNull();
  });
  it("keeps recurring combined generation/deduplication and allows independent edits without rewriting its source", async () => {
    const s = await setup();
    const schedule = await s.t.run(async ctx => {
      const account = await ctx.db.insert("commercialAccounts", { companyId: s.companyId, clientName: "Recurring", status: "active", createdAt: NOW, updatedAt: NOW });
      return await ctx.db.insert("commercialSchedules", { companyId: s.companyId, commercialAccountId: account, propertyId: s.property, title: "Daily", status: "active", frequency: "daily", startDate: "2030-01-02", assignedCleanerId: s.c, assignedTeamId: s.team, createdAt: NOW, updatedAt: NOW });
    });
    const args = { ...s.auth(), commercialScheduleId: schedule, startDate: "2030-01-02", endDate: "2030-01-02" };
    expect(await s.t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, args)).toMatchObject({ createdCount: 1 });
    const generated = await s.t.run(ctx => ctx.db.query("jobs").withIndex("by_commercialSchedule", q => q.eq("commercialScheduleId", schedule)).unique());
    expect(generated).toMatchObject({ cleanerIds: [s.c], assignedTeamId: s.team, generatedFromCommercialSchedule: true });
    expect((await s.state()).scheduled).toHaveLength(0);
    await s.t.mutation(api.mutations.jobs.update, { ...s.auth(), jobId: generated!._id, clearAssignedTeam: true });
    expect(await s.t.run(ctx => ctx.db.get(generated!._id))).toEqual({ ...generated, assignedTeamId: undefined, assignmentRevision: 1 });
    expect(await s.t.mutation(api.mutations.commercialSchedules.generateCommercialJobsFromSchedule, args)).toMatchObject({ createdCount: 0, skippedDuplicateCount: 1 });
    expect(await s.t.run(ctx => ctx.db.get(schedule))).toMatchObject({ assignedCleanerId: s.c, assignedTeamId: s.team });
  });
  it("guards delayed emails by revision, current membership, lifecycle and fresh schedule", async () => {
    const s = await setup(); await s.update({ cleanerIds: [s.a, s.c] });
    const args = { jobId: s.job, workerId: s.c, revision: 1 };
    expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, args)).toMatchObject({ email: "c@assign.test", scheduledDate: "2030-01-02" });
    await s.patch({ scheduledDate: "2030-02-01" }); expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, args)).toMatchObject({ scheduledDate: "2030-02-01" });
    await s.update({ cleanerIds: [s.a] }); expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, args)).toBeNull();
    await s.update({ cleanerIds: [s.a, s.c] }); expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, args)).toBeNull();
    await s.patch({ startedAt: NOW }); expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, { ...args, revision: 3 })).toBeNull();
  });
  it("suppresses queued team-only invitations after live membership or worker eligibility changes", async () => {
    const s = await setup(); await s.update({ assignedTeamId: s.team }); const args = { jobId: s.job, workerId: s.b, revision: 1 };
    expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, args)).not.toBeNull();
    await s.t.run(async ctx => { const m = await ctx.db.query("teamMembers").withIndex("by_teamId_userId", q => q.eq("teamId", s.team).eq("userId", s.b)).unique(); await ctx.db.patch(m!._id, { active: false }); });
    expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, args)).toBeNull();
    await s.t.run(ctx => ctx.db.patch(s.a, { status: "inactive" }));
    expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, { ...args, workerId: s.a })).toBeNull();
  });
});
