import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { companyAddOnSelectionVersion } from "../companyAddOnSelection";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

async function setup() {
  const t = convexTest(schema, modules); const passwordHash = await hashPassword(PASSWORD);
  const ids = await t.run(async (ctx) => {
    const company = await ctx.db.insert("companies", { name: "Clean Co", timezone: "America/New_York" });
    const otherCompany = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/Chicago" });
    const owner = await ctx.db.insert("users", { email: "owner@requests.test", passwordHash, name: "Owner", companyId: company, role: "owner", status: "active" });
    const otherOwner = await ctx.db.insert("users", { email: "other-owner@requests.test", passwordHash, name: "Other Owner", companyId: otherCompany, role: "owner", status: "active" });
    const client = await ctx.db.insert("clientUsers", { email: "client@requests.test", passwordHash, displayName: "Client", phone: "555-0100", status: "active", createdAt: 1, updatedAt: 1 });
    const otherClient = await ctx.db.insert("clientUsers", { email: "other-client@requests.test", passwordHash, displayName: "Other Client", status: "active", createdAt: 1, updatedAt: 1 });
    const relationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Client Home", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const inactiveRelationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Inactive", clientType: "residential", status: "inactive", createdAt: 1, updatedAt: 1 });
    const otherRelationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: otherClient, displayName: "Other", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const foreignRelationship = await ctx.db.insert("clientRelationships", { companyId: otherCompany, clientUserId: client, displayName: "Foreign Provider", clientType: "commercial", status: "active", createdAt: 1, updatedAt: 1 });
    const property = await ctx.db.insert("properties", { companyId: company, clientRelationshipId: relationship, name: "Home", type: "residential", address: "1 Main St", amenities: [], active: true });
    const otherProperty = await ctx.db.insert("properties", { companyId: company, clientRelationshipId: otherRelationship, name: "Other Home", type: "residential", address: "2 Main St", amenities: [], active: true });
    const foreignProperty = await ctx.db.insert("properties", { companyId: otherCompany, clientRelationshipId: foreignRelationship, name: "Office", type: "commercial", address: "3 Main St", amenities: [], active: true });
    const account = await ctx.db.insert("commercialAccounts", { companyId: otherCompany, clientRelationshipId: foreignRelationship, clientName: "Client Office", serviceAddress: "4 Main St", status: "active", createdAt: 1, updatedAt: 1 });
    const addOn = await ctx.db.insert("companyAddOns", { companyId: company, name: "Inside oven", pricingMethod: "flat", priceCents: 2500, isActive: true, isPublic: true, displayOrder: 1, createdByUserId: owner, createdAt: 1, updatedAt: 10 });
    const privateAddOn = await ctx.db.insert("companyAddOns", { companyId: company, name: "Private", pricingMethod: "flat", priceCents: 100, isActive: true, isPublic: false, displayOrder: 2, createdByUserId: owner, createdAt: 1, updatedAt: 10 });
    const archivedAddOn = await ctx.db.insert("companyAddOns", { companyId: company, name: "Archived", pricingMethod: "flat", priceCents: 100, isActive: true, isPublic: true, displayOrder: 3, createdByUserId: owner, createdAt: 1, updatedAt: 10, archivedAt: 11 });
    const historical = await ctx.db.insert("clientRequests", { companyId: company, clientRelationshipId: relationship, createdAt: 2, status: "contacted", requesterName: "Historical", requesterEmail: "old@test.dev", propertySnapshot: { name: "Home", address: "1 Main St" }, requestedService: "Standard Clean", source: "manual" });
    return { company, otherCompany, owner, otherOwner, client, otherClient, relationship, inactiveRelationship, otherRelationship, foreignRelationship, property, otherProperty, foreignProperty, account, addOn, privateAddOn, archivedAddOn, historical };
  });
  const clientAuth = await t.action(api.clientAuthActions.signIn, { email: "client@requests.test", password: PASSWORD });
  const ownerAuth = await t.action(api.authActions.signIn, { email: "owner@requests.test", password: PASSWORD });
  return { t, ...ids, clientAuth, ownerAuth, portal: (api as any).queries.clientPortal, create: (api as any).mutations.clientRequests.createAuthenticatedClientRequest };
}

function valid(s: any, overrides: Record<string, any> = {}) {
  return { clientUserId: s.client, sessionToken: s.clientAuth.sessionToken, clientRelationshipId: s.relationship, location: { type: "property", id: s.property }, requestedService: "Deep Clean", requestedDate: "2027-06-15", timeWindow: "morning", requestedAddOns: [{ companyAddOnId: s.addOn, selectionVersion: companyAddOnSelectionVersion({ updatedAt: 10 }) }], idempotencyKey: "request_key_1234567890", ...overrides };
}

describe("authenticated client service requests", () => {
  beforeEach(() => { process.env.TOKEN_PEPPER = "authenticated-request-pepper"; process.env.STRIPE_SECRET_KEY = "test"; process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test"; process.env.RESEND_API_KEY = "test"; process.env.RESEND_FROM_EMAIL = "test@example.com"; process.env.APP_URL = "http://localhost:5173"; });

  it("creates one canonical request, replays duplicates, and exposes it to the client and owner", async () => {
    const s = await setup();
    const options = await s.t.query(s.portal.getClientRequestOptions, { clientUserId: s.client, sessionToken: s.clientAuth.sessionToken });
    expect(options.providers).toHaveLength(2);
    expect(options.providers.find((item: any) => item._id === s.relationship).addOns.map((item: any) => item.name)).toEqual(["Inside oven"]);
    expect(options.providers.find((item: any) => item._id === s.foreignRelationship).locations.map((item: any) => item.id)).toContain(s.account);

    const created = await s.t.mutation(s.create, valid(s));
    const replayed = await s.t.mutation(s.create, valid(s));
    expect(replayed).toEqual({ requestId: created.requestId, replayed: true });
    const request: any = await s.t.run((ctx) => ctx.db.get(created.requestId));
    expect(request).toMatchObject({ companyId: s.company, clientRelationshipId: s.relationship, originClientUserId: s.client, source: "authenticated_client", propertyId: s.property, requesterEmail: "client@requests.test", status: "new", leadStage: "new" });
    expect(request.propertySnapshot).toEqual({ name: "Home", address: "1 Main St" });
    expect(request.requestedAddOnSnapshots[0]).toMatchObject({ name: "Inside oven", priceCents: 2500 });
    const clientList = await s.t.query(s.portal.listClientRequests, { clientUserId: s.client, sessionToken: s.clientAuth.sessionToken });
    expect(clientList.requests.find((item: any) => item._id === created.requestId).status).toBe("submitted");
    expect(clientList.requests.find((item: any) => item._id === s.historical).status).toBe("under_review");
    const detail = await s.t.query(s.portal.getClientRequestDetail, { clientUserId: s.client, sessionToken: s.clientAuth.sessionToken, requestId: created.requestId });
    expect(detail.request._id).toBe(created.requestId);
    const ownerList = await s.t.query(api.queries.clientRequests.getCompanyRequests, { companyId: s.company, userId: s.owner, sessionToken: s.ownerAuth.sessionToken });
    expect(ownerList.some((item: any) => item._id === created.requestId && item.source === "authenticated_client")).toBe(true);
    const notifications = await s.t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notifications).toContainEqual(expect.objectContaining({ userId: s.owner, relatedClientRequestId: created.requestId, type: "new_client_request" }));
  });

  it("rejects forged principals, relationships, locations, add-ons, services, and payload fields", async () => {
    const s = await setup();
    await expect(s.t.mutation(s.create, valid(s, { clientUserId: s.otherClient }))).rejects.toThrow("does not match");
    for (const clientRelationshipId of [s.inactiveRelationship, s.otherRelationship]) await expect(s.t.mutation(s.create, valid(s, { clientRelationshipId, idempotencyKey: `invalid_rel_${String(clientRelationshipId)}` }))).rejects.toThrow("relationship access");
    await expect(s.t.mutation(s.create, valid(s, { location: { type: "property", id: s.otherProperty }, idempotencyKey: "other_property_12345" }))).rejects.toThrow("location is unavailable");
    await expect(s.t.mutation(s.create, valid(s, { location: { type: "property", id: s.foreignProperty }, idempotencyKey: "foreign_property_123" }))).rejects.toThrow("location is unavailable");
    await expect(s.t.mutation(s.create, valid(s, { requestedAddOns: [{ companyAddOnId: s.privateAddOn, selectionVersion: companyAddOnSelectionVersion({ updatedAt: 10 }) }], idempotencyKey: "private_addon_123456" }))).rejects.toThrow("add-on is unavailable");
    await expect(s.t.mutation(s.create, valid(s, { requestedService: "Forged service", idempotencyKey: "forged_service_12345" }))).rejects.toThrow("supported service");
    await expect(s.t.mutation(s.create, { ...valid(s, { idempotencyKey: "snapshot_injection_123" }), propertySnapshot: { address: "Injected" } } as any)).rejects.toThrow();
    const foreignDetail = await s.t.query(s.portal.getClientRequestDetail, { clientUserId: s.client, sessionToken: s.clientAuth.sessionToken, requestId: await s.t.run((ctx) => ctx.db.insert("clientRequests", { companyId: s.company, clientRelationshipId: s.otherRelationship, createdAt: 3, status: "new", requesterName: "Other", requesterEmail: "other@test.dev", propertySnapshot: {}, source: "manual" })) });
    expect(foreignDetail.request).toBeNull();
  });

  it("derives lifecycle labels without calling converted requests scheduled before a linked job exists", async () => {
    const s = await setup(); const created = await s.t.mutation(s.create, valid(s));
    await s.t.mutation(api.mutations.clientRequests.updateRequestStatus, { requestId: created.requestId, userId: s.owner, sessionToken: s.ownerAuth.sessionToken, status: "contacted" });
    let list = await s.t.query(s.portal.listClientRequests, { clientUserId: s.client, sessionToken: s.clientAuth.sessionToken });
    expect(list.requests.find((item: any) => item._id === created.requestId).status).toBe("under_review");
    await s.t.mutation(api.mutations.clientRequests.updateRequestStatus, { requestId: created.requestId, userId: s.owner, sessionToken: s.ownerAuth.sessionToken, status: "declined" });
    list = await s.t.query(s.portal.listClientRequests, { clientUserId: s.client, sessionToken: s.clientAuth.sessionToken });
    expect(list.requests.find((item: any) => item._id === created.requestId).status).toBe("declined");
    await s.t.run((ctx) => ctx.db.patch(created.requestId, { status: "converted" }));
    list = await s.t.query(s.portal.listClientRequests, { clientUserId: s.client, sessionToken: s.clientAuth.sessionToken });
    expect(list.requests.find((item: any) => item._id === created.requestId).status).toBe("processing");
    await s.t.run(async (ctx) => {
      const proposal = await ctx.db.insert("proposals", { companyId: s.company, clientRelationshipId: s.relationship, clientRequestId: created.requestId, createdByUserId: s.owner, title: "Proposal", clientName: "Client", status: "accepted", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("jobs", { companyId: s.company, clientRelationshipId: s.relationship, propertyId: s.property, cleanerIds: [], type: "deep_clean", status: "scheduled", scheduledDate: "2027-06-15", startTime: "09:00", durationMinutes: 120, sourceProposalId: proposal, reworkCount: 0 });
    });
    list = await s.t.query(s.portal.listClientRequests, { clientUserId: s.client, sessionToken: s.clientAuth.sessionToken });
    expect(list.requests.find((item: any) => item._id === created.requestId).status).toBe("scheduled");
    await s.t.run((ctx) => ctx.db.patch(created.requestId, { status: "declined" }));
    const withJob = await s.t.query(s.portal.listClientRequests, { clientUserId: s.client, sessionToken: s.clientAuth.sessionToken });
    expect(withJob.requests.find((item: any) => item._id === created.requestId).status).toBe("scheduled");
  });
});
