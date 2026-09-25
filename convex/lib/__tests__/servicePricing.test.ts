import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { checkedPriceSnapshot, normalizedJobPrice, resolveJobInvoiceablePricing } from "../jobPricing";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "pricing-test-password";
beforeEach(() => { process.env.TOKEN_PEPPER = "pricing-test-pepper"; process.env.STRIPE_SECRET_KEY = "test"; process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test"; process.env.APP_URL = "http://localhost:5173"; });

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const ids = await t.run(async (ctx) => {
    const company = await ctx.db.insert("companies", { name: "Price Co", timezone: "America/New_York" });
    const otherCompany = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { companyId: company, role: "owner", status: "active", email: "price-owner@test.dev", passwordHash, name: "Owner" });
    const manager = await ctx.db.insert("users", { companyId: company, role: "manager", status: "active", email: "price-manager@test.dev", passwordHash, name: "Manager", canManageSchedule: true, canCreateJobs: true, canManageSalesAndCommercial: true });
    const scheduleOnly = await ctx.db.insert("users", { companyId: company, role: "manager", status: "active", email: "price-schedule@test.dev", passwordHash, name: "Scheduler", canManageSchedule: true, canCreateJobs: true });
    const worker = await ctx.db.insert("users", { companyId: company, role: "cleaner", status: "active", email: "price-worker@test.dev", passwordHash, name: "Worker" });
    const client = await ctx.db.insert("clientUsers", { email: "price-client@test.dev", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const otherClient = await ctx.db.insert("clientUsers", { email: "price-other-client@test.dev", passwordHash, displayName: "Other", status: "active", createdAt: 1, updatedAt: 1 });
    const relationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Home", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const otherRelationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: otherClient, displayName: "Other", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const property = await ctx.db.insert("properties", { companyId: company, clientRelationshipId: relationship, name: "Home", type: "residential", address: "1 Main St", amenities: [], active: true });
    const request = await ctx.db.insert("clientRequests", { companyId: company, clientRelationshipId: relationship, originClientUserId: client, propertyId: property, source: "authenticated_client", status: "new", requesterName: "Client", requesterEmail: "price-client@test.dev", requestedService: "Standard Clean", requestedDate: "2030-01-15", propertySnapshot: { address: "1 Main St" }, requestedAddOnSnapshots: [], createdAt: 1 });
    const otherRequest = await ctx.db.insert("clientRequests", { companyId: company, clientRelationshipId: otherRelationship, originClientUserId: otherClient, source: "authenticated_client", status: "new", requesterName: "Other", requesterEmail: "price-other-client@test.dev", propertySnapshot: {}, createdAt: 1 });
    const foreignRequest = await ctx.db.insert("clientRequests", { companyId: otherCompany, source: "manual", status: "new", requesterName: "Foreign", requesterEmail: "foreign@test.dev", propertySnapshot: {}, createdAt: 1 });
    return { company, otherCompany, owner, manager, scheduleOnly, worker, client, otherClient, relationship, property, request, otherRequest, foreignRequest };
  });
  const ownerSession = await t.action(api.authActions.signIn, { email: "price-owner@test.dev", password: PASSWORD });
  const managerSession = await t.action(api.authActions.signIn, { email: "price-manager@test.dev", password: PASSWORD });
  const scheduleSession = await t.action(api.authActions.signIn, { email: "price-schedule@test.dev", password: PASSWORD });
  const workerSession = await t.action(api.authActions.signIn, { email: "price-worker@test.dev", password: PASSWORD });
  const clientSession = await t.action(api.clientAuthActions.signIn, { email: "price-client@test.dev", password: PASSWORD });
  const otherClientSession = await t.action(api.clientAuthActions.signIn, { email: "price-other-client@test.dev", password: PASSWORD });
  return { t, ...ids, ownerAuth: { userId: ids.owner, sessionToken: ownerSession.sessionToken }, managerAuth: { userId: ids.manager, sessionToken: managerSession.sessionToken }, scheduleAuth: { userId: ids.scheduleOnly, sessionToken: scheduleSession.sessionToken }, workerAuth: { userId: ids.worker, sessionToken: workerSession.sessionToken }, clientAuth: { clientUserId: ids.client, sessionToken: clientSession.sessionToken }, otherClientAuth: { clientUserId: ids.otherClient, sessionToken: otherClientSession.sessionToken } };
}

const offers = (api as any).mutations.servicePriceOffers;
const offerQueries = (api as any).queries.servicePriceOffers;
const schedule = (api as any).mutations.jobs.confirmClientRequestSchedule;
const scheduleArgs = (s: any) => ({ ...s.ownerAuth, requestId: s.request, scheduledDate: "2030-01-15", startTime: "09:00", durationMinutes: 120, type: "standard", idempotencyKey: "pricing_schedule_123456789" });

describe("residential pricing foundation", () => {
  it("prefills staff pricing from the request-time add-on snapshot after catalog changes", async () => {
    const s = await setup();
    const catalogId = await s.t.run(async (ctx) => {
      const id = await ctx.db.insert("companyAddOns", { companyId: s.company, name: "Oven", pricingMethod: "per_unit", priceCents: 1200, unitLabel: "oven", isActive: true, isPublic: true, displayOrder: 0, createdByUserId: s.owner, createdAt: 1, updatedAt: 1 });
      await ctx.db.patch(s.request, { requestedAddOnSnapshots: [{ sourceCompanyAddOnId: id, name: "Oven", pricingMethod: "per_unit", priceCents: 1200, quantity: 2, unitLabel: "oven" }] });
      await ctx.db.patch(id, { priceCents: 2000, name: "New oven price" });
      return id;
    });
    const requestData = await s.t.query(offerQueries.forRequest, { ...s.ownerAuth, requestId: s.request });
    expect(requestData.requestedAddOns).toEqual([{ sourceCompanyAddOnId: catalogId, name: "Oven", pricingMethod: "per_unit", priceCents: 1200, quantity: 2, unitLabel: "oven" }]);
    expect(requestData.offer).toBeNull();
    const { jobId } = await s.t.mutation(schedule, scheduleArgs(s));
    expect((await s.t.query(offerQueries.forJob, { ...s.ownerAuth, jobId })).requestedAddOns).toEqual(requestData.requestedAddOns);
    expect((await s.t.run((ctx) => ctx.db.get(jobId)))?.customerChargeCents).toBeUndefined();
  });
  it("keeps a direct request price pending and does not bill requested add-ons", async () => {
    const s = await setup();
    expect((await s.t.run((ctx) => ctx.db.get(s.request)))!.currentPriceOfferId).toBeUndefined();
    const result = await s.t.mutation(schedule, scheduleArgs(s));
    const job: any = await s.t.run((ctx) => ctx.db.get(result.jobId));
    expect(job.customerPricingStatus).toBe("pending");
    expect(job.customerChargeCents).toBeUndefined();
    await s.t.run((ctx) => ctx.db.patch(result.jobId, { status: "approved" }));
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, result.jobId, s.company))).toMatchObject({ ok: false, reason: "price_pending" });
  });

  it("accepts the exact offer before scheduling and snapshots it onto the job", async () => {
    const s = await setup();
    const offerId = await s.t.mutation(offers.issue, { ...s.ownerAuth, requestId: s.request, expectedRevision: 0, baseChargeCents: 15000, addOns: [{ name: "Oven", amountCents: 2500 }] });
    expect((await s.t.query(offerQueries.forClientRequest, { ...s.clientAuth, requestId: s.request })).offer.snapshot.totalCents).toBe(17500);
    await s.t.mutation(offers.respond, { ...s.clientAuth, offerId, decision: "accepted" });
    const { jobId } = await s.t.mutation(schedule, scheduleArgs(s));
    const job: any = await s.t.run((ctx) => ctx.db.get(jobId));
    expect(job).toMatchObject({ customerChargeCents: 17500, customerPricingStatus: "accepted", customerPriceOfferId: offerId, customerPriceConsent: { source: "client_in_app", acceptedAmountCents: 17500 } });
    await s.t.run((ctx) => ctx.db.patch(jobId, { status: "approved" }));
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ reason: "add_ons_unconfirmed" });
    await s.t.mutation(offers.confirmDeliveredAddOns, { ...s.ownerAuth, jobId, expectedRevision: 1 });
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ ok: true, totalCents: 17500, baseChargeCents: 15000 });
  });

  it("scheduling is not price acceptance; later acceptance finalizes the same offer", async () => {
    const s = await setup();
    const offerId = await s.t.mutation(offers.issue, { ...s.ownerAuth, requestId: s.request, expectedRevision: 0, baseChargeCents: 9000, addOns: [] });
    const { jobId } = await s.t.mutation(schedule, scheduleArgs(s));
    expect((await s.t.run((ctx) => ctx.db.get(jobId)))!.customerPricingStatus).toBe("awaiting_acceptance");
    await s.t.run((ctx) => ctx.db.patch(jobId, { status: "approved" }));
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ reason: "consent_pending" });
    await s.t.mutation(offers.respond, { ...s.clientAuth, offerId, decision: "accepted" });
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ ok: true, totalCents: 9000 });
  });

  it("records outside acceptance and rejects stale or cross-client responses", async () => {
    const s = await setup();
    const first = await s.t.mutation(offers.issue, { ...s.managerAuth, requestId: s.request, expectedRevision: 0, baseChargeCents: 10000, addOns: [] });
    const second = await s.t.mutation(offers.issue, { ...s.managerAuth, requestId: s.request, expectedRevision: 1, baseChargeCents: 12000, addOns: [] });
    await expect(s.t.mutation(offers.respond, { ...s.clientAuth, offerId: first, decision: "accepted" })).rejects.toThrow("current");
    await expect(s.t.mutation(offers.respond, { ...s.otherClientAuth, offerId: second, decision: "accepted" })).rejects.toThrow();
    await s.t.mutation(offers.recordOutsideAcceptance, { ...s.managerAuth, offerId: second, expectedRevision: 2, evidenceNote: "Client agreed by phone" });
    const offer: any = await s.t.run((ctx) => ctx.db.get(second));
    expect(offer).toMatchObject({ status: "accepted", outsideRecordedByUserId: s.manager, outsideEvidenceNote: "Client agreed by phone" });
    await expect(s.t.mutation(offers.issue, { ...s.managerAuth, requestId: s.request, expectedRevision: 1, baseChargeCents: 13000, addOns: [] })).rejects.toThrow("changed");
  });

  it("resolves approved pending and legacy jobs without fabricating a free price", async () => {
    const s = await setup();
    const { jobId } = await s.t.mutation(schedule, scheduleArgs(s));
    await s.t.run((ctx) => ctx.db.patch(jobId, { status: "approved", customerChargeCents: 0, customerPricingStatus: undefined }));
    expect(normalizedJobPrice(await s.t.run((ctx) => ctx.db.get(jobId)))).toBe("pending");
    await s.t.run((ctx) => ctx.db.patch(jobId, { customerChargeCents: 5000 }));
    expect(normalizedJobPrice(await s.t.run((ctx) => ctx.db.get(jobId)))).toBe("legacy_unverified");
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ reason: "legacy_unverified" });
    await s.t.mutation(offers.markNoCharge, { ...s.ownerAuth, jobId, expectedRevision: 0, reason: "complimentary" });
    expect((await s.t.run((ctx) => ctx.db.get(jobId)))!).toMatchObject({ customerChargeCents: 0, customerPricingStatus: "no_charge", customerNoChargeRecordedByUserId: s.owner });
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ reason: "no_charge" });
  });

  it("requires sales authority and validates snapshots and company isolation", async () => {
    const s = await setup();
    await expect(s.t.mutation(offers.issue, { ...s.scheduleAuth, requestId: s.request, expectedRevision: 0, baseChargeCents: 10000, addOns: [] })).rejects.toThrow("Pricing permission");
    await expect(s.t.mutation(offers.issue, { ...s.workerAuth, requestId: s.request, expectedRevision: 0, baseChargeCents: 10000, addOns: [] })).rejects.toThrow();
    await expect(s.t.mutation(offers.issue, { ...s.ownerAuth, requestId: s.foreignRequest, expectedRevision: 0, baseChargeCents: 10000, addOns: [] })).rejects.toThrow();
    await expect(s.t.mutation(offers.issue, { ...s.ownerAuth, requestId: s.otherRequest, expectedRevision: 0, baseChargeCents: 10000, addOns: [] })).resolves.toBeDefined();
    expect(() => checkedPriceSnapshot(100, [{ snapshotId: "a", name: "Oven", amountCents: 50 }, { snapshotId: "a", name: "Oven", amountCents: 50 }])).toThrow();
    const { jobId } = await s.t.mutation(schedule, scheduleArgs(s));
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.otherCompany))).toMatchObject({ reason: "wrong_company" });
    await s.t.run((ctx) => ctx.db.patch(jobId, { cleanerIds: [s.worker], customerPricingStatus: "accepted", customerChargeCents: 10000, customerPricingSource: "direct_quote" }));
    const workerView = await s.t.query(api.queries.jobs.get, { ...s.workerAuth, jobId });
    expect(workerView).not.toHaveProperty("customerPricingStatus");
    expect(workerView).not.toHaveProperty("customerPricingSource");
  });

  it("uses the accepted issued one-time proposal price, not later live edits", async () => {
    const s = await setup();
    const proposalId = await s.t.run((ctx) => ctx.db.insert("proposals", { companyId: s.company, clientRelationshipId: s.relationship, clientRequestId: s.request, createdByUserId: s.owner, title: "One-time clean", clientName: "Client", oneTimePriceCents: 20000, addOnLineItems: [{ lineItemId: "oven", sourceType: "custom", name: "Oven", pricingMethod: "flat", unitPriceCents: 3000, billingCadence: "one_time" }], status: "draft", createdAt: 1, updatedAt: 1 }));
    await s.t.mutation(api.mutations.proposals.markProposalSent, { ...s.ownerAuth, proposalId });
    await s.t.mutation(api.mutations.proposals.markProposalAccepted, { ...s.ownerAuth, proposalId });
    const proposal: any = await s.t.run((ctx) => ctx.db.get(proposalId));
    await s.t.run((ctx) => ctx.db.patch(proposalId, { oneTimePriceCents: 99999, addOnLineItems: [] }));
    const { jobId } = await s.t.mutation(schedule, scheduleArgs(s));
    const job: any = await s.t.run((ctx) => ctx.db.get(jobId));
    expect(job).toMatchObject({ customerPricingStatus: "accepted", customerPricingSource: "accepted_proposal", customerChargeCents: 23000, customerPriceProposalIssueId: proposal.responseIssueId, customerPriceConsent: { source: "owner_reported_outside", recordedByUserId: s.owner } });
    await s.t.run((ctx) => ctx.db.patch(jobId, { status: "approved" }));
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ reason: "add_ons_unconfirmed" });
    await s.t.mutation(offers.confirmDeliveredAddOns, { ...s.ownerAuth, jobId, expectedRevision: 1 });
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ ok: true, totalCents: 23000 });
    const originalSnapshot = (await s.t.run((ctx) => ctx.db.get(jobId)))!.customerPricingSnapshot!;
    await s.t.run((ctx) => ctx.db.patch(jobId, { customerPricingSnapshot: { ...originalSnapshot, baseChargeCents: 19000, addOns: [{ ...originalSnapshot.addOns[0], amountCents: 4000 }] } }));
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ reason: "invalid_snapshot" });
    await s.t.run((ctx) => ctx.db.patch(jobId, { customerPricingSnapshot: originalSnapshot }));
  });

  it("leaves monthly-only and issue-less accepted proposals unverified", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.insert("proposals", { companyId: s.company, clientRelationshipId: s.relationship, clientRequestId: s.request, createdByUserId: s.owner, title: "Monthly", clientName: "Client", monthlyPriceCents: 10000, status: "accepted", createdAt: 1, updatedAt: 1 }));
    const { jobId } = await s.t.mutation(schedule, scheduleArgs(s));
    expect((await s.t.run((ctx) => ctx.db.get(jobId)))!).toMatchObject({ customerPricingStatus: "pending", customerPricingSource: "legacy_unknown" });
  });

  it("does not turn an issued monthly proposal into a per-job charge", async () => {
    const s = await setup();
    const proposalId = await s.t.run((ctx) => ctx.db.insert("proposals", { companyId: s.company, clientRelationshipId: s.relationship, clientRequestId: s.request, createdByUserId: s.owner, title: "Recurring clean", clientName: "Client", monthlyPriceCents: 30000, status: "draft", createdAt: 1, updatedAt: 1 }));
    await s.t.mutation(api.mutations.proposals.markProposalSent, { ...s.ownerAuth, proposalId });
    await s.t.mutation(api.mutations.proposals.markProposalAccepted, { ...s.ownerAuth, proposalId });
    const { jobId } = await s.t.mutation(schedule, scheduleArgs(s));
    expect((await s.t.run((ctx) => ctx.db.get(jobId)))!).toMatchObject({ customerPricingStatus: "pending", customerPricingSource: "legacy_unknown" });
    expect((await s.t.run((ctx) => ctx.db.get(jobId)))!.customerChargeCents).toBeUndefined();
  });

  it("requires a new accepted version when a post-service add-on raises the charge", async () => {
    const s = await setup();
    const { jobId } = await s.t.mutation(schedule, scheduleArgs(s));
    await s.t.run((ctx) => ctx.db.patch(jobId, { status: "approved" }));
    const first = await s.t.mutation(offers.issue, { ...s.ownerAuth, jobId, expectedRevision: 0, baseChargeCents: 10000, addOns: [] });
    await s.t.mutation(offers.respond, { ...s.clientAuth, offerId: first, decision: "accepted" });
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ ok: true, totalCents: 10000 });
    const second = await s.t.mutation(offers.issue, { ...s.ownerAuth, jobId, expectedRevision: 1, baseChargeCents: 10000, addOns: [{ name: "Windows", amountCents: 2000 }] });
    expect((await s.t.run((ctx) => ctx.db.get(first)))!.status).toBe("superseded");
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ reason: "consent_pending" });
    await s.t.mutation(offers.respond, { ...s.clientAuth, offerId: second, decision: "accepted" });
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ reason: "add_ons_unconfirmed" });
    await s.t.mutation(offers.confirmDeliveredAddOns, { ...s.ownerAuth, jobId, expectedRevision: 2 });
    expect(await s.t.run((ctx) => resolveJobInvoiceablePricing(ctx, jobId, s.company))).toMatchObject({ ok: true, totalCents: 12000 });
  });
});
