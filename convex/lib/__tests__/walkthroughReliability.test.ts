import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
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
});
