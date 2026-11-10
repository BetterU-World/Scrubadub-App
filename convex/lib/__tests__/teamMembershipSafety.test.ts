import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashToken } from "../tokens";
import { getActiveTeamIdsForUser, getActiveTeamMembers, getActiveTeamMemberUserIds, getJobRecipientUserIds, isUserAssignedToJob } from "../teams";
const modules = import.meta.glob("../../**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const company = await ctx.db.insert("companies", { name: "Local", timezone: "UTC" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Other", timezone: "UTC" });
    const user = async (name: string, role: "owner" | "cleaner" | "manager", companyId = company) => {
      const id = await ctx.db.insert("users", { name, role, companyId, status: "active", passwordHash: "unused", email: name + "@test.invalid" });
      await ctx.db.insert("authSessions", { principalType: "staff", userId: id, tokenHash: hashToken(name), version: 1, createdAt: Date.now(), lastUsedAt: Date.now(), expiresAt: Date.now() + 3600000, idleExpiresAt: Date.now() + 3600000 });
      return id;
    };
    const owner = await user("owner", "owner"), worker = await user("worker", "cleaner"), manager = await user("manager", "manager"), foreign = await user("foreign", "cleaner", foreignCompany);
    const team = await ctx.db.insert("teams", { companyId: company, name: "Team", active: true, createdBy: owner, createdAt: 1, updatedAt: 1 });
    const job = await ctx.db.insert("jobs", { companyId: company, cleanerIds: [], assignedTeamId: team, type: "standard", status: "confirmed", scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0 });
    return { company, foreignCompany, owner, worker, manager, foreign, team, job };
  });
  const ownerAuth = { userId: ids.owner, sessionToken: "owner" };
  const workerAuth = { userId: ids.worker, sessionToken: "worker" };
  const add = () => t.mutation(api.mutations.teams.addMember, { ...ownerAuth, teamId: ids.team, memberUserId: ids.worker, role: "member" });
  const membership = () => t.run(ctx => ctx.db.query("teamMembers").withIndex("by_teamId_userId", q => q.eq("teamId", ids.team).eq("userId", ids.worker)).unique());
  const remove = async () => t.mutation(api.mutations.teams.removeMember, { ...ownerAuth, membershipId: (await membership())!._id });
  const assigned = () => t.run(async ctx => isUserAssignedToJob(ctx, (await ctx.db.get(ids.job))!, ids.worker));
  return { t, ...ids, ownerAuth, workerAuth, add, remove, membership, assigned };
}
describe("team membership assignment safety", () => {
  it.each(["scheduled", "confirmed", "in_progress", "submitted", "approved", "denied", "cancelled", "rework_requested"] as const)("preserves dynamic membership without rewriting %s jobs", async status => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.job, { status }));
    const before = await s.t.run(ctx => ctx.db.get(s.job));
    expect(await s.assigned()).toBe(false); await s.add(); expect(await s.assigned()).toBe(true);
    await s.remove(); expect(await s.assigned()).toBe(false);
    expect(await s.t.run(ctx => ctx.db.get(s.job))).toEqual(before);
    expect(await s.t.run(ctx => ctx.db.query("notifications").collect())).toEqual([]);
    expect(await s.t.run(ctx => ctx.db.query("operationalEmailDeliveries").collect())).toEqual([]);
    expect(await s.t.run(ctx => ctx.db.query("clientSchedulingEvents").collect())).toEqual([]);
  });
  it("retains explicit overlap, deduplicates and preserves archived team access", async () => {
    const s = await setup(); await s.add();
    await s.t.run(ctx => ctx.db.patch(s.job, { cleanerIds: [s.worker, s.worker] }));
    expect(await s.t.run(async ctx => getJobRecipientUserIds(ctx, (await ctx.db.get(s.job))!))).toEqual([s.worker]);
    await s.remove(); expect(await s.assigned()).toBe(true); await s.add();
    await s.t.mutation(api.mutations.teams.setActive, { ...s.ownerAuth, teamId: s.team, active: false });
    await s.t.run(ctx => ctx.db.patch(s.job, { cleanerIds: [] }));
    expect(await s.assigned()).toBe(true);
  });
  it("hides stale assignment notices and unread counts while preserving linkless removal notices", async () => {
    const s = await setup(); await s.add();
    await s.t.run(async ctx => {
      for (const type of ["job_assigned", "job_reassigned"] as const) await ctx.db.insert("notifications", { companyId: s.company, userId: s.worker, type, title: "Assignment", message: "Open job", relatedJobId: s.job, read: false });
      await ctx.db.insert("notifications", { companyId: s.company, userId: s.worker, type: "job_reassigned", title: "Removed", message: "Contact company", read: false });
    });
    expect(await s.t.query(api.queries.notifications.unreadCount, s.workerAuth)).toBe(3);
    await s.remove();
    expect(await s.t.query(api.queries.notifications.unreadCount, s.workerAuth)).toBe(1);
    expect((await s.t.query(api.queries.notifications.list, s.workerAuth)).map(n => n.title)).toEqual(["Removed"]);
    expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, { jobId: s.job, workerId: s.worker, revision: 0 })).toBeNull();
  });
  it("rejects corrupt tenant links in detail, forms, lists and recipients", async () => {
    const s = await setup(); await s.add();
    await s.t.run(async ctx => { await ctx.db.patch((await ctx.db.query("teamMembers").withIndex("by_teamId_userId", q => q.eq("teamId", s.team).eq("userId", s.worker)).unique())!._id, { companyId: s.foreignCompany }); });
    expect(await s.assigned()).toBe(false);
    expect(await s.t.query(api.queries.jobs.get, { ...s.workerAuth, jobId: s.job })).toBeNull();
    expect(await s.t.query(api.queries.forms.getByJob, { ...s.workerAuth, jobId: s.job })).toBeNull();
    expect(await s.t.run(async ctx => [...await getActiveTeamIdsForUser(ctx, s.worker, s.company)])).toEqual([]);
    expect(await s.t.run(async ctx => getJobRecipientUserIds(ctx, (await ctx.db.get(s.job))!))).toEqual([]);
    await expect(s.remove()).rejects.toThrow();
  });
  it("requires Manager delegation and validates the actual team at membership mutation boundaries", async () => {
    const s = await setup();
    await expect(s.t.mutation(api.mutations.teams.addMember, { userId: s.manager, sessionToken: "manager", teamId: s.team, memberUserId: s.worker, role: "member" })).rejects.toThrow();
    await s.add(); await s.t.run(ctx => ctx.db.patch(s.team, { companyId: s.foreignCompany }));
    await expect(s.remove()).rejects.toThrow("Team not found");
    expect(await s.assigned()).toBe(false);
    expect(await s.t.run(async ctx => [...await getActiveTeamIdsForUser(ctx, s.worker, s.company)])).toEqual([]);
  });
  it("suppresses inactive users without deleting assignments or evidence and restores on reactivation", async () => {
    const s = await setup(); await s.add();
    await s.t.run(ctx => ctx.db.patch(s.worker, { status: "inactive" }));
    expect(await s.assigned()).toBe(false);
    expect(await s.t.run(async ctx => getJobRecipientUserIds(ctx, (await ctx.db.get(s.job))!))).toEqual([]);
    await s.t.run(ctx => ctx.db.patch(s.worker, { status: "active" })); expect(await s.assigned()).toBe(true);
  });
  it("suppresses disabled-profile assignment emails, inbox and cancellation notices", async () => {
    const s = await setup(); await s.add();
    const profile = await s.t.run(async ctx => {
      await ctx.db.insert("notifications", { companyId: s.company, userId: s.worker, type: "job_assigned", title: "Assignment", message: "Open job", relatedJobId: s.job, read: false });
      return ctx.db.insert("workerProfiles", { companyId: s.company, userId: s.worker, workerType: "contractor_1099", workerStatus: "inactive", primaryRole: "cleaner", eligibleRoles: ["cleaner"], onboardingStatus: "complete", jobEligibilityStatus: "eligible", createdAt: 1, updatedAt: 1 });
    });
    expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, { jobId: s.job, workerId: s.worker, revision: 0 })).toBeNull();
    expect(await s.t.query(api.queries.notifications.unreadCount, s.workerAuth)).toBe(0);
    // Evidence candidates retain assignment eligibility independently of notices.
    expect(await s.t.run(async ctx => getJobRecipientUserIds(ctx, (await ctx.db.get(s.job))!))).toEqual([s.worker]);
    const cancelled = await s.t.run(ctx => ctx.db.insert("jobs", { companyId: s.company, cleanerIds: [s.worker], type: "standard", status: "confirmed", scheduledDate: "2030-01-03", durationMinutes: 60, reworkCount: 0 }));
    await s.t.mutation(api.mutations.jobs.cancel, { ...s.ownerAuth, jobId: cancelled, reason: "other", notes: "Test cancellation" });
    const notices = await s.t.run(ctx => ctx.db.query("notifications").withIndex("by_userId_created", q => q.eq("userId", s.worker)).take(500));
    expect(notices.some(n => n.type === "job_cancelled")).toBe(false);
    await s.t.run(ctx => ctx.db.patch(profile, { workerStatus: "active" }));
    expect(await s.t.query(api.queries.notifications.unreadCount, s.workerAuth)).toBe(1);
    await s.t.run(ctx => ctx.db.patch(s.worker, { role: "maintenance" }));
    expect(await s.t.query(api.queries.notifications.unreadCount, s.workerAuth)).toBe(0);
    expect(await s.t.query(internal.jobAssignmentNotifications.assignmentEmailState, { jobId: s.job, workerId: s.worker, revision: 0 })).toBeNull();
  });
  it("preserves frozen work and payment records across removal, re-addition and concurrent assignment edits", async () => {
    const s = await setup(); await s.add();
    const evidence = { sequence: 1, provenance: "submission_confirmed" as const, confirmedById: s.owner, confirmedAt: 1, scheduledDate: "2030-01-02", workers: [{ userId: s.worker, displayName: "Worker", role: "cleaner" }] };
    const payment = await s.t.run(async ctx => {
      await ctx.db.patch(s.job, { status: "approved", executionHistory: [evidence], submittedExecutionSequence: 1, approvedExecutionSequence: 1 });
      return ctx.db.insert("cleanerPayments", { companyId: s.company, jobId: s.job, cleanerUserId: s.worker, amountCents: 5000, status: "OPEN", createdAt: 1 });
    });
    const before = await s.t.run(ctx => ctx.db.get(payment));
    await Promise.all([s.remove(), s.t.mutation(api.mutations.jobs.update, { ...s.ownerAuth, jobId: s.job, cleanerIds: [s.worker] })]);
    expect(await s.assigned()).toBe(true);
    await s.add();
    expect(await s.t.run(ctx => ctx.db.get(s.job))).toMatchObject({ status: "approved", executionHistory: [evidence], submittedExecutionSequence: 1, approvedExecutionSequence: 1 });
    expect(await s.t.run(ctx => ctx.db.get(payment))).toEqual(before);
    const audits = await s.t.run(ctx => ctx.db.query("auditLog").collect());
    expect(audits.map(a => a.action)).toEqual(expect.arrayContaining(["add_team_member", "remove_team_member"]));
  });

  it("filters corrupt foreign-user references in shared member rows and IDs, preserving archived/local inactive rosters", async () => {
    const s = await setup(); await s.add();
    await s.t.run(async ctx => {
      await ctx.db.insert("teamMembers", { companyId: s.company, teamId: s.team, userId: s.foreign, role: "lead", active: true, addedAt: 1 });
      await ctx.db.patch(s.team, { active: false });
    });
    const members = await s.t.run(ctx => getActiveTeamMembers(ctx, s.team));
    expect(members.map(m => m.userId)).toEqual([s.worker]);
    expect(await s.t.run(ctx => getActiveTeamMemberUserIds(ctx, s.team))).toEqual([s.worker]);
    expect(await s.t.run(async ctx => getJobRecipientUserIds(ctx, (await ctx.db.get(s.job))!))).toEqual([s.worker]);
    const detail = await s.t.query(api.queries.jobs.get, { ...s.workerAuth, jobId: s.job });
    expect(detail?.assignedTeamMembers.map(m => m!._id)).toEqual([s.worker]);
    await s.t.run(ctx => ctx.db.patch(s.worker, { status: "inactive" }));
    // The helper establishes tenant ownership, not user activation policy.
    expect(await s.t.run(ctx => getActiveTeamMemberUserIds(ctx, s.team))).toEqual([s.worker]);
  });
  it("enforces the 1000-member cap before filtering corrupt user references", async () => {
    const s = await setup();
    await s.t.run(async ctx => {
      for (let i = 0; i < 1001; i++) await ctx.db.insert("teamMembers", { companyId: s.company, teamId: s.team, userId: s.foreign, active: true, role: "member", addedAt: i });
    });
    await expect(s.t.run(ctx => getActiveTeamMembers(ctx, s.team))).rejects.toThrow("Team is too large");
  });

});
