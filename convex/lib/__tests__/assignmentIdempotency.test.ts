import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.parse("2030-01-01T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.stubEnv("APP_URL", "http://localhost:5173");
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });

async function setup(teamAssigned = false) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Assignment Co", timezone: "UTC" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "UTC" });
    const user = async (name: string, role: "owner" | "manager" | "cleaner", company = companyId) => {
      const id = await ctx.db.insert("users", { companyId: company, name, email: `${name}@assignment.test`, passwordHash: "unused", role, status: "active", canAssignCleaners: role === "manager", canCreateJobs: role === "manager" });
      await ctx.db.insert("authSessions", { principalType: "staff", userId: id, tokenHash: hashToken(name), version: 1, createdAt: NOW, lastUsedAt: NOW, expiresAt: NOW + 3_600_000, idleExpiresAt: NOW + 3_600_000 });
      return id;
    };
    const owner = await user("owner", "owner");
    const manager = await user("manager", "manager");
    const cleaner = await user("cleaner", "cleaner");
    const replacement = await user("replacement", "cleaner");
    const foreignOwner = await user("foreign", "owner", otherCompanyId);
    const team = await ctx.db.insert("teams", { companyId, name: "Team", active: true, createdBy: owner, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("teamMembers", { companyId, teamId: team, userId: cleaner, role: "lead", active: true, addedAt: NOW });
    const property = await ctx.db.insert("properties", { companyId, name: "Property", address: "1 Main", type: "residential", amenities: [], active: true });
    const job = await ctx.db.insert("jobs", { companyId, propertyId: property, cleanerIds: [cleaner], assignedTeamId: teamAssigned ? team : undefined, type: "standard", status: "confirmed", acceptanceStatus: "accepted", acceptedAt: NOW - 1000, scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0 });
    return { companyId, owner, manager, cleaner, replacement, foreignOwner, team, job };
  });
  const args = { jobId: ids.job, userId: ids.owner, sessionToken: "owner", newCleanerId: ids.cleaner };
  const snapshot = () => t.run(async ctx => ({
    job: await ctx.db.get(ids.job),
    notifications: await ctx.db.query("notifications").collect(),
    audits: await ctx.db.query("auditLog").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    forms: await ctx.db.query("forms").collect(),
  }));
  return { t, ...ids, args, snapshot };
}

describe("reassignment idempotency", () => {
  it.each([false, true])("preserves accepted state and the complete snapshot on repeated unchanged calls (team=%s)", async team => {
    const s = await setup(team);
    const before = await s.snapshot();
    for (let i = 0; i < 3; i++) await s.t.mutation(api.mutations.jobs.reassignJob, s.args);
    expect(await s.snapshot()).toEqual(before);
  });

  it.each(["scheduled", "denied", "in_progress", "submitted", "approved", "rework_requested"] as const)("preserves unchanged %s lifecycle and historical evidence", async status => {
    const s = await setup(true);
    await s.t.run(async ctx => {
      await ctx.db.patch(s.job, { status, acceptanceStatus: status === "denied" ? "denied" : status === "scheduled" ? "pending" : "accepted", deniedAt: status === "denied" ? NOW - 500 : undefined, denyReason: status === "denied" ? "Unavailable" : undefined, startedAt: NOW - 1000, completedAt: status === "submitted" || status === "approved" ? NOW - 100 : undefined, executionHistory: [{ sequence: 1, provenance: "submission_confirmed", confirmedById: s.cleaner, confirmedAt: NOW - 100, scheduledDate: "2030-01-02", workers: [{ userId: s.cleaner, displayName: "Cleaner", role: "cleaner" }] }], submittedExecutionSequence: 1, approvedExecutionSequence: status === "approved" ? 1 : undefined });
      await ctx.db.insert("forms", { companyId: s.companyId, jobId: s.job, cleanerId: s.cleaner, status: status === "approved" ? "approved" : "submitted", submittedAt: NOW - 100 });
    });
    const before = await s.snapshot();
    await s.t.mutation(api.mutations.jobs.reassignJob, s.args);
    expect(await s.snapshot()).toEqual(before);
  });

  it("schedules one notification/email for a changed assignment and none for retries, preserving the team", async () => {
    const s = await setup(true);
    const args = { ...s.args, newCleanerId: s.replacement };
    await s.t.mutation(api.mutations.jobs.reassignJob, args);
    const changed = await s.snapshot();
    expect(changed.job).toMatchObject({ cleanerIds: [s.replacement], assignedTeamId: s.team, status: "scheduled", acceptanceStatus: "pending" });
    expect(changed.notifications).toHaveLength(1);
    expect(changed.notifications[0]).toMatchObject({ userId: s.replacement, type: "job_reassigned" });
    expect(changed.scheduled).toHaveLength(1);
    expect(changed.audits).toHaveLength(1);
    await s.t.mutation(api.mutations.jobs.reassignJob, args);
    await s.t.mutation(api.mutations.jobs.reassignJob, args);
    expect(await s.snapshot()).toEqual(changed);
  });

  it("handles simultaneous identical calls without duplicate notifications", async () => {
    const s = await setup(true);
    await Promise.all(Array.from({ length: 5 }, () => s.t.mutation(api.mutations.jobs.reassignJob, { ...s.args, newCleanerId: s.replacement })));
    const state = await s.snapshot();
    expect(state.notifications).toHaveLength(1);
    expect(state.scheduled).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(state.job?.assignedTeamId).toBe(s.team);
  });

  it("does not mistake membership in a multi-individual assignment for an unchanged replacement", async () => {
    const s = await setup(true);
    await s.t.run(ctx => ctx.db.patch(s.job, { cleanerIds: [s.cleaner, s.replacement] }));
    await s.t.mutation(api.mutations.jobs.reassignJob, s.args);
    const state = await s.snapshot();
    expect(state.job).toMatchObject({ cleanerIds: [s.cleaner], assignedTeamId: s.team, acceptanceStatus: "pending" });
    expect(state.notifications).toHaveLength(1);
  });

  it("still checks session, owner role, tenant, cancellation, and assignee eligibility before a no-op", async () => {
    const s = await setup();
    const before = await s.snapshot();
    await expect(s.t.mutation(api.mutations.jobs.reassignJob, { ...s.args, sessionToken: "invalid" })).rejects.toThrow("verified session");
    await expect(s.t.mutation(api.mutations.jobs.reassignJob, { ...s.args, userId: s.manager, sessionToken: "manager" })).rejects.toThrow("Owner");
    await expect(s.t.mutation(api.mutations.jobs.reassignJob, { ...s.args, userId: s.foreignOwner, sessionToken: "foreign" })).rejects.toThrow("Not your company");
    expect(await s.snapshot()).toEqual(before);
    await s.t.run(ctx => ctx.db.patch(s.job, { status: "cancelled" }));
    await expect(s.t.mutation(api.mutations.jobs.reassignJob, s.args)).rejects.toThrow("Cancelled");
    await s.t.run(async ctx => { await ctx.db.patch(s.job, { status: "confirmed" }); await ctx.db.patch(s.cleaner, { status: "inactive" }); });
    await expect(s.t.mutation(api.mutations.jobs.reassignJob, s.args)).rejects.toThrow("unavailable");
    const state = await s.snapshot();
    expect(state.notifications).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });
});
