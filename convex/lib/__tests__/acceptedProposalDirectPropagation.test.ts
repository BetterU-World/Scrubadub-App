import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { operationalAddOnSnapshots } from "../acceptedProposalAddOnSnapshots";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

beforeEach(() => {
  process.env.TOKEN_PEPPER = "test-token-pepper";
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.APP_URL = "http://localhost:5173";
});

async function setup(proposalStatus: "accepted" | "sent" = "accepted") {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Propagation Co", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { email: "propagation-owner@example.com", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
    const cleanerId = await ctx.db.insert("users", { email: "propagation-cleaner@example.com", passwordHash, name: "Cleaner", companyId, role: "cleaner", status: "active" });
    const relationshipId = await ctx.db.insert("clientRelationships", { companyId, displayName: "Client", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const propertyId = await ctx.db.insert("properties", { companyId, clientRelationshipId: relationshipId, name: "Home", type: "residential", address: "1 Main St", amenities: [], active: true });
    const addOnId = await ctx.db.insert("companyAddOns", { companyId, name: "Windows", pricingMethod: "per_unit", priceCents: 800, unitLabel: "window", isActive: true, isPublic: true, displayOrder: 0, createdByUserId: ownerId, createdAt: 1, updatedAt: 1 });
    const requestId = await ctx.db.insert("clientRequests", { companyId, clientRelationshipId: relationshipId, propertyId, createdAt: 1, status: "accepted", requesterName: "Client", requesterEmail: "client@example.com", propertySnapshot: { address: "1 Main St" }, source: "manual", leadType: "residential", leadStage: "accepted", requestedService: "Core clean" });
    const proposalId = await ctx.db.insert("proposals", {
      companyId, clientRelationshipId: relationshipId, clientRequestId: requestId, createdByUserId: ownerId,
      title: "Accepted", clientName: "Client", status: proposalStatus, monthlyPriceCents: 10000,
      addOnLineItems: [{ lineItemId: "proposal-line", sourceType: "catalog", sourceCompanyAddOnId: addOnId, name: "Windows", pricingMethod: "per_unit", unitPriceCents: 800, unitLabel: "window", quantity: 3, billingCadence: "monthly" }],
      createdAt: 1, updatedAt: 1,
    });
    return { companyId, otherCompanyId, ownerId, cleanerId, relationshipId, propertyId, addOnId, requestId, proposalId };
  });
  const ownerSession = await t.action(api.authActions.signIn, { email: "propagation-owner@example.com", password: PASSWORD });
  const cleanerSession = await t.action(api.authActions.signIn, { email: "propagation-cleaner@example.com", password: PASSWORD });
  return { t, ...ids, ownerAuth: { userId: ids.ownerId, sessionToken: ownerSession.sessionToken }, cleanerAuth: { userId: ids.cleanerId, sessionToken: cleanerSession.sessionToken } };
}

describe("accepted proposal direct propagation", () => {
  it("copies complete immutable snapshots atomically into direct jobs", async () => {
    const s = await setup();
    const jobId = await s.t.mutation(api.mutations.jobs.create, {
      ...s.ownerAuth, companyId: s.companyId, propertyId: s.propertyId, cleanerIds: [], type: "standard", scheduledDate: "2030-01-10", durationMinutes: 120,
      proposalId: s.proposalId, clientRequestId: s.requestId,
    });
    let job: any = await s.t.run((ctx) => ctx.db.get(jobId));
    expect(job.sourceProposalId).toBe(s.proposalId);
    expect(job.acceptedProposalAddOnSnapshots[0]).toMatchObject({ sourceProposalId: s.proposalId, sourceProposalLineItemId: "proposal-line", originalSourceType: "catalog", sourceCompanyAddOnId: s.addOnId, name: "Windows", unitPriceCents: 800, quantity: 3, lineTotalCents: 2400, billingCadence: "monthly" });
    await s.t.run((ctx) => ctx.db.patch(s.proposalId, { addOnLineItems: [] }));
    job = await s.t.run((ctx) => ctx.db.get(jobId));
    expect(job.acceptedProposalAddOnSnapshots).toHaveLength(1);
  });

  it("rejects non-accepted, foreign, and mismatched proposal context without creating jobs", async () => {
    const sent = await setup("sent");
    const args = { ...sent.ownerAuth, companyId: sent.companyId, propertyId: sent.propertyId, cleanerIds: [], type: "standard" as const, scheduledDate: "2030-01-10", durationMinutes: 120, proposalId: sent.proposalId, clientRequestId: sent.requestId };
    await expect(sent.t.mutation(api.mutations.jobs.create, args)).rejects.toThrow("accepted proposal");
    expect(await sent.t.run((ctx) => ctx.db.query("jobs").collect())).toHaveLength(0);
    const accepted = await setup();
    const otherRequestId = await accepted.t.run((ctx) => ctx.db.insert("clientRequests", { companyId: accepted.companyId, createdAt: 2, status: "new", requesterName: "Other", requesterEmail: "other@example.com", propertySnapshot: {}, source: "manual", leadType: "residential", leadStage: "new" }));
    await expect(accepted.t.mutation(api.mutations.jobs.create, { ...args, ...accepted.ownerAuth, companyId: accepted.companyId, propertyId: accepted.propertyId, cleanerIds: [], proposalId: accepted.proposalId, clientRequestId: otherRequestId })).rejects.toThrow("match");
  });

  it("keeps manual jobs compatible and gives workers only operational add-ons", async () => {
    const s = await setup();
    const manualId = await s.t.mutation(api.mutations.jobs.create, { ...s.ownerAuth, companyId: s.companyId, propertyId: s.propertyId, cleanerIds: [], type: "standard", scheduledDate: "2030-01-09", durationMinutes: 60 });
    expect((await s.t.run((ctx) => ctx.db.get(manualId)))!.acceptedProposalAddOnSnapshots).toBeUndefined();
    const jobId = await s.t.mutation(api.mutations.jobs.create, { ...s.ownerAuth, companyId: s.companyId, propertyId: s.propertyId, cleanerIds: [], type: "standard", scheduledDate: "2030-01-10", durationMinutes: 120, proposalId: s.proposalId, clientRequestId: s.requestId });
    await s.t.run((ctx) => ctx.db.patch(jobId, { cleanerIds: [s.cleanerId] }));
    const ownerView: any = await s.t.query(api.queries.jobs.get, { ...s.ownerAuth, jobId });
    const workerView: any = await s.t.query(api.queries.jobs.get, { ...s.cleanerAuth, jobId });
    expect(ownerView.acceptedProposalAddOnSnapshots[0].unitPriceCents).toBe(800);
    expect(workerView.requiredAddOns).toEqual([{ snapshotId: expect.any(String), name: "Windows", quantity: 3, unitLabel: "window" }]);
    expect(workerView.acceptedProposalAddOnSnapshots).toBeUndefined();
    expect(workerView.sourceProposalId).toBeUndefined();
    expect(JSON.stringify(workerView)).not.toContain("unitPriceCents");
  });

  it("copies snapshots and add-on totals into service agreements and client-safe payloads", async () => {
    const s = await setup();
    const agreementId = await s.t.mutation((api as any).mutations.serviceAgreements.createDraftFromAcceptedProposal, { ...s.ownerAuth, proposalId: s.proposalId });
    const agreement: any = await s.t.run((ctx) => ctx.db.get(agreementId));
    expect(agreement.acceptedProposalAddOnSnapshots[0]).toMatchObject({ name: "Windows", lineTotalCents: 2400 });
    expect(agreement.priceSummary).toBe("$124.00 per month");
    expect(agreement.body).toContain("Committed Add-Ons");
    expect(agreement.body).toContain("Windows");
    await s.t.run((ctx) => ctx.db.patch(s.proposalId, { addOnLineItems: [] }));
    expect((await s.t.run((ctx) => ctx.db.get(agreementId)))!.acceptedProposalAddOnSnapshots).toHaveLength(1);
  });

  it("never exposes economic or trace fields in operational projections", () => {
    const projected = operationalAddOnSnapshots([{ snapshotId: "s", sourceProposalId: "p", sourceProposalLineItemId: "l", originalSourceType: "catalog", sourceCompanyAddOnId: "c", name: "Windows", pricingMethod: "flat", unitPriceCents: 1000, lineTotalCents: 1000, billingCadence: "one_time" }] as any);
    expect(projected).toEqual([{ snapshotId: "s", name: "Windows", quantity: undefined, unitLabel: undefined }]);
    expect(JSON.stringify(projected)).not.toMatch(/price|source/i);
  });

  it("keeps presentation responsive, accessible, localized, and PR 2 concerns out of scope", () => {
    const component = readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/components/AddOnSnapshotList.tsx", import.meta.url)), "utf8");
    const jobs = readFileSync(fileURLToPath(new URL("../../mutations/jobs.ts", import.meta.url)), "utf8");
    const schedules = readFileSync(fileURLToPath(new URL("../../mutations/commercialSchedules.ts", import.meta.url)), "utf8");
    const partners = readFileSync(fileURLToPath(new URL("../../mutations/partners.ts", import.meta.url)), "utf8");
    const delivery = readFileSync(fileURLToPath(new URL("../../serviceAgreementDeliveryInternal.ts", import.meta.url)), "utf8");
    const email = readFileSync(fileURLToPath(new URL("../email.ts", import.meta.url)), "utf8");
    const mergeFields = readFileSync(fileURLToPath(new URL("../documentMergeFields.ts", import.meta.url)), "utf8");
    const en = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/i18n/en/common.json", import.meta.url)), "utf8"));
    const es = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/i18n/es/common.json", import.meta.url)), "utf8"));
    expect(component).toContain("aria-labelledby");
    expect(component).toContain("sm:flex-row");
    expect(jobs).toContain("copyAcceptedProposalAddOnSnapshots");
    expect(schedules).not.toContain("acceptedProposalAddOnSnapshots");
    expect(partners).not.toContain("acceptedProposalAddOnSnapshots");
    const deliveryProjection = delivery.slice(delivery.indexOf("committedAddOns:"), delivery.indexOf("})),", delivery.indexOf("committedAddOns:")));
    expect(deliveryProjection).not.toMatch(/sourceProposal|sourceCompany|sourceClient/);
    expect(email).toContain("args.agreement.committedAddOns.map");
    expect(mergeFields).toContain('{{add_on_line_items}}');
    expect(en.addOnPropagation.requiredTitle).toBeTruthy();
    expect(es.addOnPropagation.committedTitle).toBeTruthy();
  });
});
