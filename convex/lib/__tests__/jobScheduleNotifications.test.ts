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
  const update = (edit: { cleanerIds?: Id<"users">[]; assignedTeamId?: Id<"teams">; clearAssignedTeam?: boolean; type?: Doc<"jobs">["type"]; notes?: string; scheduledDate?: string; startTime?: string; durationMinutes?: number; expectedScheduleRevision?: number } = {}) => t.mutation(api.mutations.jobs.update, { ...auth(), jobId: ids.job, ...edit });
  const patch = (edit: Partial<Doc<"jobs">>) => t.run(ctx => ctx.db.patch(ids.job, edit));
  const job = () => t.run(ctx => ctx.db.get(ids.job));
  const state = () => t.run(async ctx => ({ job: await ctx.db.get(ids.job), notifications: await ctx.db.query("notifications").collect(), audits: await ctx.db.query("auditLog").collect(), scheduled: await ctx.db.system.query("_scheduled_functions").collect(), reviews: await ctx.db.query("workerDeclineReviews").collect(), forms: await ctx.db.query("forms").collect(), members: await ctx.db.query("teamMembers").collect(), shares: await ctx.db.query("sharedJobs").collect() }));
  const createArgs = { ...auth(), companyId: ids.companyId, propertyId: ids.property, cleanerIds: [ids.a, ids.a, ids.c], assignedTeamId: ids.team, type: "standard" as const, scheduledDate: "2030-01-03", durationMinutes: 60 };
  const review = () => t.mutation(api.mutations.jobs.denyJob, { ...auth("a"), jobId: ids.job, reason: "Unavailable" });
  return { t, ...ids, auth, update, patch, jobDoc: job, state, createArgs, review };
}


const changes = (s: Awaited<ReturnType<typeof setup>>) => s.t.run(async ctx => (await ctx.db.query("notifications").collect()).filter(n => n.type === "job_schedule_changed"));
const visible = (s: Awaited<ReturnType<typeof setup>>, name: "a" = "a") => s.t.query(api.queries.notifications.list, s.auth(name));
const count = (s: Awaited<ReturnType<typeof setup>>) => s.t.query(api.queries.notifications.unreadCount, s.auth("a"));

describe("worker schedule change notifications", () => {
  it("creates one atomic direct-assignee notice with safe old/new windows and current label", async () => {
    const s = await setup(); await s.update({ startTime: "09:00", durationMinutes: 90 });
    expect(await changes(s)).toHaveLength(1);
    expect((await changes(s))[0]).toMatchObject({ userId: s.a, companyId: s.companyId,
      scheduleChange: { revision: 1, timezone: "UTC", before: { scheduledDate: "2030-01-02", durationMinutes: 60 }, after: { startTime: "09:00", durationMinutes: 90 } } });
    expect((await visible(s))[0]).toMatchObject({ relatedJobId: s.job, scheduleLabel: "Place" });
    expect(await count(s)).toBe(1); expect((await s.state()).scheduled).toHaveLength(0);
    expect(await s.jobDoc()).toMatchObject({ acceptanceStatus: "accepted", acceptedAt: NOW - 1000 });
  });
  it("permits delegated manager edits without expanding the recipient audience", async () => {
    const s = await setup(); await s.t.mutation(api.mutations.jobs.update, { ...s.auth("noAssign"), jobId: s.job, startTime: "10:00" });
    expect((await changes(s)).map(n => n.userId)).toEqual([s.a]);
  });
  it.each(["noEdit", "a", "foreignOwner"] as const)("rejects unauthorized %s edits without effects", async who => {
    const s = await setup(); const before = await s.state();
    await expect(s.t.mutation(api.mutations.jobs.update, { ...s.auth(who), jobId: s.job, scheduledDate: "2030-01-04" })).rejects.toThrow();
    expect(await s.state()).toEqual(before);
  });
  it("deduplicates team/direct overlap and preserves archived-team effective membership", async () => {
    const s = await setup(); await s.patch({ assignedTeamId: s.team });
    await s.t.run(ctx => ctx.db.patch(s.team, { active: false }));
    await s.update({ scheduledDate: "2030-01-04" });
    expect((await changes(s)).map(n => n.userId).sort()).toEqual([s.a, s.b].sort());
  });
  it("excludes inactive, foreign, removed, invalid-role and unrelated staff", async () => {
    const s = await setup(); await s.patch({ assignedTeamId: s.team, cleanerIds: [s.a, s.inactive, s.foreign, s.owner, s.manager, s.maintenance] });
    await s.t.run(async ctx => {
      await ctx.db.patch(s.b, { status: "inactive" });
      await ctx.db.insert("teamMembers", { companyId: s.foreignCompany, teamId: s.team, userId: s.c, role: "member", active: true, addedAt: NOW });
    });
    await s.update({ durationMinutes: 75 }); expect((await changes(s)).map(n => n.userId)).toEqual([s.a]);
    await s.patch({ cleanerIds: [], assignedTeamId: undefined }); await s.update({ durationMinutes: 80 }); expect(await changes(s)).toHaveLength(1);
  });
  it("does not double-notify workers newly added in the same assignment/schedule edit", async () => {
    const s = await setup(); await s.update({ cleanerIds: [s.a, s.c], startTime: "11:00" });
    expect((await changes(s)).map(n => n.userId)).toEqual([s.a]);
    const added = (await s.state()).notifications.filter(n => n.type === "job_reassigned"); expect(added.map(n => n.userId)).toEqual([s.c]);
  });
  it("ignores cosmetic/no-op edits and equivalent absent/empty time representations", async () => {
    const s = await setup(); await s.update({ notes: "Cosmetic" }); await s.update({ startTime: "", scheduledDate: "2030-01-02", durationMinutes: 60 });
    expect(await changes(s)).toHaveLength(0); expect((await s.jobDoc())?.scheduleRevision).toBeUndefined();
    await s.update({ startTime: "09:00" }); await s.update({ startTime: "09:00", expectedScheduleRevision: 0 }); expect(await changes(s)).toHaveLength(1);
  });
  it.each([{ startTime: "2030-01-02T09:00:00Z" }, { scheduledDate: "2030-02-30" }, { durationMinutes: 0 }])("rejects unsupported/non-local or invalid schedule %j atomically", async edit => {
    const s = await setup(); const before = await s.state(); await expect(s.update(edit)).rejects.toThrow(); expect(await s.state()).toEqual(before);
  });
  it("concurrent duplicate targets converge and rapid changes expose only the current revision", async () => {
    const s = await setup(); await Promise.all(Array.from({ length: 4 }, () => s.update({ startTime: "09:00", expectedScheduleRevision: 0 })));
    expect(await changes(s)).toHaveLength(1);
    await s.update({ startTime: "10:00", expectedScheduleRevision: 1 });
    await expect(s.update({ startTime: "11:00", expectedScheduleRevision: 1 })).rejects.toThrow("Refresh");
    expect(await changes(s)).toHaveLength(2); expect(await visible(s)).toHaveLength(1); expect(await count(s)).toBe(1);
    expect((await visible(s))[0].scheduleChange?.revision).toBe(2);
    await s.update({ startTime: "09:00", expectedScheduleRevision: 2 }); expect(await changes(s)).toHaveLength(3); expect(await visible(s)).toHaveLength(1);
  });
  it.each(["cancelled", "approved", "submitted", "denied"] as const)("does not notify %s jobs", async status => {
    const s = await setup(); await s.patch({ status }); await s.update({ startTime: "09:00" }); expect(await changes(s)).toHaveLength(0);
  });
  it.each(["cancelled", "removed", "inactive", "foreign", "team-removed", "deleted", "job-type"] as const)("suppresses stale details and unread count after %s", async kind => {
    const s = await setup(); if (kind === "team-removed") await s.patch({ cleanerIds: [], assignedTeamId: s.team });
    await s.update({ startTime: "09:00" }); expect(await count(s)).toBe(1);
    await s.t.run(async ctx => {
      if (kind === "cancelled") await ctx.db.patch(s.job, { status: "cancelled" });
      if (kind === "removed") await ctx.db.patch(s.job, { cleanerIds: [] });
      if (kind === "inactive") await ctx.db.patch(s.a, { status: "inactive" });
      if (kind === "foreign") await ctx.db.patch(s.a, { companyId: s.foreignCompany });
      if (kind === "job-type") await ctx.db.patch(s.job, { type: "maintenance" });
      if (kind === "deleted") await ctx.db.delete(s.job);
      if (kind === "team-removed") { const row = await ctx.db.query("teamMembers").withIndex("by_teamId_userId", q => q.eq("teamId", s.team).eq("userId", s.a)).unique(); await ctx.db.patch(row!._id, { active: false }); }
    });
    if (kind === "inactive") { await expect(visible(s)).rejects.toThrow(); await expect(count(s)).rejects.toThrow(); }
    else { expect(await visible(s)).toHaveLength(0); expect(await count(s)).toBe(0); }
  });
  it("creates no schedule notice on initial creation, including source-tagged generated jobs", async () => {
    const s = await setup(); const id = await s.t.mutation(api.mutations.jobs.create, s.createArgs);
    expect(await changes(s)).toHaveLength(0);
    await s.t.run(ctx => ctx.db.patch(id, { generatedFromCommercialSchedule: true }));
    await s.t.mutation(api.mutations.jobs.update, { ...s.auth(), jobId: id, durationMinutes: 120 }); expect((await changes(s)).map(n => n.userId).sort()).toEqual([s.a,s.b,s.c].sort());
  });
  it("keeps partner copies isolated and rechecks shared acceptance at read time", async () => {
    const s = await setup();
    const copy = await s.t.run(async ctx => {
      const id = await ctx.db.insert("jobs", { companyId: s.foreignCompany, cleanerIds: [s.foreign], type: "standard", status: "scheduled", scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0, sharedFromJobId: s.job, sharedFromCompanyName: "Independent", propertySnapshot: { name: "Shared place", address: "Shared address", type: "residential" } });
      const share = await ctx.db.insert("sharedJobs", { originalJobId: s.job, copiedJobId: id, fromCompanyId: s.companyId, toCompanyId: s.foreignCompany, sharePackage: false, status: "accepted" });
      return { id, share };
    });
    await s.update({ startTime: "09:00" }); expect((await changes(s)).map(n => n.userId)).toEqual([s.a]);
    await s.t.mutation(api.mutations.jobs.update, { ...s.auth("foreignOwner"), jobId: copy.id, startTime: "10:00" });
    const auth = { userId: s.foreign, sessionToken: "foreign" };
    expect((await s.t.query(api.queries.notifications.list, auth))[0]).toMatchObject({ relatedJobId: copy.id, scheduleLabel: "Shared place" });
    await s.t.run(ctx => ctx.db.patch(copy.share, { status: "rejected" }));
    expect(await s.t.query(api.queries.notifications.list, auth)).toHaveLength(0);
    expect(await s.t.query(api.queries.notifications.unreadCount, auth)).toBe(0);
    await expect(s.t.mutation(api.mutations.jobs.update, { ...s.auth("foreignOwner"), jobId: copy.id, startTime: "11:00" })).rejects.toThrow();
    expect((await changes(s)).filter(n => n.userId === s.foreign)).toHaveLength(1);
  });
});
