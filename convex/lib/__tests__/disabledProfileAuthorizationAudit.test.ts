import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";
import { hashToken } from "../tokens";
import { SESSION_REQUIRED_ERROR } from "../sessionConstants";
import { sendJobAssignedEmail } from "../email";

vi.mock("../email", async original => ({ ...await original<typeof import("../email")>(), sendJobAssignedEmail: vi.fn() }));
const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "review-password-123";
beforeEach(() => { vi.stubEnv("TOKEN_PEPPER", "test-token-pepper"); vi.stubEnv("APP_URL", "http://localhost:5173"); vi.mocked(sendJobAssignedEmail).mockClear(); });
afterEach(() => vi.unstubAllEnvs());

async function setup(role: "cleaner" | "manager" | "maintenance" = "cleaner", teamOnly = false, withProfile = true) {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const ids = await t.run(async ctx => {
    const company = await ctx.db.insert("companies", { name: "Audit", timezone: "UTC", subscriptionStatus: "active" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Foreign", timezone: "UTC" });
    const owner = await ctx.db.insert("users", { companyId: company, name: "Owner", email: "owner@audit.test", passwordHash, role: "owner", status: "active" });
    const worker = await ctx.db.insert("users", { companyId: company, name: "Worker", email: "worker@audit.test", passwordHash, role, status: "active", canSeeAllJobs: role === "manager", canManageTeam: role === "manager", canCreateJobs: role === "manager", canAssignCleaners: role === "manager", canApproveForms: role === "manager", canManageSchedule: role === "manager", canViewFinancials: role === "manager" });
    const property = await ctx.db.insert("properties", { companyId: company, name: "Private home", address: "Private address", type: "residential", active: true, amenities: [] });
    const team = await ctx.db.insert("teams", { companyId: company, name: "Team", active: true, createdBy: owner, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("teamMembers", { companyId: company, teamId: team, userId: worker, active: true, role: "lead", addedAt: 1 });
    const job = await ctx.db.insert("jobs", { companyId: company, propertyId: property, cleanerIds: teamOnly ? [] : [worker], assignedTeamId: teamOnly ? team : undefined, assignedManagerId: role === "manager" ? worker : undefined, status: "confirmed", type: role === "maintenance" ? "maintenance" : "standard", scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0 });
    const profile = withProfile ? await ctx.db.insert("workerProfiles", { companyId: company, userId: worker, workerType: "w2_employee", workerStatus: "active", primaryRole: role, eligibleRoles: [role], onboardingStatus: "complete", jobEligibilityStatus: "eligible", createdAt: 1, updatedAt: 1 }) : undefined;
    return { company, foreignCompany, owner, worker, team, job, property, profile };
  });
  const login = () => t.action(api.authActions.signIn, { email: "worker@audit.test", password: PASSWORD });
  const workerSession = await login();
  const ownerSession = await t.action(api.authActions.signIn, { email: "owner@audit.test", password: PASSWORD });
  await t.run(ctx => ctx.db.patch(ids.owner, { email: "" })); // No completion email scheduled.
  const oldAuth = { userId: ids.worker, sessionToken: workerSession.sessionToken };
  const ownerAuth = { userId: ids.owner, sessionToken: ownerSession.sessionToken };
  const form = await t.mutation(api.mutations.forms.createFromTemplate, { sessionToken: oldAuth.sessionToken, cleanerId: ids.worker, jobId: ids.job, companyId: ids.company });
  const items = await t.query(api.queries.forms.getItems, { ...oldAuth, formId: form });
  return { t, ...ids, login, oldAuth, ownerAuth, form, item: items[0]._id };
}
type Setup = Awaited<ReturnType<typeof setup>>;
async function gapSession(s: Setup) {
  const token = "preexisting-gap-token";
  await s.t.run(ctx => ctx.db.insert("authSessions", { principalType: "staff", userId: s.worker, tokenHash: hashToken(token), version: 1, createdAt: Date.now(), lastUsedAt: Date.now(), expiresAt: Date.now() + 3600000, idleExpiresAt: Date.now() + 3600000 }));
  return { userId: s.worker, sessionToken: token };
}
async function operationalSnapshot(s: Setup) {
  return s.t.run(async ctx => ({ job: await ctx.db.get(s.job), form: await ctx.db.get(s.form), items: await ctx.db.query("formItems").collect(), users: await ctx.db.query("users").collect(), payments: await ctx.db.query("cleanerPayments").collect(), obligations: await ctx.db.query("outgoingObligations").collect(), terms: await ctx.db.query("outgoingTerms").collect(), settlements: await ctx.db.query("outgoingSettlements").collect(), allocations: await ctx.db.query("outgoingSettlementAllocations").collect(), financialEvents: await ctx.db.query("outgoingEvents").collect(), audit: await ctx.db.query("auditLog").collect(), notifications: await ctx.db.query("notifications").collect(), clientEvents: await ctx.db.query("clientSchedulingEvents").collect(), emails: await ctx.db.query("operationalEmailDeliveries").collect(), scheduled: await ctx.db.system.query("_scheduled_functions").collect(), availability: await ctx.db.query("cleanerAvailability").collect() }));
}
async function assertBlocked(s: Setup, auth = s.oldAuth) {
  for (const call of [
    () => s.t.query(api.queries.jobs.get, { ...auth, jobId: s.job }),
    () => s.t.query(api.queries.jobs.list, { ...auth, companyId: s.company }),
    () => s.t.query(api.queries.jobs.getCalendarJobs, { ...auth, companyId: s.company, startDate: "2030-01-01", endDate: "2030-01-31" }),
    () => s.t.query(api.queries.forms.getByJob, { ...auth, jobId: s.job }),
    () => s.t.query(api.queries.forms.getItems, { ...auth, formId: s.form }),
    () => s.t.query(api.queries.teams.get, { ...auth, teamId: s.team }),
    () => s.t.query(api.queries.teams.listMyTeams, auth),
    () => s.t.query(api.queries.workers.getWorkerProfileForUser, auth),
    () => s.t.query(api.queries.notifications.list, auth),
    () => s.t.query(api.queries.availability.getMyWeeklyAvailability, auth),
    () => s.t.query(api.queries.stripeConnect.getMyStripeConnectStatus, auth),
    () => s.t.query(api.outgoingQueries.listRecipientHistory, { ...auth, paginationOpts: { numItems: 10, cursor: null } }),
    () => s.t.mutation(api.mutations.jobs.startJob, { ...auth, jobId: s.job }),
    () => s.t.mutation(api.mutations.jobs.arriveJob, { ...auth, jobId: s.job }),
    () => s.t.mutation(api.mutations.jobs.pauseJob, { ...auth, jobId: s.job, reason: "break" }),
    () => s.t.mutation(api.mutations.jobs.completeJob, { ...auth, jobId: s.job, performedWorkerIds: [s.worker] }),
    () => s.t.mutation(api.mutations.forms.updateItem, { ...auth, itemId: s.item, completed: true }),
    () => s.t.mutation(api.mutations.forms.submit, { ...auth, formId: s.form, performedWorkerIds: [s.worker] }),
    () => s.t.mutation(api.attachmentUploads.begin, { sessionToken: auth.sessionToken, target: { kind: "formPhoto", formId: s.form }, mimeType: "image/jpeg" }),
    () => s.t.mutation(api.mutations.redFlags.create, { ...auth, companyId: s.company, jobId: s.job, propertyId: s.property, category: "damage", severity: "low", note: "Blocked" }),
    () => s.t.mutation(api.mutations.availability.setWeeklyAvailability, { ...auth, availability: [] }),
    () => s.t.action(api.actions.stripeConnect.startStripeConnectOnboarding, auth),
  ]) await expect(call()).rejects.toThrow(SESSION_REQUIRED_ERROR);
  expect(await s.t.query(api.authQueries.getCurrentUser, { sessionToken: auth.sessionToken })).toBeNull();
  await expect(s.t.action(api.sessionActions.getStaffPrincipal, { sessionToken: auth.sessionToken })).rejects.toThrow(SESSION_REQUIRED_ERROR);
}

// Replaces PR6's unsafe re-login characterization with founder-approved denial.
describe("worker offboarding session authorization", () => {
  for (const mutation of ["setWorkerStatus", "upsertWorkerProfile"] as const) for (const status of ["inactive", "archived"] as const) {
    it.each([false, true])(`${mutation} ${status} denies fresh password login and direct/team-only=%s access`, async teamOnly => {
      const s = await setup("cleaner", teamOnly), before = await operationalSnapshot(s);
      if (mutation === "setWorkerStatus") await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: status });
      else await s.t.mutation(api.mutations.workers.upsertWorkerProfile, { ...s.ownerAuth, workerUserId: s.worker, workerStatus: status });
      await expect(s.login()).rejects.toThrow("Invalid email or password");
      await assertBlocked(s);
      // Simulate a still-unrevoked session minted by the pre-PR7 gap. Read-time
      // checks must block it even though the session row itself remains valid.
      const gap = await gapSession(s);
      await assertBlocked(s, gap);
      const sessions = await s.t.run(ctx => ctx.db.query("authSessions").withIndex("by_userId", q => q.eq("userId", s.worker)).collect());
      expect(sessions.find(x => x.tokenHash === hashToken(s.oldAuth.sessionToken))?.revokedAt).toBeDefined();
      expect(sessions).toHaveLength(2); // Failed login inserted no new session.
      expect(await operationalSnapshot(s)).toEqual(before);
    });
  }
  it.each(["cleaner", "manager", "maintenance"] as const)("blocks %s on every existing-session check without relying on revocation", async role => {
    const s = await setup(role, true);
    await s.t.run(ctx => ctx.db.patch(s.profile!, { workerStatus: "inactive" }));
    await assertBlocked(s);
    await expect(s.t.mutation(internal.sessionInternal.create, { principal: { principalType: "staff", userId: s.worker }, tokenHash: hashToken("racing-login"), createdAt: Date.now(), expiresAt: Date.now() + 3600000, idleExpiresAt: Date.now() + 3600000 })).rejects.toThrow("Invalid email or password");
  });
  it("blocks Manager delegation and assignedManagerId without disabling Owners", async () => {
    const s = await setup("manager");
    await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "inactive" });
    const gap = await gapSession(s);
    await assertBlocked(s, gap);
    await expect(s.t.mutation(api.mutations.teams.create, { ...gap, companyId: s.company, name: "Blocked" })).rejects.toThrow(SESSION_REQUIRED_ERROR);
    await expect(s.t.mutation(api.mutations.inspections.submit, { ...gap, jobId: s.job, readinessScore: 100, severity: "none" })).rejects.toThrow(SESSION_REQUIRED_ERROR);
    expect(await s.t.query(api.queries.jobs.get, { ...s.ownerAuth, jobId: s.job })).not.toBeNull();
  });
  it("blocks further in-progress work while preserving timers, forms and immutable prior evidence", async () => {
    const s = await setup("cleaner", true);
    await s.t.mutation(api.mutations.jobs.startJob, { ...s.oldAuth, jobId: s.job });
    await s.t.mutation(api.mutations.jobs.pauseJob, { ...s.oldAuth, jobId: s.job, reason: "break" });
    const before = await operationalSnapshot(s);
    await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "archived" });
    await assertBlocked(s);
    expect(await operationalSnapshot(s)).toEqual(before);
  });
  it.each(["active", "pending", "missing"] as const)("retains %s profile compatibility and independent role/delegation rules", async status => {
    const s = await setup("cleaner", false, status !== "missing");
    if (status === "pending") await s.t.run(ctx => ctx.db.patch(s.profile!, { workerStatus: "pending", onboardingStatus: "blocked", jobEligibilityStatus: "ineligible" }));
    const session = await s.login(), auth = { userId: s.worker, sessionToken: session.sessionToken };
    expect(await s.t.query(api.queries.jobs.get, { ...auth, jobId: s.job })).toMatchObject({ canCurrentUserExecute: true });
    await expect(s.t.mutation(api.mutations.jobs.startJob, { ...auth, jobId: s.job })).resolves.toBeNull();
    await s.t.run(ctx => ctx.db.patch(s.worker, { role: "maintenance" }));
    await expect(s.t.mutation(api.mutations.jobs.pauseJob, { ...auth, jobId: s.job, reason: "break" })).rejects.toThrow("Job execution is unavailable");
  });
  it.each(["active", "pending", "missing"] as const)("independently denies inactive users with %s profiles", async status => {
    const s = await setup("cleaner", false, status !== "missing");
    if (status === "pending") await s.t.run(ctx => ctx.db.patch(s.profile!, { workerStatus: "pending" }));
    await s.t.mutation(api.mutations.employees.updateEmployeeStatus, { ...s.ownerAuth, employeeId: s.worker, status: "inactive" });
    await expect(s.login()).rejects.toThrow("Invalid email or password");
    await assertBlocked(s);
  });
  it.each(["setWorkerStatus", "upsertWorkerProfile"] as const)("%s reactivation requires fresh login and never restores revoked/gap sessions", async mutation => {
    const s = await setup("cleaner", true);
    const change = (workerStatus: "active" | "archived") => mutation === "setWorkerStatus" ? s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus }) : s.t.mutation(api.mutations.workers.upsertWorkerProfile, { ...s.ownerAuth, workerUserId: s.worker, workerStatus });
    await change("archived"); const gap = await gapSession(s); await change("active");
    await assertBlocked(s); await assertBlocked(s, gap);
    const session = await s.login(), auth = { userId: s.worker, sessionToken: session.sessionToken };
    expect(await s.t.query(api.queries.jobs.get, { ...auth, jobId: s.job })).not.toBeNull();
    await s.t.mutation(api.mutations.teams.removeMember, { ...s.ownerAuth, membershipId: (await s.t.run(ctx => ctx.db.query("teamMembers").withIndex("by_teamId_userId", q => q.eq("teamId", s.team).eq("userId", s.worker)).unique()))!._id });
    expect(await s.t.query(api.queries.jobs.get, { ...auth, jobId: s.job })).toBeNull();
    await expect(s.t.mutation(api.mutations.jobs.startJob, { ...auth, jobId: s.job })).rejects.toThrow("Not assigned");
  });
  it.each(["foreign", "duplicate-active", "duplicate-disabled"] as const)("fails closed on %s profiles without arbitrary profile selection or writes", async kind => {
    const s = await setup();
    await s.t.run(async ctx => {
      if (kind === "foreign") await ctx.db.patch(s.profile!, { companyId: s.foreignCompany });
      else { const { _id, _creationTime, ...fields } = (await ctx.db.get(s.profile!))!; await ctx.db.insert("workerProfiles", { ...fields, workerStatus: kind === "duplicate-active" ? "active" : "archived" }); }
    });
    await expect(s.login()).rejects.toThrow("Invalid email or password"); await assertBlocked(s);
    await expect(s.t.mutation(api.mutations.workers.upsertWorkerProfile, { ...s.ownerAuth, workerUserId: s.worker, workerStatus: "active" })).rejects.toThrow("owner review");
  });
  it("does not let an owned malformed profile revoke a foreign user's sessions", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.worker, { companyId: s.foreignCompany }));
    const before = await s.t.run(ctx => ctx.db.query("authSessions").collect());
    await expect(s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "inactive" })).rejects.toThrow("owner review");
    await expect(s.t.query(api.queries.workers.getWorkerDetail, { ...s.ownerAuth, workerProfileId: s.profile! })).rejects.toThrow("owner review");
    await expect(s.t.query(api.queries.workers.listWorkersForCompany, s.ownerAuth)).rejects.toThrow("owner review");
    expect(await s.t.run(ctx => ctx.db.query("authSessions").collect())).toEqual(before);
  });
  it("does not apply worker-profile lifecycle to Owners", async () => {
    const s = await setup();
    await s.t.run(async ctx => {
      const { _id, _creationTime, ...profile } = (await ctx.db.get(s.profile!))!;
      await ctx.db.insert("workerProfiles", { ...profile, userId: s.owner, companyId: s.foreignCompany, workerStatus: "archived" });
      await ctx.db.patch(s.owner, { email: "owner@audit.test" });
    });
    const session = await s.t.action(api.authActions.signIn, { email: "owner@audit.test", password: PASSWORD });
    expect(await s.t.query(api.queries.jobs.get, { userId: s.owner, sessionToken: session.sessionToken, jobId: s.job })).not.toBeNull();
    await s.t.mutation(api.mutations.employees.updateEmployeeStatus, { ...s.ownerAuth, employeeId: s.owner, status: "inactive" });
    await expect(s.t.action(api.authActions.signIn, { email: "owner@audit.test", password: PASSWORD })).rejects.toThrow("Invalid email or password");
  });
  it("rejects attempts to offboard an Owner through a stale worker profile", async () => {
    const s = await setup();
    const profile = await s.t.run(async ctx => {
      const { _id, _creationTime, ...fields } = (await ctx.db.get(s.profile!))!;
      return ctx.db.insert("workerProfiles", { ...fields, userId: s.owner });
    });
    await expect(s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: profile, workerStatus: "inactive" })).rejects.toThrow("Owner account lifecycle");
    expect(await s.t.query(api.queries.jobs.get, { ...s.ownerAuth, jobId: s.job })).not.toBeNull();
  });
  it("blocks creation of an already-disabled profile's new sessions", async () => {
    const s = await setup("cleaner", true, false);
    await s.t.mutation(api.mutations.workers.upsertWorkerProfile, { ...s.ownerAuth, workerUserId: s.worker, workerStatus: "archived" });
    await assertBlocked(s); await expect(s.login()).rejects.toThrow("Invalid email or password");
  });
  it("keeps multi-worker decline policy separate from profile communications", async () => {
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
  it("suppresses unidentified legacy assignment email rather than bypass offboarding checks", async () => {
    const s = await setup();
    await expect(s.t.action(internal.actions.emailNotifications.sendJobAssigned, { email: "worker@audit.test", propertyName: "Private home", scheduledDate: "2030-01-02", companyName: "Audit" })).resolves.toBeNull();
    expect(sendJobAssignedEmail).not.toHaveBeenCalled();
    expect(await s.t.run(ctx => ctx.db.query("operationalEmailDeliveries").collect())).toEqual([]);
  });
  it.each(["submitted", "approved"] as const)("preserves %s evidence, obligations and settlements, with Owner history access", async status => {
    const s = await setup();
    const evidence = { sequence: 1, provenance: "submission_confirmed" as const, confirmedById: s.worker, confirmedAt: 1, scheduledDate: "2030-01-02", workers: [{ userId: s.worker, displayName: "Worker", role: "cleaner" }] };
    await s.t.run(async ctx => {
      await ctx.db.patch(s.job, { status, executionHistory: [evidence], submittedExecutionSequence: 1, approvedExecutionSequence: status === "approved" ? 1 : undefined });
      await ctx.db.patch(s.form, { status });
      await ctx.db.patch(s.worker, { stripeConnectAccountId: "acct_history", stripeConnectPayoutsEnabled: true });
      await ctx.db.insert("cleanerPayments", { companyId: s.company, jobId: s.job, cleanerUserId: s.worker, amountCents: 5000, status: "OPEN", createdAt: 1 });
    });
    const obligation = status === "approved" ? await s.t.mutation(api.workerCompensation.reviewCompensation, { ...s.ownerAuth, jobId: s.job, workerId: s.worker, amountCents: 5000, reason: "Verified work" }) : null;
    if (obligation) await s.t.mutation(api.outgoingMutations.recordOutsideSettlement, { ...s.ownerAuth, recipient: { type: "worker", userId: s.worker }, currency: "USD", amountCents: 1000, paymentDate: "2020-01-02", method: "cash", idempotencyKey: "synthetic-preservation", selectedObligationIds: [obligation] });
    const before = await operationalSnapshot(s);
    await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "archived" });
    await expect(s.login()).rejects.toThrow("Invalid email or password");
    await expect(s.t.query(api.queries.jobs.get, { ...s.oldAuth, jobId: s.job })).rejects.toThrow(SESSION_REQUIRED_ERROR);
    const gap = await gapSession(s);
    await expect(s.t.query(api.outgoingQueries.listRecipientHistory, { ...gap, paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow(SESSION_REQUIRED_ERROR);
    expect(await operationalSnapshot(s)).toEqual(before);
    expect(await s.t.query(api.queries.jobs.get, { ...s.ownerAuth, jobId: s.job })).toMatchObject({ executionHistory: [evidence] });
    if (obligation) expect(await s.t.query(api.outgoingQueries.getObligationDetail, { ...s.ownerAuth, obligationId: obligation })).toMatchObject({ obligation: { basePrincipalCents: 5000, settledCents: 1000 } });
  });
  it.each(["accepted", "pending"] as const)("keeps %s shared-job and foreign-company authorization independent of offboarding", async status => {
    const s = await setup("cleaner", true);
    const original = await s.t.run(async ctx => {
      const original = await ctx.db.insert("jobs", { companyId: s.foreignCompany, cleanerIds: [], type: "standard", status: "confirmed", scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0 });
      await ctx.db.patch(s.job, { sharedFromJobId: original, sharedFromCompanyName: "Foreign" });
      await ctx.db.insert("sharedJobs", { originalJobId: original, copiedJobId: s.job, fromCompanyId: s.foreignCompany, toCompanyId: s.company, sharePackage: false, status });
      return original;
    });
    await expect(s.t.query(api.queries.jobs.get, { ...s.oldAuth, jobId: original })).rejects.toThrow("Access denied");
    const before = await operationalSnapshot(s);
    await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "inactive" });
    await assertBlocked(s);
    expect(await operationalSnapshot(s)).toEqual(before);
    await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "active" });
    const login = await s.login(), auth = { userId: s.worker, sessionToken: login.sessionToken };
    await expect(s.t.query(api.queries.jobs.get, { ...auth, jobId: original })).rejects.toThrow("Access denied");
    if (status === "accepted") await expect(s.t.mutation(api.mutations.jobs.startJob, { ...auth, jobId: s.job })).resolves.toBeNull();
    else await expect(s.t.mutation(api.mutations.jobs.startJob, { ...auth, jobId: s.job })).rejects.toThrow();
  });
  it("suppresses a disabled assigned Manager's new quality-work notification", async () => {
    const s = await setup("manager");
    await s.t.run(async ctx => {
      await ctx.db.patch(s.job, { inspectionCycleOpen: false });
      await ctx.db.insert("managerInspections", { companyId: s.company, jobId: s.job, managerId: s.worker, readinessScore: 10, severity: "none", createdAt: 1 });
    });
    await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "inactive" });
    const before = await s.t.run(ctx => ctx.db.query("notifications").collect());
    await s.t.mutation(api.mutations.inspections.reopenInspection, { ...s.ownerAuth, jobId: s.job });
    expect(await s.t.run(ctx => ctx.db.query("notifications").collect())).toEqual(before);
  });
  it("does not bypass a disabled workforce profile by changing to another non-Owner role", async () => {
    const s = await setup();
    await s.t.run(async ctx => { await ctx.db.patch(s.worker, { role: "affiliate" }); await ctx.db.patch(s.profile!, { workerStatus: "archived" }); });
    await expect(s.login()).rejects.toThrow("Invalid email or password"); await assertBlocked(s);
  });
  it("retains financial evidence candidates separately from worker session authorization", async () => {
    const s = await setup();
    await s.t.mutation(api.mutations.workers.setWorkerStatus, { ...s.ownerAuth, workerProfileId: s.profile!, workerStatus: "inactive" });
    expect(await s.t.query(api.workerCompensation.submissionCandidates, { ...s.ownerAuth, jobId: s.job })).toContainEqual({ userId: s.worker, displayName: "Worker" });
    await expect(s.t.query(api.workerCompensation.submissionCandidates, { ...s.oldAuth, jobId: s.job })).rejects.toThrow(SESSION_REQUIRED_ERROR);
  });
  it("omits foreign team references from an owned worker profile detail", async () => {
    const s = await setup();
    await s.t.run(async ctx => {
      const teamId = await ctx.db.insert("teams", { companyId: s.foreignCompany, name: "Foreign team", createdBy: s.owner, active: true, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("teamMembers", { companyId: s.company, userId: s.worker, teamId, active: true, role: "member", addedAt: 1 });
    });
    const detail = await s.t.query(api.queries.workers.getWorkerDetail, { ...s.ownerAuth, workerProfileId: s.profile! });
    expect(detail.teams.map((m: { teamId: string }) => m.teamId)).toEqual([s.team]);
  });

});
