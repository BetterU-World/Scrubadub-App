import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");

beforeEach(() => {
  process.env.TOKEN_PEPPER = "test-token-pepper";
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.APP_URL = "http://localhost:5173";
});

async function seed(t: ReturnType<typeof convexTest>, suffix: string) {
  const passwordHash = await hashPassword("test-password-123");
  const records = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: `Company ${suffix}`,
      timezone: "America/New_York",
    });
    const ownerId = await ctx.db.insert("users", {
      email: `owner-${suffix}@example.com`, passwordHash, name: `Owner ${suffix}`,
      companyId, role: "owner", status: "active",
    });
    const propertyId = await ctx.db.insert("properties", {
      companyId, name: `Property ${suffix}`, type: "residential",
      address: `${suffix} Main St`, amenities: [], active: true,
    });
    const requestId = await ctx.db.insert("clientRequests", {
      companyId, propertyId, createdAt: Date.now(), status: "new",
      requesterName: `Lead ${suffix}`, requesterEmail: `lead-${suffix}@example.com`,
      propertySnapshot: { name: `Property ${suffix}`, address: `${suffix} Main St` },
      source: "manual", leadType: "residential", leadStage: "new",
    });
    return { companyId, ownerId, propertyId, requestId };
  });
  const auth = await t.action(api.authActions.signIn, {
    email: `owner-${suffix}@example.com`, password: "test-password-123",
  });
  return { ...records, sessionToken: auth.sessionToken };
}

describe("walkthrough reliability", () => {
  it("starts an unscheduled visit, retains findings on retry, and hands off after completion", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t, "start");
    const auth = { userId: s.ownerId, sessionToken: s.sessionToken };
    const args = { ...auth, clientRequestId: s.requestId };
    const [id, retryId] = await Promise.all([
      t.mutation(api.mutations.walkthroughs.startFromClientRequest, args),
      t.mutation(api.mutations.walkthroughs.startFromClientRequest, args),
    ]);
    expect(retryId).toBe(id);
    const started = (await t.run(ctx => ctx.db.get(id)))!;
    expect(started).toMatchObject({ status: "draft", appointmentStatus: "draft", clientRequestId: s.requestId,
      propertyId: s.propertyId, contactEmail: "lead-start@example.com", startedAt: expect.any(Number) });
    expect(started.clientRelationshipId).toBeTruthy();
    expect(started.scheduledDate).toBeUndefined();
    expect(started.scheduledStartTime).toBeUndefined();
    expect(started.scheduledAt).toBeUndefined();
    expect((await t.run(ctx => ctx.db.get(s.requestId)))?.leadStage).toBe("new");
    await t.mutation(api.mutations.walkthroughs.update, {
      ...args, walkthroughId: id, propertyId: s.propertyId, walkthroughType: "residential",
      title: started.title, appointmentStatus: "draft", scopeNotes: "Clean the kitchen",
      proposalReadyScopeText: "Clean the kitchen",
    });
    expect(await t.mutation(api.mutations.walkthroughs.startFromClientRequest, args)).toBe(id);
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ startedAt: started.startedAt, scopeNotes: "Clean the kitchen" });
    await t.mutation(api.mutations.walkthroughs.complete, { ...auth, walkthroughId: id });
    const completed = await t.run(ctx => ctx.db.get(id));
    expect(completed).toMatchObject({ status: "completed", completedAt: expect.any(Number), startedAt: started.startedAt });
    expect(await t.query(api.queries.walkthroughs.listCalendarWalkthroughs, {
      ...auth, companyId: s.companyId, startDate: "2000-01-01", endDate: "2100-01-01",
    })).toEqual([]);
    const proposalId = await t.mutation(api.mutations.proposals.createProposalFromLead, { ...args, sourceWalkthroughId: id });
    const estimateId = await t.mutation(internal.mutations.smartEstimates.openDraft, {
      ...args, walkthroughId: id, input: { strategy: "flat", cadence: "one_time", baseCents: 20000 },
    });
    expect(await t.run(ctx => ctx.db.get(estimateId))).toMatchObject({ walkthroughId: id, propertyId: s.propertyId });
    expect(await t.run(ctx => ctx.db.get(proposalId))).toMatchObject({ sourceWalkthroughId: id, scopeOfWork: "Clean the kitchen" });
    await t.mutation(api.mutations.walkthroughs.complete, { ...auth, walkthroughId: id });
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ status: "proposal_created", completedAt: completed?.completedAt });
    const historical = await t.run(ctx => ctx.db.get(id));
    await expect(t.mutation(api.mutations.walkthroughs.startFromClientRequest, args)).rejects.toThrow("completed or cancelled");
    expect(await t.run(ctx => ctx.db.get(id))).toEqual(historical);
    expect(await t.run(ctx => ctx.db.get(proposalId))).toMatchObject({ sourceWalkthroughId: id });
  });

  it("puts a started visit on the calendar only after scheduling and reflects edits and cancellation", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t, "start-calendar");
    const auth = { userId: s.ownerId, sessionToken: s.sessionToken };
    const walkthroughId = await t.mutation(api.mutations.walkthroughs.startFromClientRequest, { ...auth, clientRequestId: s.requestId });
    const edit = { ...auth, walkthroughId, clientRequestId: s.requestId, propertyId: s.propertyId,
      title: "Site visit", walkthroughType: "residential" as const };
    const calendar = () => t.query(api.queries.walkthroughs.listCalendarWalkthroughs, {
      ...auth, companyId: s.companyId, startDate: "2030-01-01", endDate: "2030-01-31",
    });
    const planned = { scheduledDate: "2030-01-10", scheduledStartTime: "09:00", scheduledEndTime: "10:00" };
    await t.mutation(api.mutations.walkthroughs.update, { ...edit, ...planned, appointmentStatus: "draft" });
    expect(await calendar()).toEqual([]);
    await t.mutation(api.mutations.walkthroughs.update, { ...edit, ...planned, appointmentStatus: "scheduled" });
    expect(await calendar()).toEqual([expect.objectContaining({ _id: walkthroughId, ...planned })]);
    const rescheduled = { ...planned, scheduledEndTime: "11:00" };
    await t.mutation(api.mutations.walkthroughs.update, { ...edit, ...rescheduled, appointmentStatus: "scheduled" });
    expect(await calendar()).toEqual([expect.objectContaining({ _id: walkthroughId, ...rescheduled })]);
    const saved = await t.run(ctx => ctx.db.get(walkthroughId));
    expect(saved?.rescheduledAt).toEqual(expect.any(Number));
    await t.mutation(api.mutations.walkthroughs.update, { ...edit, ...rescheduled, appointmentStatus: "cancelled" });
    expect(await calendar()).toEqual([]);
    await expect(t.mutation(api.mutations.walkthroughs.complete, { ...auth, walkthroughId })).rejects.toThrow("cannot be completed");
    await expect(t.mutation(api.mutations.walkthroughs.startFromClientRequest, { ...auth, clientRequestId: s.requestId })).rejects.toThrow("completed or cancelled");
    await t.mutation(api.mutations.walkthroughs.update, { ...edit, ...planned, appointmentStatus: "scheduled" });
    await t.mutation(api.mutations.walkthroughs.complete, { ...auth, walkthroughId });
    expect(await calendar()).toEqual([expect.objectContaining({ _id: walkthroughId, ...planned, appointmentStatus: "completed" })]);
  });

  it("allows delegated sales staff and denies invalid sessions, unauthorized staff, and foreign requests", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t, "delegated");
    const other = await seed(t, "other");
    const passwordHash = await hashPassword("test-password-123");
    const [salesId, viewerId] = await t.run(ctx => Promise.all([true, false].map(sales =>
      ctx.db.insert("users", { companyId: s.companyId, role: "manager", status: "active",
        name: "Manager", email: `manager-${sales}@example.com`, passwordHash, canManageSalesAndCommercial: sales })
    )));
    const login = async (sales: boolean) => (await t.action(api.authActions.signIn, {
      email: `manager-${sales}@example.com`, password: "test-password-123",
    })).sessionToken;
    const sales = { userId: salesId, sessionToken: await login(true) };
    const viewer = { userId: viewerId, sessionToken: await login(false) };
    const start = api.mutations.walkthroughs.startFromClientRequest;
    await expect(t.mutation(start, { ...viewer, clientRequestId: s.requestId })).rejects.toThrow();
    await expect(t.mutation(start, { ...sales, sessionToken: "invalid", clientRequestId: s.requestId })).rejects.toThrow();
    await expect(t.mutation(start, { ...sales, clientRequestId: other.requestId })).rejects.toThrow("Access denied");
    expect(await t.mutation(start, { ...sales, clientRequestId: s.requestId })).toBeTruthy();
  });

  it("resumes the newest draft after archives and legacy duplicates without rewriting them", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t, "duplicates");
    const auth = { userId: s.ownerId, sessionToken: s.sessionToken };
    const args = { ...auth, clientRequestId: s.requestId };
    const archived = await t.mutation(api.mutations.walkthroughs.startFromClientRequest, args);
    await t.mutation(api.mutations.walkthroughs.archive, { ...auth, walkthroughId: archived });
    const archivedSnapshot = await t.run(ctx => ctx.db.get(archived));
    await t.mutation(api.mutations.walkthroughs.archive, { ...auth, walkthroughId: archived });
    await expect(t.mutation(api.mutations.walkthroughs.complete, { ...auth, walkthroughId: archived })).rejects.toThrow("cannot be completed");
    expect(await t.run(ctx => ctx.db.get(archived))).toEqual(archivedSnapshot);
    const replacement = await t.mutation(api.mutations.walkthroughs.startFromClientRequest, args);
    expect(replacement).not.toBe(archived);
    const schedule = { ...args, scheduledDate: "2030-01-10", scheduledStartTime: "09:00" };
    expect(await t.mutation(api.mutations.walkthroughs.createFromClientRequest, schedule)).toBe(replacement);
    const duplicate = await t.run(ctx => ctx.db.insert("walkthroughs", {
      companyId: s.companyId, clientRequestId: s.requestId, title: "Legacy duplicate", walkthroughType: "residential",
      status: "draft", scopeNotes: "Keep these findings", createdAt: Date.now(), updatedAt: Date.now(),
    }));
    expect(await t.mutation(api.mutations.walkthroughs.startFromClientRequest, args)).toBe(duplicate);
    expect(await t.mutation(api.mutations.walkthroughs.createFromClientRequest, schedule)).toBe(duplicate);
    const records = await t.query(api.queries.walkthroughs.listByClientRequest, args);
    expect(records.map(row => row._id)).toHaveLength(3);
    expect(records.find(row => row._id === duplicate)?.scopeNotes).toBe("Keep these findings");
  });

  it("allows an active same-company Owner to assign themself", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t, "self");
    const walkthroughId = await t.mutation(api.mutations.walkthroughs.createFromClientRequest, {
      userId: s.ownerId, sessionToken: s.sessionToken, clientRequestId: s.requestId,
      scheduledDate: "2030-01-10", scheduledStartTime: "09:00",
      assignedManagerId: s.ownerId,
    });
    const walkthrough = await t.run((ctx) => ctx.db.get(walkthroughId));
    expect(walkthrough?.assignedManagerId).toBe(s.ownerId);
  });

  it("updates linked property facts and walkthrough findings atomically", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t, "atomic");
    const walkthroughId = await t.mutation(api.mutations.walkthroughs.createFromClientRequest, {
      userId: s.ownerId, sessionToken: s.sessionToken, clientRequestId: s.requestId,
      scheduledDate: "2030-01-10", scheduledStartTime: "09:00",
    });
    await t.mutation(api.mutations.walkthroughs.update, {
      userId: s.ownerId, sessionToken: s.sessionToken, walkthroughId,
      clientRequestId: s.requestId, propertyId: s.propertyId,
      title: "Updated walkthrough", walkthroughType: "residential",
      scheduledDate: "2030-01-11", scheduledStartTime: "10:00",
      appointmentStatus: "scheduled", assignedManagerId: s.ownerId,
      linkedPropertyFacts: { address: "200 Updated St", squareFootage: 1200, amenities: ["Pool"] },
    });
    const result = await t.run(async (ctx) => ({
      walkthrough: await ctx.db.get(walkthroughId), property: await ctx.db.get(s.propertyId),
    }));
    expect(result.walkthrough?.scheduledDate).toBe("2030-01-11");
    expect(result.walkthrough?.title).toBe("Updated walkthrough");
    expect(result.property?.address).toBe("200 Updated St");
  });

  it("projects only active scheduled walkthroughs in the calendar range", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t, "calendar");
    const activeId = await t.mutation(api.mutations.walkthroughs.createFromClientRequest, {
      userId: s.ownerId, sessionToken: s.sessionToken, clientRequestId: s.requestId,
      scheduledDate: "2030-01-10", scheduledStartTime: "09:00",
    });
    const events = await t.query(api.queries.walkthroughs.listCalendarWalkthroughs, {
      userId: s.ownerId, sessionToken: s.sessionToken, companyId: s.companyId,
      startDate: "2030-01-01", endDate: "2030-01-31",
    });
    expect(events.map((event) => event._id)).toEqual([activeId]);
    expect(events[0].clientRequestId).toBe(s.requestId);

    await t.mutation(api.mutations.walkthroughs.archive, {
      userId: s.ownerId, sessionToken: s.sessionToken, walkthroughId: activeId,
    });
    const afterArchive = await t.query(api.queries.walkthroughs.listCalendarWalkthroughs, {
      userId: s.ownerId, sessionToken: s.sessionToken, companyId: s.companyId,
      startDate: "2030-01-01", endDate: "2030-01-31",
    });
    expect(afterArchive).toEqual([]);
  });

  it("keeps proposal creation explicit, idempotent, and accessible after walkthrough changes", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t, "handoff");
    const walkthroughId = await t.mutation(api.mutations.walkthroughs.createFromClientRequest, {
      userId: s.ownerId, sessionToken: s.sessionToken, clientRequestId: s.requestId,
      scheduledDate: "2030-01-10", scheduledStartTime: "09:00",
    });
    await t.mutation(api.mutations.walkthroughs.complete, {
      userId: s.ownerId, sessionToken: s.sessionToken, walkthroughId,
    });
    const proposalArgs = { userId: s.ownerId, sessionToken: s.sessionToken, clientRequestId: s.requestId };
    expect(await t.query(api.queries.proposals.getProposalByClientRequest, proposalArgs)).toBeNull();

    const proposalId = await t.mutation(api.mutations.proposals.createProposalFromLead, proposalArgs);
    expect(await t.mutation(api.mutations.proposals.createProposalFromLead, proposalArgs)).toBe(proposalId);
    await t.mutation(api.mutations.walkthroughs.archive, {
      userId: s.ownerId, sessionToken: s.sessionToken, walkthroughId,
    });
    const anotherWalkthroughId = await t.mutation(api.mutations.walkthroughs.createFromClientRequest, {
      userId: s.ownerId, sessionToken: s.sessionToken, clientRequestId: s.requestId,
      scheduledDate: "2030-02-10", scheduledStartTime: "09:00",
    });
    expect((await t.run((ctx) => ctx.db.get(anotherWalkthroughId)))?.status).toBe("draft");
    expect((await t.query(api.queries.proposals.getProposalByClientRequest, proposalArgs))?._id).toBe(proposalId);
  });
});
