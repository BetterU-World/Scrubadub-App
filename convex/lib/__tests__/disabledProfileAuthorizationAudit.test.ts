import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "review-password-123";

async function setup(role: "cleaner" | "manager" | "maintenance" = "cleaner", teamOnly = false, withProfile = true) {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const ids = await t.run(async ctx => {
    const company = await ctx.db.insert("companies", { name: "Audit", timezone: "UTC", subscriptionStatus: "active" });
    const owner = await ctx.db.insert("users", { companyId: company, name: "Owner", email: "owner@audit.test", passwordHash, role: "owner", status: "active" });
    const worker = await ctx.db.insert("users", { companyId: company, name: "Worker", email: "worker@audit.test", passwordHash, role, status: "active", ...(role === "manager" ? { canSeeAllJobs: true } : {}) });
    const team = await ctx.db.insert("teams", { companyId: company, name: "Team", active: true, createdBy: owner, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("teamMembers", { companyId: company, teamId: team, userId: worker, active: true, role: "lead", addedAt: 1 });
    const job = await ctx.db.insert("jobs", { companyId: company, cleanerIds: teamOnly ? [] : [worker], assignedTeamId: teamOnly ? team : undefined, status: "confirmed", type: role === "maintenance" ? "maintenance" : "standard", scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0 });
    const profile = withProfile ? await ctx.db.insert("workerProfiles", { companyId: company, userId: worker, workerType: "w2_employee", workerStatus: "active", primaryRole: role, eligibleRoles: [role], onboardingStatus: "complete", jobEligibilityStatus: "eligible", createdAt: 1, updatedAt: 1 }) : undefined;
    return { company, owner, worker, team, job, profile };
  });
  const login = () => t.action(api.authActions.signIn, { email: "worker@audit.test", password: PASSWORD });
  const workerSession = await login();
  const ownerSession = await t.action(api.authActions.signIn, { email: "owner@audit.test", password: PASSWORD });
  return { t, ...ids, login, oldAuth: { userId: ids.worker, sessionToken: workerSession.sessionToken }, ownerAuth: { userId: ids.owner, sessionToken: ownerSession.sessionToken } };
}

// Characterization of an unresolved product-policy gap, NOT a claim that re-login
// access is safe or founder-approved. Change expectations with that decision.
describe("disabled profile authorization audit: current behavior pending policy", () => {
  for (const mutation of ["setWorkerStatus", "upsertWorkerProfile"] as const) {
    for (const status of ["inactive", "archived"] as const) {
      it.each([false, true])(`${mutation} ${status} revokes old sessions but fresh login authorizes team-only=%s work`, async teamOnly => {
        const s = await setup("cleaner", teamOnly);
        if (mutation === "setWorkerStatus") await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: status });
        else await s.t.mutation(api.mutations.workers.upsertWorkerProfile, { ...s.ownerAuth, workerUserId: s.worker, workerStatus: status });
        await expect(s.t.query(api.queries.jobs.get, { ...s.oldAuth, jobId: s.job })).rejects.toThrow();
        await expect(s.t.mutation(api.mutations.jobs.startJob, { ...s.oldAuth, jobId: s.job })).rejects.toThrow();
        const session = await s.login(), auth = { userId: s.worker, sessionToken: session.sessionToken };
        expect(await s.t.action(api.sessionActions.getStaffPrincipal, { sessionToken: session.sessionToken })).toMatchObject({ userId: s.worker });
        expect(await s.t.query(api.queries.jobs.get, { ...auth, jobId: s.job })).toMatchObject({ canCurrentUserExecute: true });
        await s.t.mutation(api.mutations.jobs.startJob, { ...auth, jobId: s.job });
        const form = await s.t.query(api.queries.forms.getByJob, { ...auth, jobId: s.job });
        expect(form).not.toBeNull();
        expect(await s.t.query(api.workerCompensation.submissionCandidates, { ...auth, jobId: s.job })).toContainEqual({ userId: s.worker, displayName: "Worker" });
        await expect(s.t.mutation(api.attachmentUploads.begin, { sessionToken: session.sessionToken, target: { kind: "formPhoto", formId: form!._id }, mimeType: "image/jpeg" })).resolves.toHaveProperty("intentId");
        expect(await s.t.query(api.outgoingQueries.listRecipientHistory, { ...auth, paginationOpts: { numItems: 10, cursor: null } })).toMatchObject({ page: [] });
        expect(await s.t.run(ctx => ctx.db.get(s.worker))).toMatchObject({ status: "active" });
        expect(await s.t.run(ctx => ctx.db.get(s.profile!))).toMatchObject({ workerStatus: status });
      });
    }
  }
  it("preserves a disabled Manager's independent grants, which do not imply execution", async () => {
    const s = await setup("manager");
    await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "inactive" });
    const login = await s.login(), auth = { userId: s.worker, sessionToken: login.sessionToken };
    expect(await s.t.query(api.queries.jobs.get, { ...auth, jobId: s.job })).toMatchObject({ canCurrentUserExecute: true });
    await expect(s.t.mutation(api.mutations.jobs.arriveJob, { ...auth, jobId: s.job })).resolves.toBeNull();
    await s.t.run(ctx => ctx.db.patch(s.job, { cleanerIds: [] }));
    expect(await s.t.query(api.queries.jobs.get, { ...auth, jobId: s.job })).toMatchObject({ canCurrentUserExecute: false });
    await expect(s.t.mutation(api.mutations.jobs.startJob, { ...auth, jobId: s.job })).rejects.toThrow("Not assigned");
    expect(await s.t.query(api.queries.jobs.get, { ...s.ownerAuth, jobId: s.job })).not.toBeNull();
    await s.t.run(ctx => ctx.db.patch(s.worker, { canSeeAllJobs: false }));
    expect(await s.t.query(api.queries.jobs.get, { ...auth, jobId: s.job })).toBeNull();
    await s.t.run(ctx => ctx.db.patch(s.job, { assignedManagerId: s.worker }));
    expect(await s.t.query(api.queries.jobs.get, { ...auth, jobId: s.job })).not.toBeNull();
  });
  it("also characterizes maintenance-profile re-login without changing role compatibility", async () => {
    const s = await setup("maintenance", true);
    await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "archived" });
    const login = await s.login();
    await expect(s.t.mutation(api.mutations.jobs.startJob, { userId: s.worker, sessionToken: login.sessionToken, jobId: s.job })).resolves.toBeNull();
  });
  it("retains legacy workers without profiles and leaves users.status as the account gate", async () => {
    const s = await setup("cleaner", false, false);
    await expect(s.t.mutation(api.mutations.jobs.startJob, { ...s.oldAuth, jobId: s.job })).resolves.toBeNull();
    await s.t.mutation(api.mutations.employees.updateEmployeeStatus, { ...s.ownerAuth, employeeId: s.worker, status: "inactive" });
    await expect(s.login()).rejects.toThrow("Invalid email or password");
    await expect(s.t.query(api.queries.jobs.get, { ...s.oldAuth, jobId: s.job })).rejects.toThrow();
  });
  it("also characterizes creating an already-disabled profile through upsert", async () => {
    const s = await setup("cleaner", true, false);
    await s.t.mutation(api.mutations.workers.upsertWorkerProfile, { ...s.ownerAuth, workerUserId: s.worker, workerStatus: "archived" });
    await expect(s.t.query(api.queries.jobs.get, { ...s.oldAuth, jobId: s.job })).rejects.toThrow();
    const login = await s.login();
    expect(await s.t.query(api.queries.jobs.get, { userId: s.worker, sessionToken: login.sessionToken, jobId: s.job })).toMatchObject({ canCurrentUserExecute: true });
  });
  it("does not let communication suppression collapse multi-worker decline review into job denial", async () => {
    const s = await setup();
    await s.t.run(async ctx => {
      const other = await ctx.db.insert("users", { companyId: s.company, name: "Other", email: "other@audit.test", passwordHash: "unused", role: "cleaner", status: "active" });
      await ctx.db.insert("workerProfiles", { companyId: s.company, userId: other, workerType: "w2_employee", workerStatus: "inactive", primaryRole: "cleaner", eligibleRoles: ["cleaner"], onboardingStatus: "complete", jobEligibilityStatus: "eligible", createdAt: 1, updatedAt: 1 });
      await ctx.db.patch(s.job, { status: "scheduled", cleanerIds: [s.worker, other] });
    });
    await expect(s.t.mutation(api.mutations.jobs.denyJob, { ...s.oldAuth, jobId: s.job, reason: "Unavailable" })).resolves.toMatchObject({ reviewRequested: true });
    expect(await s.t.run(ctx => ctx.db.get(s.job))).toMatchObject({ status: "scheduled" });
    expect(await s.t.run(ctx => ctx.db.query("clientSchedulingEvents").collect())).toEqual([]);
  });
  it("preserves performed-worker evidence eligibility independently of communications", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.owner, { email: "" })); // No completion email scheduled.
    await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "inactive" });
    const login = await s.login(), auth = { userId: s.worker, sessionToken: login.sessionToken };
    await s.t.mutation(api.mutations.jobs.startJob, { ...auth, jobId: s.job });
    const form = await s.t.query(api.queries.forms.getByJob, { ...auth, jobId: s.job });
    const items = await s.t.query(api.queries.forms.getItems, { ...auth, formId: form!._id });
    for (const item of items) await s.t.mutation(api.mutations.forms.updateItem, { ...auth, itemId: item._id, completed: true });
    await s.t.mutation(api.mutations.forms.submit, { ...auth, formId: form!._id, performedWorkerIds: [s.worker] });
    expect(await s.t.run(ctx => ctx.db.get(s.job))).toMatchObject({ status: "submitted", executionHistory: [expect.objectContaining({ workers: [expect.objectContaining({ userId: s.worker })] })] });
  });
});
