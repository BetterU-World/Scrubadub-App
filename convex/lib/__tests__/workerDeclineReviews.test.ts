import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashToken } from "../tokens";
import { effectiveDeclineWorkers } from "../workerDeclineReviews";
import type { Doc, Id } from "../../_generated/dataModel";

const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.parse("2030-01-01T12:00:00Z");
beforeEach(() => { vi.useFakeTimers({ now: NOW }); vi.stubEnv("APP_URL", "http://localhost:5173"); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Reviews", timezone: "UTC" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Foreign", timezone: "UTC" });
    const makeUser = async (name: string, role: "owner" | "manager" | "cleaner" | "maintenance", flags: Record<string, boolean> = {}, company = companyId, status: "active" | "inactive" = "active") => {
      const id = await ctx.db.insert("users", { companyId: company, email: `${name}@reviews.test`, name, passwordHash: "unused", role, status, ...flags });
      await ctx.db.insert("authSessions", { principalType: "staff", userId: id, tokenHash: hashToken(name), version: 1,
        createdAt: NOW, lastUsedAt: NOW, expiresAt: NOW + 3_600_000, idleExpiresAt: NOW + 3_600_000 });
      return id;
    };
    const owner = await makeUser("owner", "owner");
    const globalManager = await makeUser("globalManager", "manager", { canAssignCleaners: true, canSeeAllJobs: true });
    const assignedManager = await makeUser("assignedManager", "manager", { canManageSchedule: true });
    const blindManager = await makeUser("blindManager", "manager", { canAssignCleaners: true });
    const viewOnly = await makeUser("viewOnly", "manager", { canSeeAllJobs: true });
    const a = await makeUser("a", "cleaner"), b = await makeUser("b", "cleaner"), outsider = await makeUser("outsider", "cleaner");
    const inactive = await makeUser("inactive", "cleaner", {}, companyId, "inactive");
    const inactiveOwner = await makeUser("inactiveOwner", "owner", {}, companyId, "inactive");
    const maintenance = await makeUser("maintenance", "maintenance");
    const foreignOwner = await makeUser("foreignOwner", "owner", {}, foreignCompany);
    const foreign = await makeUser("foreign", "cleaner", {}, foreignCompany);
    const team = await ctx.db.insert("teams", { companyId, name: "Team", active: true, createdBy: owner, createdAt: NOW, updatedAt: NOW });
    const property = await ctx.db.insert("properties", { companyId, name: "Location", address: "1 Main", type: "residential", active: true, amenities: [] });
    const job = await ctx.db.insert("jobs", { companyId, propertyId: property, cleanerIds: [a, b], assignedManagerId: assignedManager,
      status: "scheduled", acceptanceStatus: "pending", scheduledDate: "2030-01-02", startTime: "10:00", durationMinutes: 60, type: "standard", reworkCount: 0,
      inventoryChecklist: [{ name: "Soap", category: "bathroom", parLevel: 1, required: true, status: "ok" }],
      executionHistory: [{ sequence: 1, provenance: "owner_confirmed_historical", confirmedAt: NOW - 100, confirmedById: owner, scheduledDate: "2029-12-31", workers: [{ userId: a, displayName: "a", role: "cleaner" }] }],
    });
    const form = await ctx.db.insert("forms", { jobId: job, companyId, cleanerId: a, status: "in_progress" });
    await ctx.db.insert("formItems", { formId: form, section: "Cleaning", itemName: "Sink", order: 0, completed: true, isRedFlag: false });
    return { companyId, foreignCompany, owner, globalManager, assignedManager, blindManager, viewOnly, a, b, outsider, inactive, inactiveOwner, maintenance, foreignOwner, foreign, team, property, job, form };
  });
  const auth = (name: keyof Pick<typeof ids, "owner" | "globalManager" | "assignedManager" | "blindManager" | "viewOnly" | "a" | "b" | "outsider" | "foreignOwner" | "foreign" | "inactive">) => ({ userId: ids[name], sessionToken: name });
  const request = (kind: "decline" | "cancellation" = "decline", name: "a" | "b" | "outsider" | "foreign" = "a", reason = "Unavailable") =>
    t.mutation(kind === "decline" ? api.mutations.jobs.denyJob : api.mutations.jobs.cleanerCancelJob, { ...auth(name), jobId: ids.job, reason });
  const snapshot = () => t.run(async ctx => ({
    job: await ctx.db.get(ids.job), forms: await ctx.db.query("forms").collect(), items: await ctx.db.query("formItems").collect(),
    members: await ctx.db.query("teamMembers").collect(), shares: await ctx.db.query("sharedJobs").collect(), reservations: await ctx.db.query("calendarReservations").collect(),
  }));
  const reviews = () => t.run(ctx => ctx.db.query("workerDeclineReviews").collect());
  const notices = () => t.run(ctx => ctx.db.query("notifications").collect());
  const scheduled = () => t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
  const list = (name: Parameters<typeof auth>[0] = "owner") => t.query(api.workerDeclineReviews.forJob, { ...auth(name), jobId: ids.job, paginationOpts: { numItems: 10, cursor: null } });
  const resolve = (reviewId: Id<"workerDeclineReviews">, name: Parameters<typeof auth>[0] = "owner") => t.mutation(api.workerDeclineReviews.resolve, { ...auth(name), reviewId });
  const membership = (id: Id<"users">, active = true) => t.run(ctx => ctx.db.insert("teamMembers", { companyId: ids.companyId, teamId: ids.team, userId: id, active, role: "member", addedAt: NOW }));
  const patch = (data: Partial<Omit<Doc<"jobs">, "_id" | "_creationTime">>) => t.run(ctx => ctx.db.patch(ids.job, data));
  return { t, ...ids, auth, request, snapshot, reviews, notices, scheduled, list, resolve, membership, patch };
}

describe("worker decline owner review", () => {
  it.each(["individuals", "team", "combined", "overlap"] as const)("preserves all operational evidence for %s assignments", async mode => {
    const s = await setup();
    if (mode !== "individuals") {
      await s.membership(s.a); await s.membership(s.b);
      await s.patch({ assignedTeamId: s.team, cleanerIds: mode === "team" ? [] : mode === "combined" ? [s.outsider] : [s.a, s.b] });
    }
    const before = await s.snapshot();
    expect(await s.request()).toMatchObject({ reviewRequested: true, replayed: false });
    expect(await s.snapshot()).toEqual(before);
    expect(await s.reviews()).toHaveLength(1);
    expect((await s.reviews())[0]).toMatchObject({ workerId: s.a, workerName: "a", reason: "Unavailable", requestedAt: NOW, status: "pending", kind: "decline" });
    const notices = await s.notices();
    expect(new Set(notices.map(n => n.userId))).toEqual(new Set([s.owner, s.globalManager, s.assignedManager]));
    expect(notices.every(n => n.type === "worker_decline_review")).toBe(true);
    expect(await s.scheduled()).toEqual([]);
    expect(await s.t.query(api.queries.jobs.get, { ...s.auth("a"), jobId: s.job })).not.toBeNull();
  });

  it.each(["individual", "team", "overlap", "inactive-and-incompatible"] as const)("preserves single-effective-worker decline behavior (%s)", async mode => {
    const s = await setup();
    await s.patch({ cleanerIds: [s.a] });
    if (mode !== "individual") {
      await s.membership(s.a);
      await s.patch({ assignedTeamId: s.team, cleanerIds: mode === "team" ? [] : [s.a] });
    }
    if (mode === "inactive-and-incompatible") { await s.membership(s.inactive); await s.membership(s.maintenance); }
    expect(await s.request()).toBeNull();
    expect((await s.snapshot()).job).toMatchObject({ status: "denied", acceptanceStatus: "denied", deniedAt: NOW });
    expect(await s.reviews()).toEqual([]);
    expect((await s.notices()).every(n => n.type === "job_denied")).toBe(true);
  });

  it("counts eligible managers, active membership and overlapping paths once, including existing archived-team access", async () => {
    const s = await setup();
    await s.patch({ cleanerIds: [s.a], assignedTeamId: s.team });
    await s.membership(s.a); await s.membership(s.globalManager); await s.membership(s.b, false);
    await s.membership(s.inactive); await s.membership(s.maintenance); await s.membership(s.foreign);
    await s.t.run(ctx => ctx.db.patch(s.team, { active: false }));
    const workers = await s.t.run(async ctx => (await effectiveDeclineWorkers(ctx, (await ctx.db.get(s.job))!)).map(u => u._id));
    expect(new Set(workers)).toEqual(new Set([s.a, s.globalManager]));
    expect(await s.request()).toMatchObject({ reviewRequested: true });
  });

  it("preserves accepted job state on worker cancellation and legacy one-worker cancellation", async () => {
    const s = await setup();
    await s.patch({ status: "confirmed", acceptanceStatus: "accepted", acceptedAt: NOW - 10, arrivedAt: NOW - 1 });
    const before = await s.snapshot();
    expect(await s.request("cancellation")).toMatchObject({ reviewRequested: true });
    expect(await s.snapshot()).toEqual(before);
    expect((await s.reviews())[0].kind).toBe("cancellation");
    const one = await setup();
    await one.patch({ cleanerIds: [one.a], status: "confirmed", acceptanceStatus: "accepted", acceptedAt: NOW - 10, arrivedAt: NOW - 1 });
    expect(await one.request("cancellation")).toBeNull();
    expect((await one.snapshot()).job).toMatchObject({ status: "denied", acceptanceStatus: "denied", denyReason: "Unavailable" });
    expect((await one.snapshot()).job?.acceptedAt).toBeUndefined();
    expect((await one.snapshot()).job?.arrivedAt).toBeUndefined();
  });

  it("deduplicates sequential/concurrent requests across both kinds and retains the original reason", async () => {
    const s = await setup();
    const first = await s.request();
    const results = await Promise.all(Array.from({ length: 8 }, () => s.request("decline", "a", "Different reason")));
    expect(results.every(result => result?.reviewId === first?.reviewId && result?.replayed)).toBe(true);
    await s.patch({ status: "confirmed", acceptanceStatus: "accepted", acceptedAt: NOW });
    expect(await s.request("cancellation")).toMatchObject({ reviewId: first?.reviewId, replayed: true });
    expect(await s.reviews()).toHaveLength(1);
    expect((await s.reviews())[0]).toMatchObject({ kind: "decline", reason: "Unavailable" });
    expect(await s.notices()).toHaveLength(3);
    expect(await s.scheduled()).toEqual([]);
    expect(await s.t.run(ctx => ctx.db.query("auditLog").collect())).toHaveLength(1);
  });

  it("allows separate requests from different workers", async () => {
    const s = await setup(); await s.request(); await s.request("decline", "b");
    expect(await s.reviews()).toHaveLength(2);
    expect(await s.notices()).toHaveLength(6);
  });

  it("creates only one request/alert set when initial requests arrive concurrently", async () => {
    const s = await setup();
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => s.request()));
    expect(outcomes.filter(result => result?.replayed === false)).toHaveLength(1);
    expect(new Set(outcomes.map(result => result?.reviewId)).size).toBe(1);
    expect(await s.reviews()).toHaveLength(1);
    expect(await s.notices()).toHaveLength(3);
    expect(await s.scheduled()).toEqual([]);
  });

  it("keeps resolved history reachable and permits acknowledging a request after actual job cancellation", async () => {
    const s = await setup(); const first = await s.request();
    await s.resolve(first!.reviewId);
    const second = await s.request();
    const page = await s.t.query(api.workerDeclineReviews.forJob, { ...s.auth("owner"), jobId: s.job, paginationOpts: { numItems: 1, cursor: null } });
    expect(page.page[0]._id).toBe(second!.reviewId);
    expect(page.isDone).toBe(false);
    const history = await s.t.query(api.workerDeclineReviews.forJob, { ...s.auth("owner"), jobId: s.job, paginationOpts: { numItems: 1, cursor: page.continueCursor } });
    expect(history.page[0]._id).toBe(first!.reviewId);
    await s.patch({ status: "cancelled", cancelledAt: NOW });
    const before = await s.snapshot();
    await s.resolve(second!.reviewId);
    expect(await s.snapshot()).toEqual(before);
  });

  it.each(["owner", "globalManager", "assignedManager"] as const)("lets %s view and resolve without changing the job", async name => {
    const s = await setup(); const result = await s.request();
    const before = await s.snapshot();
    expect((await s.list(name)).page).toHaveLength(1);
    expect(await s.resolve(result!.reviewId, name)).toMatchObject({ resolvedAt: NOW, replayed: false });
    expect(await s.resolve(result!.reviewId, name)).toMatchObject({ replayed: true });
    expect((await s.reviews())[0]).toMatchObject({ status: "resolved", resolvedBy: s[name], workerName: "a", reason: "Unavailable" });
    expect(await s.snapshot()).toEqual(before);
    expect(await s.notices()).toHaveLength(3);
    expect(await s.t.run(ctx => ctx.db.query("auditLog").collect())).toHaveLength(2);
    expect((await s.t.query(api.workerDeclineReviews.workerState, { ...s.auth("a"), jobId: s.job })).latest?.status).toBe("resolved");
    expect(await s.request()).toMatchObject({ reviewRequested: true, replayed: false });
    expect(await s.reviews()).toHaveLength(2);
    expect((await s.list()).page[0].status).toBe("pending");
  });

  it.each(["blindManager", "viewOnly", "foreignOwner", "a"] as const)("rejects %s viewing/resolving another staff review", async name => {
    const s = await setup(); const result = await s.request(); const before = await s.reviews();
    await expect(s.list(name)).rejects.toThrow();
    await expect(s.resolve(result!.reviewId, name)).rejects.toThrow();
    expect(await s.reviews()).toEqual(before);
  });

  it("rechecks manager capability and job visibility at resolution time", async () => {
    const s = await setup(); const result = await s.request();
    await s.t.run(ctx => ctx.db.patch(s.globalManager, { canAssignCleaners: false }));
    await expect(s.resolve(result!.reviewId, "globalManager")).rejects.toThrow("access denied");
    await s.patch({ assignedManagerId: undefined });
    await expect(s.resolve(result!.reviewId, "assignedManager")).rejects.toThrow("access denied");
    await s.resolve(result!.reviewId);
  });

  it("keeps a pending request across assignment changes without falling back to whole-job denial", async () => {
    const s = await setup(); const result = await s.request();
    await s.patch({ cleanerIds: [s.a] });
    const before = await s.snapshot();
    expect(await s.request()).toMatchObject({ reviewId: result!.reviewId, replayed: true });
    expect(await s.snapshot()).toEqual(before);
    await s.patch({ cleanerIds: [s.b] });
    await expect(s.request()).rejects.toThrow("Not assigned");
    await expect(s.t.query(api.workerDeclineReviews.workerState, { ...s.auth("a"), jobId: s.job })).rejects.toThrow("Not assigned");
    await s.resolve(result!.reviewId);
    await s.patch({ cleanerIds: [s.a, s.b] });
    expect(await s.request()).toMatchObject({ replayed: false });
  });

  it.each(["outsider", "foreign", "inactive"] as const)("rejects ineligible actor %s", async name => {
    const s = await setup(); const before = await s.snapshot();
    await expect(s.t.mutation(api.mutations.jobs.denyJob, { ...s.auth(name), jobId: s.job })).rejects.toThrow();
    expect(await s.snapshot()).toEqual(before);
    expect(await s.reviews()).toEqual([]);
    expect(await s.notices()).toEqual([]);
  });

  it.each(["in_progress", "submitted", "approved", "cancelled", "denied", "rework_requested"] as const)("does not add a multi-worker cancellation path for %s", async status => {
    const s = await setup(); await s.patch({ status, startedAt: NOW - 100 });
    const before = await s.snapshot();
    await expect(s.request("cancellation")).rejects.toThrow();
    expect(await s.snapshot()).toEqual(before); expect(await s.reviews()).toEqual([]);
  });

  it("rejects initial decline after job-wide acceptance and malformed review reasons", async () => {
    const s = await setup();
    await expect(s.request("decline", "a", "x".repeat(2001))).rejects.toThrow("2000");
    await s.patch({ status: "confirmed", acceptanceStatus: "accepted" });
    await expect(s.request()).rejects.toThrow("current status");
    expect(await s.reviews()).toEqual([]);
  });

  it.each(["pending", "rejected", "accepted"] as const)("preserves %s shared-work boundaries and the partner bridge", async status => {
    const s = await setup();
    await s.t.run(async ctx => {
      const original = await ctx.db.insert("jobs", { companyId: s.foreignCompany, cleanerIds: [], type: "standard", status: "scheduled", scheduledDate: "2030-01-02", durationMinutes: 60, reworkCount: 0 });
      await ctx.db.patch(s.job, { sharedFromJobId: original, sharedFromCompanyName: "Origin" });
      await ctx.db.insert("sharedJobs", { originalJobId: original, copiedJobId: s.job, fromCompanyId: s.foreignCompany, toCompanyId: s.companyId, sharePackage: true, status });
    });
    const before = await s.snapshot();
    if (status === "accepted") expect(await s.request()).toMatchObject({ reviewRequested: true });
    else await expect(s.request()).rejects.toThrow(/shared/i);
    expect(await s.snapshot()).toEqual(before);
    expect(await s.reviews()).toHaveLength(status === "accepted" ? 1 : 0);
  });

  it("does not prevent job-wide acceptance or existing worker submission after a review request", async () => {
    const s = await setup(); await s.request();
    await s.t.mutation(api.mutations.jobs.acceptJob, { ...s.auth("b"), jobId: s.job });
    expect((await s.snapshot()).job).toMatchObject({ status: "confirmed", acceptanceStatus: "accepted" });
    await s.t.mutation(api.mutations.jobs.startJob, { ...s.auth("b"), jobId: s.job });
    await s.t.run(ctx => ctx.db.patch(s.owner, { email: "" }));
    await s.t.run(ctx => ctx.db.patch(s.inactiveOwner, { email: "" }));
    await s.t.mutation(api.mutations.forms.submit, { ...s.auth("b"), formId: s.form, performedWorkerIds: [s.a, s.b] });
    expect((await s.snapshot()).job?.status).toBe("submitted");
    expect((await s.reviews())[0].status).toBe("pending");
    await s.resolve((await s.reviews())[0]._id);
  });
});
