import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { hashToken } from "../tokens";
import { deliverJobCompletedEmail, deliverJobApprovedEmail } from "../email";

vi.mock("../email", async importOriginal => ({
  ...await importOriginal<typeof import("../email")>(),
  deliverJobCompletedEmail: vi.fn().mockResolvedValue({ status: "provider_accepted" }),
  deliverJobApprovedEmail: vi.fn().mockResolvedValue({ status: "provider_accepted" }),
}));
const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.parse("2030-01-01T12:00:00Z");
beforeEach(() => { vi.useFakeTimers({ now: NOW }); vi.stubEnv("APP_URL", "http://localhost:5173"); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
type CompletionArgs = FunctionArgs<typeof internal.actions.emailNotifications.sendJobCompleted>;
type ApprovalArgs = FunctionArgs<typeof internal.actions.emailNotifications.sendJobApproved>;

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Review company", timezone: "UTC", contactEmail: "reply@review.test" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Foreign", timezone: "UTC" });
    const user = (name: string, role: Doc<"users">["role"] = "cleaner", company = companyId, status: Doc<"users">["status"] = "active") =>
      ctx.db.insert("users", { companyId: company, name, role, status, email: `${name}@review.test`, passwordHash: "unused" });
    const owner = await user("owner", "owner"), inactiveOwner = await user("inactiveOwner", "owner", companyId, "inactive");
    const worker = await user("worker"), teamWorker = await user("teamWorker"), direct = await user("direct");
    const manager = await user("manager", "manager"), unassignedManager = await user("unassignedManager", "manager");
    const foreign = await user("foreign", "cleaner", foreignCompany), foreignOwner = await user("foreignOwner", "owner", foreignCompany);
    const inactive = await user("inactive", "cleaner", companyId, "inactive"), pending = await user("pending", "cleaner", companyId, "pending");
    const maintenance = await user("maintenance", "maintenance"), affiliate = await user("affiliate", "affiliate");
    for (const [id, name] of [[owner, "owner"], [worker, "worker"]] as const) await ctx.db.insert("authSessions", {
      principalType: "staff", userId: id, tokenHash: hashToken(name), version: 1,
      createdAt: NOW, lastUsedAt: NOW, expiresAt: NOW + 3600000, idleExpiresAt: NOW + 3600000,
    });
    const team = await ctx.db.insert("teams", { companyId, name: "Team", active: true, createdBy: owner, createdAt: NOW, updatedAt: NOW });
    const membership = await ctx.db.insert("teamMembers", { companyId, teamId: team, userId: teamWorker, role: "member", active: true, addedAt: NOW });
    await ctx.db.insert("teamMembers", { companyId, teamId: team, userId: worker, role: "lead", active: true, addedAt: NOW });
    const property = await ctx.db.insert("properties", { companyId, name: "Current property", address: "Synthetic", type: "residential", active: true, amenities: [] });
    const job = await ctx.db.insert("jobs", { companyId, propertyId: property, cleanerIds: [worker, direct, manager], assignedTeamId: team,
      type: "standard", status: "in_progress", startedAt: NOW - 1000, scheduledDate: "2030-01-01", durationMinutes: 60, reworkCount: 0 });
    const form = await ctx.db.insert("forms", { companyId, jobId: job, cleanerId: worker, status: "in_progress" });
    return { companyId, foreignCompany, owner, inactiveOwner, worker, teamWorker, direct, manager, unassignedManager,
      foreign, foreignOwner, inactive, pending, maintenance, affiliate, team, membership, property, job, form };
  });
  const ownerAuth = { userId: ids.owner, sessionToken: "owner" };
  const workerAuth = { userId: ids.worker, sessionToken: "worker" };
  const submit = () => t.mutation(api.mutations.forms.submit, { ...workerAuth, formId: ids.form, performedWorkerIds: [ids.worker] });
  const approve = () => t.mutation(api.mutations.forms.approve, { ...ownerAuth, formId: ids.form });
  const rework = () => t.mutation(api.mutations.forms.requestRework, { ...ownerAuth, formId: ids.form, notes: "Recheck" });
  const notices = (type: string) => t.run(async ctx => (await ctx.db.query("notifications").collect()).filter(row => row.type === type));
  const queued = () => t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
  const completion = async () => (await queued()).find(row => row.name.includes("sendJobCompleted"))!.args[0] as CompletionArgs;
  const approval = async (recipientId: Id<"users"> = ids.worker) => (await queued()).filter(row => row.name.includes("sendJobApproved"))
    .map(row => row.args[0] as ApprovalArgs).find(args => args.approvalContext?.recipientId === recipientId)!;
  return { t, ...ids, ownerAuth, workerAuth, submit, approve, rework, notices, queued, completion, approval };
}

describe("job review recipient safety", () => {
  it("notifies and queues completion only for active same-company owners, with replay safety", async () => {
    const s = await setup();
    await Promise.all([s.submit(), s.submit()]);
    await s.t.mutation(api.mutations.jobs.completeJob, { ...s.workerAuth, jobId: s.job });
    expect((await s.notices("job_submitted")).map(n => n.userId)).toEqual([s.owner]);
    expect(await s.queued()).toHaveLength(1);
    expect((await s.completion()).completionContext).toMatchObject({ companyId: s.companyId, jobId: s.job,
      formId: s.form, recipientId: s.owner, completedAt: NOW, executionSequence: 1 });
    await s.t.action(internal.actions.emailNotifications.sendJobCompleted, await s.completion());
    expect(deliverJobCompletedEmail).toHaveBeenCalledExactlyOnceWith("owner@review.test", "Current property", "worker", NOW,
      { companyName: "Review company", replyTo: "reply@review.test" });
  });

  it.each(["approve", "rework"] as const)("%s filters corrupt/inactive/ineligible direct and team recipients while deduplicating overlap", async action => {
    const s = await setup(); await s.submit();
    await s.t.run(async ctx => {
      const invalid = [s.foreign, s.inactive, s.pending, s.maintenance, s.affiliate];
      await ctx.db.patch(s.job, { cleanerIds: [s.worker, s.worker, s.direct, s.manager, ...invalid] });
      for (const userId of invalid) await ctx.db.insert("teamMembers", { companyId: s.companyId, teamId: s.team, userId, role: "member", active: true, addedAt: NOW });
      await ctx.db.insert("teamMembers", { companyId: s.foreignCompany, teamId: s.team, userId: s.unassignedManager, role: "member", active: true, addedAt: NOW });
      await ctx.db.patch(s.team, { active: false }); // Archive must not revoke existing members.
    });
    await s[action]();
    const rows = await s.notices(action === "approve" ? "job_approved" : "rework_requested");
    expect(new Set(rows.map(n => n.userId))).toEqual(new Set([s.worker, s.teamWorker, s.direct, s.manager]));
    expect(rows).toHaveLength(4);
    if (action === "approve") {
      await Promise.all([s.approve(), s.approve()]);
      expect(await s.notices("job_approved")).toHaveLength(4);
      expect((await s.queued()).filter(row => row.name.includes("sendJobApproved"))).toHaveLength(4);
    } else await expect(s.rework()).rejects.toThrow("not submitted");
  });

  it("ignores a foreign team even if a malformed membership points to a local user", async () => {
    const s = await setup(); await s.submit();
    await s.t.run(ctx => ctx.db.patch(s.team, { companyId: s.foreignCompany }));
    await s.approve();
    expect(new Set((await s.notices("job_approved")).map(n => n.userId))).toEqual(new Set([s.worker, s.direct, s.manager]));
  });

  it("uses maintenance execution eligibility without adding an unassigned manager or historical performer", async () => {
    const s = await setup(); await s.submit();
    await s.t.run(ctx => ctx.db.patch(s.job, { type: "maintenance", cleanerIds: [s.maintenance, s.worker, s.manager] }));
    await s.approve();
    expect((await s.notices("job_approved")).map(n => n.userId)).toEqual([s.maintenance]);
    expect((await s.t.run(ctx => ctx.db.get(s.job)))?.executionHistory?.[0].workers.map(w => w.userId)).toEqual([s.worker]);
  });
});

describe("delayed review email dispatch", () => {
  it("uses fresh recipient, property and company identity and permits rapid approval of the same completion", async () => {
    const s = await setup(); await s.submit(); const completed = await s.completion();
    await s.approve(); const approved = await s.approval();
    await s.t.run(async ctx => {
      await ctx.db.patch(s.owner, { email: "new-owner@review.test" });
      await ctx.db.patch(s.worker, { email: "new-worker@review.test" });
      await ctx.db.patch(s.property, { name: "Renamed property" });
      await ctx.db.patch(s.companyId, { name: "Renamed company", contactEmail: "new-reply@review.test" });
    });
    await s.t.action(internal.actions.emailNotifications.sendJobCompleted, completed);
    await s.t.action(internal.actions.emailNotifications.sendJobApproved, approved);
    expect(deliverJobCompletedEmail).toHaveBeenCalledExactlyOnceWith("new-owner@review.test", "Renamed property", "worker", NOW,
      { companyName: "Renamed company", replyTo: "new-reply@review.test" });
    expect(deliverJobApprovedEmail).toHaveBeenCalledExactlyOnceWith("new-worker@review.test", "Renamed property",
      { companyName: "Renamed company", replyTo: "new-reply@review.test" });
  });

  it.each(["inactive", "foreign", "role", "missing", "no-email"] as const)("suppresses completion for a now %s owner", async change => {
    const s = await setup(); await s.submit(); const args = await s.completion();
    await s.t.run(async ctx => {
      if (change === "missing") await ctx.db.delete(s.owner);
      else await ctx.db.patch(s.owner, change === "inactive" ? { status: "inactive" } : change === "foreign" ?
        { companyId: s.foreignCompany } : change === "role" ? { role: "manager" } : { email: "" });
    });
    await s.t.action(internal.actions.emailNotifications.sendJobCompleted, args);
    expect(deliverJobCompletedEmail).not.toHaveBeenCalled();
  });

  it.each(["inactive", "foreign", "role", "removed", "missing", "no-email"] as const)("suppresses approval for a now %s worker", async change => {
    const s = await setup(); await s.submit(); await s.approve(); const args = await s.approval(s.direct);
    await s.t.run(async ctx => {
      if (change === "removed") await ctx.db.patch(s.job, { cleanerIds: [s.worker, s.manager] });
      else if (change === "missing") await ctx.db.delete(s.direct);
      else await ctx.db.patch(s.direct, change === "inactive" ? { status: "inactive" } : change === "foreign" ?
        { companyId: s.foreignCompany } : change === "role" ? { role: "affiliate" } : { email: "" });
    });
    await s.t.action(internal.actions.emailNotifications.sendJobApproved, args);
    expect(deliverJobApprovedEmail).not.toHaveBeenCalled();
  });

  it("rechecks team membership but preserves an overlapping direct assignment", async () => {
    const s = await setup(); await s.submit(); await s.approve(); const teamArgs = await s.approval(s.teamWorker); const overlapArgs = await s.approval();
    await s.t.run(async ctx => {
      await ctx.db.patch(s.membership, { active: false });
      const overlap = await ctx.db.query("teamMembers").withIndex("by_teamId_userId", q => q.eq("teamId", s.team).eq("userId", s.worker)).unique();
      await ctx.db.patch(overlap!._id, { active: false });
    });
    await s.t.action(internal.actions.emailNotifications.sendJobApproved, teamArgs);
    expect(deliverJobApprovedEmail).not.toHaveBeenCalled();
    await s.t.action(internal.actions.emailNotifications.sendJobApproved, overlapArgs);
    expect(deliverJobApprovedEmail).toHaveBeenCalledTimes(1);
  });

  it("suppresses obsolete completions through rework/resubmission and sends only the new submission", async () => {
    const s = await setup(); await s.submit(); const old = await s.completion();
    await s.rework();
    await s.t.action(internal.actions.emailNotifications.sendJobCompleted, old);
    expect(deliverJobCompletedEmail).not.toHaveBeenCalled();
    await s.t.mutation(api.mutations.jobs.startJob, { ...s.workerAuth, jobId: s.job });
    // Keep the same wall clock: execution identity, not timestamp alone, must distinguish rounds.
    await s.submit();
    await s.t.action(internal.actions.emailNotifications.sendJobCompleted, old);
    expect(deliverJobCompletedEmail).not.toHaveBeenCalled();
    const latest = (await s.queued()).filter(row => row.name.includes("sendJobCompleted")).at(-1)!.args[0] as CompletionArgs;
    expect(latest.completionContext?.executionSequence).toBe(2);
    await s.t.action(internal.actions.emailNotifications.sendJobCompleted, latest);
    expect(deliverJobCompletedEmail).toHaveBeenCalledTimes(1);
  });

  it.each(["cancelled", "denied", "in_progress", "rework_requested"] as const)("suppresses review emails when job is %s", async status => {
    const s = await setup(); await s.submit(); const completed = await s.completion(); await s.approve(); const approved = await s.approval();
    await s.t.run(ctx => ctx.db.patch(s.job, { status }));
    await s.t.action(internal.actions.emailNotifications.sendJobCompleted, completed);
    await s.t.action(internal.actions.emailNotifications.sendJobApproved, approved);
    expect(deliverJobCompletedEmail).not.toHaveBeenCalled(); expect(deliverJobApprovedEmail).not.toHaveBeenCalled();
  });

  it.each(["approvedAt", "reworkCount", "executionSequence"] as const)("suppresses a superseded approval when %s changes", async field => {
    const s = await setup(); await s.submit(); await s.approve(); const args = await s.approval();
    await s.t.run(ctx => ctx.db.patch(s.job, field === "approvedAt" ? { approvedAt: NOW + 1 } :
      field === "reworkCount" ? { reworkCount: 1 } : { submittedExecutionSequence: 2, approvedExecutionSequence: 2 }));
    await s.t.action(internal.actions.emailNotifications.sendJobApproved, args);
    expect(deliverJobApprovedEmail).not.toHaveBeenCalled();
  });

  it.each(["property", "form", "job-company", "missing-job"] as const)("fails closed on invalid %s linkage", async change => {
    const s = await setup(); await s.submit(); const completed = await s.completion(); await s.approve(); const approved = await s.approval();
    await s.t.run(async ctx => {
      if (change === "property") await ctx.db.patch(s.property, { companyId: s.foreignCompany });
      if (change === "form") await ctx.db.patch(s.form, { companyId: s.foreignCompany });
      if (change === "job-company") await ctx.db.patch(s.job, { companyId: s.foreignCompany });
      if (change === "missing-job") await ctx.db.delete(s.job);
    });
    await s.t.action(internal.actions.emailNotifications.sendJobCompleted, completed);
    await s.t.action(internal.actions.emailNotifications.sendJobApproved, approved);
    expect(deliverJobCompletedEmail).not.toHaveBeenCalled(); expect(deliverJobApprovedEmail).not.toHaveBeenCalled();
  });

  it("supports a newly queued approval of legacy submitted work without inventing execution evidence", async () => {
    const s = await setup();
    await s.t.run(async ctx => { await ctx.db.patch(s.job, { status: "submitted" }); await ctx.db.patch(s.form, { status: "submitted" }); });
    await s.approve();
    await s.t.action(internal.actions.emailNotifications.sendJobApproved, await s.approval());
    expect(deliverJobApprovedEmail).toHaveBeenCalledTimes(1);
    expect((await s.t.run(ctx => ctx.db.get(s.job)))?.executionHistory).toBeUndefined();
  });

  it("accepts legacy validators but suppresses unidentifiable payloads without sensitive skip logs", async () => {
    const s = await setup(); const warn = vi.spyOn(console, "warn"); const error = vi.spyOn(console, "error");
    try {
      expect(await s.t.action(internal.actions.emailNotifications.sendJobCompleted, { email: "legacy@review.test", propertyName: "Private", cleanerName: "Worker", completedAt: NOW, companyName: "Private" })).toBeNull();
      expect(await s.t.action(internal.actions.emailNotifications.sendJobApproved, { email: "legacy@review.test", propertyName: "Private", companyName: "Private" })).toBeNull();
      expect(deliverJobCompletedEmail).not.toHaveBeenCalled(); expect(deliverJobApprovedEmail).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); error.mockRestore(); }
  });

  it.each(["accepted", "in_progress", "completed", "pending", "rejected", "malformed"] as const)("revalidates %s shared-copy state and never sends to the source company", async status => {
    const s = await setup();
    const share = await s.t.run(async ctx => {
      const original = await ctx.db.insert("jobs", { companyId: s.foreignCompany, cleanerIds: [], type: "standard", status: "scheduled", scheduledDate: "2030-01-01", durationMinutes: 60, reworkCount: 0 });
      await ctx.db.patch(s.job, { sharedFromJobId: original, sharedFromCompanyName: "Foreign", propertyId: undefined, propertySnapshot: { name: "Shared property", address: "Synthetic", type: "residential" } });
      return ctx.db.insert("sharedJobs", { originalJobId: original, copiedJobId: s.job, fromCompanyId: s.foreignCompany, toCompanyId: s.companyId, sharePackage: false, status: "accepted" });
    });
    await s.submit(); const completed = await s.completion(); await s.approve(); const approved = await s.approval();
    expect((await s.notices("job_submitted")).map(n => n.userId)).toEqual([s.owner]);
    await s.t.run(ctx => ctx.db.patch(share, status === "malformed" ? { toCompanyId: s.foreignCompany } : { status }));
    await s.t.action(internal.actions.emailNotifications.sendJobCompleted, completed);
    await s.t.action(internal.actions.emailNotifications.sendJobApproved, approved);
    const allowed = ["accepted", "in_progress", "completed"].includes(status);
    expect(deliverJobCompletedEmail).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(deliverJobApprovedEmail).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });
});
