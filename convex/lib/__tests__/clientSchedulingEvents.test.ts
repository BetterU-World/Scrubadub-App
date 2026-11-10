import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashToken } from "../tokens";
import type { Doc } from "../../_generated/dataModel";
import { update } from "../../mutations/jobs";
const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.parse("2030-01-01T12:00:00Z");
beforeEach(() => { vi.useFakeTimers({ now: NOW }); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup(commercial = false) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const company = await ctx.db.insert("companies", { name: "Company", timezone: "America/New_York" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Foreign", timezone: "UTC" });
    const staff = async (name: string, role: "owner" | "manager", companyId = company, flags = {}) => {
      const id = await ctx.db.insert("users", { companyId, name, role, status: "active", email: name + "@test.dev", passwordHash: "unused", ...flags });
      await ctx.db.insert("authSessions", { principalType: "staff", userId: id, tokenHash: hashToken(name), version: 1, createdAt: NOW, lastUsedAt: NOW, expiresAt: NOW + 3600000, idleExpiresAt: NOW + 3600000 }); return id;
    };
    const owner = await staff("owner", "owner"), manager = await staff("manager", "manager", company, { canManageSchedule: true, canCreateJobs: true });
    const blocked = await staff("blocked", "manager"), foreignOwner = await staff("foreignOwner", "owner", foreignCompany);
    const client = async (name: string) => {
      const id = await ctx.db.insert("clientUsers", { displayName: name, email: name + "@test.dev", passwordHash: "unused", status: "active", createdAt: NOW, updatedAt: NOW });
      const session = await ctx.db.insert("authSessions", { principalType: "client", clientUserId: id, tokenHash: hashToken(name), version: 1, createdAt: NOW, lastUsedAt: NOW, expiresAt: NOW + 3600000, idleExpiresAt: NOW + 3600000 }); return { id, session };
    };
    const customer = await client("customer"), other = await client("other");
    const relationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: customer.id, displayName: "Client", clientType: commercial ? "commercial" : "residential", status: "active", createdAt: NOW, updatedAt: NOW });
    const otherRelationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: other.id, displayName: "Other", clientType: "residential", status: "active", createdAt: NOW, updatedAt: NOW });
    const property = await ctx.db.insert("properties", { companyId: company, clientRelationshipId: relationship, name: "Current home", address: "Current address", active: true, type: "residential", amenities: [], accessInstructions: "PRIVATE ACCESS" });
    const account = await ctx.db.insert("commercialAccounts", { companyId: company, clientRelationshipId: relationship, clientName: "Current office", serviceAddress: "Office address", status: "active", createdAt: NOW, updatedAt: NOW });
    return { company, foreignCompany, owner, manager, blocked, foreignOwner, customer, other, relationship, otherRelationship, property, account };
  });
  const staff = (name: "owner" | "manager" | "blocked" | "foreignOwner" = "owner") => ({ userId: ids[name], sessionToken: name });
  const auth = (name: "customer" | "other" = "customer") => ({ clientUserId: ids[name].id, sessionToken: name });
  const createArgs = { ...auth(), clientRelationshipId: ids.relationship, location: commercial ? { type: "commercial_account" as const, id: ids.account } : { type: "property" as const, id: ids.property }, requestedService: "Standard Clean", requestedDate: "2030-01-03", timeWindow: "morning" as const, requestedAddOns: [], idempotencyKey: "client-request-key-0001" };
  const request = await t.mutation(api.mutations.clientRequests.createAuthenticatedClientRequest, createArgs);
  const requestId = request.requestId;
  const confirm = (extra = {}) => t.mutation(api.mutations.jobs.confirmClientRequestSchedule, { ...staff(), requestId, scheduledDate: "2030-01-03", startTime: "09:00", durationMinutes: 90, type: "standard", idempotencyKey: "confirmation-key-0001", ...extra });
  const detail = (who: "customer" | "other" = "customer") => t.query(api.queries.clientPortal.getClientRequestDetail, { ...auth(who), requestId });
  const services = (who: "customer" | "other" = "customer") => t.query(api.queries.clientPortal.getClientServices, auth(who));
  const events = () => t.run(ctx => ctx.db.query("clientSchedulingEvents").collect());
  return { t, ...ids, staff, auth, requestId, confirm, detail, services, events, createArgs };
}

describe("client scheduling communications", () => {
  it("distinguishes receipt from company confirmation and deduplicates concurrent/replayed confirmation", async () => {
    const s = await setup(); expect((await s.detail()).request.status).toBe("submitted"); expect(await s.events()).toHaveLength(0);
    await s.t.mutation(api.mutations.clientRequests.createAuthenticatedClientRequest, s.createArgs);
    const result = await Promise.all([s.confirm(), s.confirm(), s.confirm()]); expect(new Set(result.map(r => r.jobId)).size).toBe(1);
    expect(await s.events()).toHaveLength(1); expect((await s.detail()).request.schedulingEvents[0]).toMatchObject({ kind: "service_confirmed", timezone: "America/New_York", after: { scheduledDate: "2030-01-03", startTime: "09:00", durationMinutes: 90 } });
    await s.confirm(); expect(await s.events()).toHaveLength(1);
    const json = JSON.stringify((await s.services()).schedulingUpdates); expect(json).not.toContain("PRIVATE ACCESS"); expect(json).not.toContain("clientUserId"); expect(json).not.toContain("pay");
  });
  it.each(["owner", "manager"] as const)("supports %s confirmation, rescheduling and cancellation with separate identities", async actor => {
    const s = await setup(); const { jobId } = await s.confirm(s.staff(actor));
    await s.t.mutation(api.mutations.jobs.update, { ...s.staff(actor), jobId, startTime: "23:00", durationMinutes: 120, expectedScheduleRevision: 0 });
    const updates = (await s.services()).schedulingUpdates; expect(updates.map((e: any) => e.kind).sort()).toEqual(["service_confirmed", "service_rescheduled"]);
    expect(updates.find((e: any) => e.kind === "service_rescheduled")).toMatchObject({ revision: 1, before: { startTime: "09:00" }, after: { startTime: "23:00", durationMinutes: 120 } });
    await s.t.mutation(api.mutations.jobs.cancel, { ...s.staff(actor), jobId, reason: "other", notes: "PRIVATE STAFF NOTE" });
    expect((await s.detail()).request.status).toBe("cancelled"); expect((await s.services()).upcoming).toHaveLength(0);
    expect((await s.services()).schedulingUpdates.filter((e: any) => e.kind === "service_cancelled")).toHaveLength(1);
    expect(JSON.stringify((await s.services()).schedulingUpdates)).not.toContain("PRIVATE STAFF NOTE");
    await expect(s.t.mutation(api.mutations.jobs.cancel, { ...s.staff(actor), jobId, reason: "other", notes: "repeat" })).rejects.toThrow(); expect(await s.events()).toHaveLength(3);
  });
  it.each(["blocked", "foreignOwner"] as const)("rejects %s without phantom events", async actor => {
    const s = await setup(); await expect(s.confirm(s.staff(actor))).rejects.toThrow(); expect(await s.events()).toHaveLength(0);
    const { jobId } = await s.confirm();
    await expect(s.t.mutation(api.mutations.jobs.update, { ...s.staff(actor), jobId, startTime: "10:00" })).rejects.toThrow();
    await expect(s.t.mutation(api.mutations.jobs.cancel, { ...s.staff(actor), jobId, reason: "other", notes: "bad" })).rejects.toThrow(); expect(await s.events()).toHaveLength(1);
  });
  it("suppresses superseded revisions, ignores no-ops/cosmetics and rejects stale updates", async () => {
    const s = await setup(); const { jobId } = await s.confirm();
    const edit = { ...s.staff(), jobId, startTime: "10:00", expectedScheduleRevision: 0 };
    await Promise.all([s.t.mutation(api.mutations.jobs.update, edit), s.t.mutation(api.mutations.jobs.update, edit)]);
    await s.t.mutation(api.mutations.jobs.update, { ...edit, notes: "PRIVATE NOTES" }); expect(await s.events()).toHaveLength(2);
    await s.t.mutation(api.mutations.jobs.update, { ...edit, startTime: "11:00", expectedScheduleRevision: 1 });
    await expect(s.t.mutation(api.mutations.jobs.update, { ...edit, startTime: "12:00" })).rejects.toThrow("Refresh");
    const events = (await s.detail()).request.schedulingEvents; expect(events).toHaveLength(2); expect(events.find((e: any) => e.kind === "service_rescheduled").revision).toBe(2); expect(await s.events()).toHaveLength(3);
  });
  it.each(["relationship-inactive", "client-relinked", "property-removed", "property-inactive", "property-relinked", "job-foreign", "job-deleted", "job-relationship"] as const)("revalidates %s before returning history or service windows", async change => {
    const s = await setup(); const { jobId } = await s.confirm();
    await s.t.run(async ctx => {
      if (change === "relationship-inactive") await ctx.db.patch(s.relationship, { status: "inactive" });
      if (change === "client-relinked") await ctx.db.patch(s.relationship, { clientUserId: s.other.id });
      if (change === "property-removed") await ctx.db.delete(s.property);
      if (change === "property-inactive") await ctx.db.patch(s.property, { active: false });
      if (change === "property-relinked") await ctx.db.patch(s.property, { clientRelationshipId: s.otherRelationship });
      if (change === "job-foreign") await ctx.db.patch(jobId, { companyId: s.foreignCompany });
      if (change === "job-deleted") await ctx.db.delete(jobId);
      if (change === "job-relationship") await ctx.db.patch(jobId, { clientRelationshipId: s.otherRelationship });
    });
    expect((await s.services()).schedulingUpdates).toHaveLength(0); expect((await s.detail()).request?.schedulingEvents ?? []).toHaveLength(0);
    expect((await s.services("other")).schedulingUpdates).toHaveLength(0);
  });
  it.each(["session", "inactive"] as const)("rejects revoked %s client access", async kind => {
    const s = await setup(); await s.confirm(); await s.t.run(ctx => kind === "session" ? ctx.db.patch(s.customer.session, { revokedAt: NOW }) : ctx.db.patch(s.customer.id, { status: "disabled" }));
    await expect(s.services()).rejects.toThrow(); await expect(s.detail()).rejects.toThrow();
  });
  it("isolates other clients and rejects client-ID impersonation", async () => {
    const s = await setup(); await s.confirm(); expect((await s.services("other")).schedulingUpdates).toHaveLength(0); expect((await s.detail("other")).request).toBeNull();
    await expect(s.t.query(api.queries.clientPortal.getClientServices, { clientUserId: s.customer.id, sessionToken: "other" })).rejects.toThrow();
  });
  it("retains actual proposal acceptance/decline semantics, without turning a proposal into a booking", async () => {
    const s = await setup(); const propose = () => s.t.mutation(api.mutations.clientRequestScheduleProposals.createOrReplace, { ...s.staff(), requestId: s.requestId, proposedDate: "2030-01-03", proposedStartTime: "10:00", durationMinutes: 60, jobType: "standard" });
    const first = await propose(); expect(await s.events()).toHaveLength(0); expect((await s.detail()).request.status).toBe("new_time_proposed");
    await s.t.mutation(api.mutations.clientRequestScheduleProposals.decline, { ...s.auth(), proposalId: first.proposalId }); expect(await s.events()).toHaveLength(0);
    const second = await propose(); await s.t.mutation(api.mutations.clientRequestScheduleProposals.accept, { ...s.auth(), proposalId: second.proposalId });
    await s.t.mutation(api.mutations.clientRequestScheduleProposals.accept, { ...s.auth(), proposalId: second.proposalId }); expect(await s.events()).toHaveLength(1); expect((await s.detail()).request.schedulingEvents[0].kind).toBe("service_confirmed");
  });
  it("supports commercial request commitments but emits nothing for standalone recurring/internal jobs", async () => {
    const s = await setup(true); const { jobId } = await s.confirm(); expect((await s.services()).schedulingUpdates[0].locationName).toBe("Current office");
    const recurring = await s.t.run(async ctx => { const job = (await ctx.db.get(jobId))!; const { _id, _creationTime, ...fields } = job; return ctx.db.insert("jobs", { ...fields, sourceClientRequestId: undefined, generatedFromCommercialSchedule: true }); });
    await s.t.mutation(api.mutations.jobs.update, { ...s.staff(), jobId: recurring, startTime: "10:00" }); expect(await s.events()).toHaveLength(1);
  });
  it.each(["paused", "ended"] as const)("retains authorized commercial service history when the account is %s", async status => {
    const s = await setup(true); const { jobId } = await s.confirm();
    await s.t.mutation(api.mutations.jobs.cancel, { ...s.staff(), jobId, reason: "other", notes: "Service cancelled" });
    const transition = status === "paused" ? api.mutations.commercialAccounts.pauseCommercialAccount : api.mutations.commercialAccounts.endCommercialAccount;
    await s.t.mutation(transition, { ...s.staff(), commercialAccountId: s.account, reason: "other", notes: "Operational lifecycle change" });
    expect((await s.services()).schedulingUpdates.map((event: any) => event.kind).sort()).toEqual(["service_cancelled", "service_confirmed"]);
    expect((await s.detail()).request.status).toBe("cancelled");
    expect((await s.t.query(api.queries.clientPortal.getClientLocations, s.auth())).commercialAccounts[0].status).toBe(status);
    await s.t.run(ctx => ctx.db.patch(s.relationship, { status: "inactive" }));
    expect((await s.services()).schedulingUpdates).toHaveLength(0);
    expect((await s.detail()).request).toBeNull();
  });
  it("does not turn staffing refusal into a client service cancellation", async () => {
    const s = await setup(); const { jobId } = await s.confirm(); await s.t.run(ctx => ctx.db.patch(jobId, { status: "denied", acceptanceStatus: "denied" }));
    expect((await s.services()).schedulingUpdates.map((e: any) => e.kind)).toEqual(["service_confirmed"]); expect((await s.services()).upcoming[0].status).toBe("confirmed");
    await s.t.mutation(api.mutations.jobs.update, { ...s.staff(), jobId, startTime: "10:00" });
    expect((await s.services()).schedulingUpdates.find((e: any) => e.kind === "service_rescheduled").after.startTime).toBe("10:00");
    expect((await s.services()).schedulingUpdates.some((e: any) => e.kind === "service_cancelled")).toBe(false);
  });
  it("keeps partner copies and their independent schedules outside client commitments", async () => {
    const s = await setup(); const { jobId } = await s.confirm();
    const copyId = await s.t.run(async ctx => {
      const id = await ctx.db.insert("jobs", { companyId: s.foreignCompany, type: "standard", status: "scheduled",
        scheduledDate: "2030-01-03", startTime: "09:00", durationMinutes: 90, cleanerIds: [], reworkCount: 0,
        sharedFromJobId: jobId, sharedFromCompanyName: "Company" });
      await ctx.db.insert("sharedJobs", { originalJobId: jobId, copiedJobId: id, fromCompanyId: s.company,
        toCompanyId: s.foreignCompany, status: "accepted", sharePackage: false });
      return id;
    });
    await s.t.mutation(api.mutations.jobs.update, { ...s.staff("foreignOwner"), jobId: copyId, startTime: "12:00" });
    expect(await s.events()).toHaveLength(1);
    await s.t.mutation(api.mutations.jobs.update, { ...s.staff(), jobId, startTime: "10:00" });
    expect((await s.services()).schedulingUpdates.find((e: any) => e.kind === "service_rescheduled").after.startTime).toBe("10:00");
    expect((await s.t.run(ctx => ctx.db.get(copyId)))?.startTime).toBe("12:00");
  });
  it("does not transfer request history to a replacement relationship contact", async () => {
    const s = await setup(); await s.confirm();
    await s.t.run(ctx => ctx.db.patch(s.relationship, { clientUserId: s.other.id }));
    expect((await s.detail("other")).request).toBeNull();
    expect((await s.services("other")).upcoming).toHaveLength(0);
    expect((await s.t.query(api.queries.clientPortal.listClientRequests, s.auth("other"))).requests).toHaveLength(0);
  });
  it("records date-only changes and hides reschedule snapshots after unversioned schedule drift", async () => {
    const s = await setup(); const { jobId } = await s.confirm();
    await s.t.mutation(api.mutations.jobs.update, { ...s.staff(), jobId, startTime: "", durationMinutes: 120 });
    expect((await s.services()).schedulingUpdates.find((e: any) => e.kind === "service_rescheduled").after.startTime).toBeUndefined();
    await s.t.run(ctx => ctx.db.patch(jobId, { scheduledDate: "2030-01-05" }));
    expect((await s.services()).schedulingUpdates.filter((e: any) => e.kind === "service_rescheduled")).toHaveLength(0);
  });
  it("rolls back schedule revision and events together if event persistence fails", async () => {
    const s = await setup(); const { jobId } = await s.confirm(); const target = update as unknown as { _handler: (ctx: any, args: any) => Promise<unknown> }; const original = target._handler;
    vi.spyOn(target, "_handler").mockImplementationOnce((ctx, args) => original({ ...ctx, db: new Proxy(ctx.db, { get(db, key) { if (key === "insert") return (table: string, value: unknown) => { if (table === "clientSchedulingEvents") throw new Error("unavailable"); return db.insert(table, value); }; const value = Reflect.get(db, key); return typeof value === "function" ? value.bind(db) : value; } }) }, args));
    await expect(s.t.mutation(api.mutations.jobs.update, { ...s.staff(), jobId, startTime: "10:00" })).rejects.toThrow();
    expect(await s.t.run(ctx => ctx.db.get(jobId))).toMatchObject({ startTime: "09:00" }); expect(await s.events()).toHaveLength(1);
  });
});
