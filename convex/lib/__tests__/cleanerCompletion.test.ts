import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");

async function setup(team = false) {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword("test-password-123");
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Completion", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { companyId, email: "owner@completion.test", passwordHash, role: "owner", name: "Owner", status: "active" });
    const cleaner = await ctx.db.insert("users", { companyId, email: "cleaner@completion.test", passwordHash, role: "cleaner", name: "Cleaner", status: "active" });
    const member = await ctx.db.insert("users", { companyId, email: "member@completion.test", passwordHash, role: "cleaner", name: "Member", status: "active" });
    const manager = await ctx.db.insert("users", { companyId, email: "manager@completion.test", passwordHash, role: "manager", name: "Manager", status: "active", canApproveForms: true });
    const teamId = team ? await ctx.db.insert("teams", { companyId, name: "Team", active: true, createdBy: owner, createdAt: 1, updatedAt: 1 }) : undefined;
    if (teamId) for (const [userId, role] of [[cleaner, "lead"], [member, "member"], [manager, "member"]] as const) {
      await ctx.db.insert("teamMembers", { companyId, teamId, userId, role, active: true, addedAt: 1 });
    }
    const job = await ctx.db.insert("jobs", { companyId, cleanerIds: team ? [] : [cleaner], assignedTeamId: teamId, type: "standard", status: "confirmed", scheduledDate: "2026-10-30", durationMinutes: 60, reworkCount: 0 });
    return { companyId, owner, cleaner, member, manager, job };
  });
  const login = (name: string) => t.action(api.authActions.signIn, { email: `${name}@completion.test`, password: "test-password-123" });
  const auth = await login("cleaner");
  const ownerAuth = await login("owner");
  await t.run(ctx => ctx.db.patch(ids.owner, { email: "" })); // no external email in tests
  const cleanerArgs = { userId: ids.cleaner, sessionToken: auth.sessionToken };
  await t.mutation(api.mutations.jobs.startJob, { ...cleanerArgs, jobId: ids.job });
  const form = await t.run(ctx => ctx.db.query("forms").withIndex("by_jobId", q => q.eq("jobId", ids.job)).unique());
  await t.mutation(api.mutations.forms.markAllComplete, { ...cleanerArgs, formId: form!._id });
  const submit = (workers = [ids.cleaner]) => t.mutation(api.mutations.forms.submit, { ...cleanerArgs, formId: form!._id, performedWorkerIds: workers });
  const state = () => t.run(async ctx => ({ job: await ctx.db.get(ids.job), form: await ctx.db.get(form!._id) }));
  return { t, ...ids, form: form!, cleanerArgs, ownerAuth, login, submit, state };
}

describe("canonical cleaner job submission", () => {
  beforeEach(() => { process.env.APP_URL = "http://localhost:5173"; });

  it("submits form and job once with performed-worker evidence and no extra completion mutation", async () => {
    const s = await setup();
    expect(await s.t.query(api.queries.jobs.get, { ...s.cleanerArgs, jobId: s.job })).toMatchObject({ canCurrentUserSubmit: true });
    await s.submit();
    const state = await s.state();
    expect(state.job).toMatchObject({ status: "submitted", submittedExecutionSequence: 1 });
    expect(state.form).toMatchObject({ status: "submitted", submittedAt: state.job?.completedAt });
    expect(state.job?.executionHistory?.[0].workers.map(w => w.userId)).toEqual([s.cleaner]);
  });

  it("ends a pause atomically when submitting and stops the timer at the same timestamp", async () => {
    const s = await setup();
    await s.t.mutation(api.mutations.jobs.pauseJob, { ...s.cleanerArgs, jobId: s.job, reason: "break" });
    await s.submit();
    const { job } = await s.state();
    expect(job?.currentPauseStartedAt).toBeUndefined();
    expect(job?.pauseHistory?.[0].resumedAt).toBe(job?.completedAt);
    expect(job?.status).toBe("submitted");
  });

  it("rejects missing inventory and checklist work without partial submission", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.job, { inventoryChecklist: [{ name: "Soap", category: "Supplies", parLevel: 2, required: true }] }));
    await expect(s.submit()).rejects.toThrow("required inventory");
    expect((await s.state()).job?.executionHistory).toBeUndefined();
    await s.t.mutation(api.mutations.jobs.updateInventoryChecklistItem, { ...s.cleanerArgs, jobId: s.job, itemName: "Soap", status: "low" });
    const item = await s.t.run(ctx => ctx.db.query("formItems").withIndex("by_formId", q => q.eq("formId", s.form._id)).first());
    await s.t.mutation(api.mutations.forms.updateItem, { ...s.cleanerArgs, itemId: item!._id, completed: false });
    await expect(s.submit()).rejects.toThrow("not completed");
    expect((await s.state()).form?.status).toBe("in_progress");
    await s.t.mutation(api.mutations.forms.updateItem, { ...s.cleanerArgs, itemId: item!._id, completed: true });
    await s.submit();
    expect((await s.state()).job?.status).toBe("submitted");
  });

  it("requires a nonempty eligible performed-worker roster", async () => {
    const s = await setup();
    await expect(s.submit([])).rejects.toThrow("Confirm the workers");
    await expect(s.submit([s.member])).rejects.toThrow("current available job assignee");
    expect((await s.state()).job?.status).toBe("in_progress");
  });

  it("lets members edit but only the team lead submit, with matching query capability", async () => {
    const s = await setup(true);
    const auth = await s.login("member");
    const memberArgs = { userId: s.member, sessionToken: auth.sessionToken };
    expect(await s.t.query(api.queries.jobs.get, { ...memberArgs, jobId: s.job })).toMatchObject({ canCurrentUserExecute: true, canCurrentUserSubmit: false });
    const item = await s.t.run(ctx => ctx.db.query("formItems").withIndex("by_formId", q => q.eq("formId", s.form._id)).first());
    await s.t.mutation(api.mutations.forms.updateItem, { ...memberArgs, itemId: item!._id, completed: true });
    await expect(s.t.mutation(api.mutations.forms.submit, { ...memberArgs, formId: s.form._id, performedWorkerIds: [s.member] })).rejects.toThrow("team lead");
    await s.submit([s.cleaner, s.member]);
    expect((await s.state()).job?.status).toBe("submitted");
  });

  it("preserves authorized manager submission and denies it when capability is removed", async () => {
    const s = await setup(true);
    const auth = await s.login("manager");
    const args = { userId: s.manager, sessionToken: auth.sessionToken };
    expect(await s.t.query(api.queries.jobs.get, { ...args, jobId: s.job })).toMatchObject({ canCurrentUserSubmit: true });
    await s.t.run(ctx => ctx.db.patch(s.manager, { canApproveForms: false }));
    expect(await s.t.query(api.queries.jobs.get, { ...args, jobId: s.job })).toMatchObject({ canCurrentUserSubmit: false });
    await expect(s.t.mutation(api.mutations.forms.submit, { ...args, formId: s.form._id, performedWorkerIds: [s.manager] })).rejects.toThrow("team lead");
    await s.t.run(ctx => ctx.db.patch(s.manager, { canApproveForms: true }));
    await s.t.mutation(api.mutations.forms.submit, { ...args, formId: s.form._id, performedWorkerIds: [s.manager] });
    expect((await s.state()).job?.status).toBe("submitted");
  });

  it("reopens rework and records a new submitted round without duplicating the original", async () => {
    const s = await setup();
    await s.submit();
    await s.t.mutation(api.mutations.forms.requestRework, { formId: s.form._id, userId: s.owner, sessionToken: s.ownerAuth.sessionToken, notes: "Redo bathroom" });
    await expect(s.submit()).rejects.toThrow("not in progress");
    await s.t.mutation(api.mutations.jobs.startJob, { ...s.cleanerArgs, jobId: s.job });
    expect((await s.state()).form?.status).toBe("in_progress");
    await s.submit();
    expect((await s.state()).job).toMatchObject({ status: "submitted", submittedExecutionSequence: 2, reworkCount: 1 });
  });

  it("keeps duplicate submissions safe across both entry points and after approval", async () => {
    const s = await setup();
    await s.submit();
    const original = await s.state();
    await expect(s.submit()).resolves.toMatchObject({ alreadySubmitted: true });
    await expect(s.t.mutation(api.mutations.jobs.completeJob, { ...s.cleanerArgs, jobId: s.job })).resolves.toMatchObject({ alreadySubmitted: true });
    await s.t.mutation(api.mutations.forms.approve, { formId: s.form._id, userId: s.owner, sessionToken: s.ownerAuth.sessionToken });
    await expect(s.submit()).resolves.toMatchObject({ alreadySubmitted: true });
    const current = await s.state();
    expect(current.job?.executionHistory).toHaveLength(1);
    expect(current.job?.completedAt).toBe(original.job?.completedAt);
    expect(current.job?.status).toBe("approved");
    const notifications = await s.t.run(ctx => ctx.db.query("notifications").collect());
    expect(notifications.filter(n => n.type === "job_submitted")).toHaveLength(1);
  });
});
