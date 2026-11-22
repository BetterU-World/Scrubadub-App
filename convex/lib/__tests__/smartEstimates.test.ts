import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";
import { calculateEstimate } from "../smartEstimatePricing";

const modules = import.meta.glob("../../**/*.ts");
const estimates = internal.mutations.smartEstimates;
const proposals = api.mutations.proposals;
const password = "estimate-test-password";
const privateReason = "internal below-minimum rationale";

beforeEach(() => {
  vi.stubEnv("TOKEN_PEPPER", "estimate-test-pepper");
  vi.stubEnv("RESEND_API_KEY", "estimate-test-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "test@example.com");
  vi.stubEnv("APP_URL", "https://app.scrub.test");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "estimate-test-email" })));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup(type: "residential" | "vacation_rental" | "commercial" = "residential") {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(password);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Estimates", timezone: "America/New_York" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Other", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { companyId, role: "owner", status: "active", email: "owner@test.dev", name: "Owner", passwordHash });
    const salesId = await ctx.db.insert("users", { companyId, role: "manager", status: "active", canManageSalesAndCommercial: true, email: "sales@test.dev", name: "Sales", passwordHash });
    const viewerId = await ctx.db.insert("users", { companyId, role: "manager", status: "active", canViewFinancials: true, email: "viewer@test.dev", name: "Viewer", passwordHash });
    const relationshipId = await ctx.db.insert("clientRelationships", { companyId, displayName: "Client", clientType: type === "vacation_rental" ? "residential" : type, email: "client@test.dev", status: "active", createdAt: 1, updatedAt: 1 });
    const propertyId = await ctx.db.insert("properties", { companyId, clientRelationshipId: relationshipId, name: "Site", type, address: "1 Main", amenities: [], active: true });
    const requestFields = { status: "new", requesterName: "Client", requesterEmail: "client@test.dev", propertySnapshot: { address: "1 Main" }, source: "manual", leadType: type === "vacation_rental" ? "str_airbnb" : type, leadStage: "new", createdAt: 1 } as const;
    const clientRequestId = await ctx.db.insert("clientRequests", { ...requestFields, companyId, clientRelationshipId: relationshipId, propertyId });
    const foreignRequestId = await ctx.db.insert("clientRequests", { ...requestFields, companyId: foreignCompany });
    const addOn = (name: string, priceCents: number) => ctx.db.insert("companyAddOns", {
      companyId, name, priceCents, pricingMethod: "flat", isActive: true, isPublic: true, displayOrder: 0, createdByUserId: ownerId, createdAt: 1, updatedAt: 1,
    });
    const ovenId = await addOn("Oven", 2500);
    const floorsId = await addOn("Floors", 5000);
    return { companyId, ownerId, salesId, viewerId, propertyId, clientRequestId, foreignRequestId, ovenId, floorsId };
  });
  const signIn = async (email: string) => (await t.action(api.authActions.signIn, { email, password })).sessionToken;
  const owner = { userId: ids.ownerId, sessionToken: await signIn("owner@test.dev") };
  return { t, ...ids, owner, signIn };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function open(s: Setup, cadence: "one_time" | "monthly") {
  return s.t.mutation(estimates.openDraft, {
    ...s.owner, clientRequestId: s.clientRequestId, input: { strategy: "flat", cadence, baseCents: 20000, minimumCents: 18000 },
    override: { baseCents: 15000, reason: privateReason },
  });
}

async function approveAndApply(s: Setup, cadence: "one_time" | "monthly") {
  const estimateId = await open(s, cadence);
  const proposalId = await s.t.mutation(proposals.createProposalFromLead, { ...s.owner, clientRequestId: s.clientRequestId });
  const ovenLine = await s.t.mutation(proposals.addCatalogAddOnLine, { ...s.owner, proposalId, companyAddOnId: s.ovenId, billingCadence: "one_time" });
  const floorsLine = cadence === "monthly" ? await s.t.mutation(proposals.addCatalogAddOnLine, {
    ...s.owner, proposalId, companyAddOnId: s.floorsId, billingCadence: "monthly",
  }) : undefined;
  const expectedProposalRevision = (await s.t.run(ctx => ctx.db.get(proposalId)))!.updatedAt;
  const revisionId = await s.t.mutation(estimates.approve, {
    ...s.owner, estimateId, expectedDraftRevision: 1, proposal: { proposalId, expectedProposalRevision },
  });
  const applyArgs = { ...s.owner, estimateId, proposalId, revisionId, expectedProposalRevision };
  const appliedAt = await s.t.mutation(estimates.applyToProposal, applyArgs);
  expect(await s.t.mutation(estimates.applyToProposal, applyArgs)).toBe(appliedAt);
  const draft = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
  expect(draft.addOnLineItems?.map(line => line.lineItemId)).toEqual(floorsLine ? [ovenLine, floorsLine] : [ovenLine]);
  return { estimateId, proposalId, revisionId, applyArgs, appliedAt, ovenLine, floorsLine };
}

describe("Smart Estimates Phase 1", () => {
  it("validates whole cents, base minimums and explicit overrides", () => {
    const input = { strategy: "flat", cadence: "monthly", baseCents: 100, minimumCents: 200 } as const;
    expect(calculateEstimate(input, []).approved.monthlyTotalCents).toBe(200);
    expect(() => calculateEstimate(input, [], { baseCents: 100, reason: " " })).toThrow("requires a reason");
    expect(() => calculateEstimate({ ...input, baseCents: 1.1 }, [])).toThrow("whole cents");
  });

  it("preserves the approved one-time price and catalog line through issue, acceptance, job and residential invoice", async () => {
    const s = await setup();
    const { proposalId, revisionId, ovenLine } = await approveAndApply(s, "one_time");
    await s.t.action(api.proposalDeliveryActions.sendProposal, { ...s.owner, proposalId });
    const issue = await s.t.run(async ctx => ctx.db.get((await ctx.db.get(proposalId))!.currentIssueId!));
    expect(issue?.appliedEstimateRevisionId).toBe(revisionId);
    const { proposalIssueToken } = await import("../tokens");
    const token = await proposalIssueToken(issue!.tokenNonce!);
    const publicOffer = await s.t.action(api.proposalDeliveryActions.getProposalByToken, { token });
    expect(publicOffer?.proposal.totals).toMatchObject({ baseOneTimePriceCents: 15000, addOnOneTimeTotalCents: 2500, oneTimeTotalCents: 17500 });
    for (const value of [publicOffer, vi.mocked(fetch).mock.calls]) {
      expect(JSON.stringify(value)).not.toContain("appliedEstimateRevisionId");
      expect(JSON.stringify(value)).not.toContain(privateReason);
    }
    await s.t.action(api.proposalDeliveryActions.respondToProposal, { token, decision: "accepted" });
    const jobId = await s.t.mutation(api.mutations.jobs.create, {
      ...s.owner, companyId: s.companyId, propertyId: s.propertyId, clientRequestId: s.clientRequestId, proposalId,
      cleanerIds: [], type: "standard", scheduledDate: "2030-01-10", durationMinutes: 60,
    });
    const job = await s.t.run(ctx => ctx.db.get(jobId));
    expect(job).toMatchObject({
      customerPricingStatus: "accepted", customerPriceProposalIssueId: issue!._id,
      customerPricingSnapshot: { baseChargeCents: 15000, totalCents: 17500 },
      acceptedProposalAddOnSnapshots: [{ sourceProposalLineItemId: ovenLine, sourceCompanyAddOnId: s.ovenId, lineTotalCents: 2500 }],
    });
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.owner, jobId })).rejects.toThrow("not_approved");
    await s.t.run(ctx => ctx.db.patch(jobId, { status: "approved" }));
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.owner, jobId })).rejects.toThrow("add_ons_unconfirmed");
    await s.t.mutation(api.mutations.servicePriceOffers.confirmDeliveredAddOns, { ...s.owner, jobId, expectedRevision: 1 });
    const invoiceId = await s.t.mutation(api.mutations.invoices.createFromJob, { ...s.owner, jobId });
    const invoice = await s.t.run(ctx => ctx.db.get(invoiceId));
    expect(invoice).toMatchObject({ status: "draft", baseSubtotalCents: 15000, addOnSubtotalCents: 2500, totalCents: 17500 });
    expect(invoice?.jobPricingSnapshot?.addOns).toEqual(job?.customerPricingSnapshot?.addOns);
    expect(JSON.stringify(invoice)).not.toContain(revisionId);
  });

  it("uses the confirmed monthly base once and bills a one-time add-on only once commercially", async () => {
    const s = await setup("commercial");
    const { proposalId, ovenLine, floorsLine } = await approveAndApply(s, "monthly");
    await s.t.mutation(proposals.markProposalSent, { ...s.owner, proposalId });
    await s.t.mutation(proposals.markProposalAccepted, { ...s.owner, proposalId });
    const serviceAgreementId = await s.t.mutation(api.mutations.serviceAgreements.createDraftFromAcceptedProposal, { ...s.owner, proposalId });
    const agreement = await s.t.run(ctx => ctx.db.get(serviceAgreementId));
    expect(agreement?.priceSummary).toBe("$200.00 per month + $25.00 one-time");
    expect(agreement?.contractAmountCents).toBeUndefined();
    const accepted = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    const commercialAccountId = await s.t.mutation(api.mutations.commercialAccounts.create, {
      ...s.owner, sourceProposalId: proposalId, serviceAgreementId, clientName: "Client",
      contractAmountCents: accepted.monthlyPriceCents, status: "active",
    });
    const invoiceFor = async (month: string) => {
      const jobId = await s.t.run(ctx => ctx.db.insert("jobs", {
        companyId: s.companyId, commercialAccountId, propertyId: s.propertyId, cleanerIds: [],
        type: "standard", status: "approved", durationMinutes: 60, reworkCount: 0, scheduledDate: `2030-${month}-12`,
      }));
      const invoiceId = await s.t.mutation(api.mutations.invoices.create, {
        ...s.owner, commercialAccountId, title: "Monthly service", billingStartDate: `2030-${month}-01`,
        billingEndDate: `2030-${month}-28`, issueDate: `2030-${month}-28`, dueDate: `2030-${month}-28`, jobIds: [jobId],
      });
      return s.t.run(ctx => ctx.db.get(invoiceId));
    };
    const first = await invoiceFor("01");
    expect(first).toMatchObject({ baseSubtotalCents: 15000, addOnSubtotalCents: 7500, totalCents: 22500 });
    expect(first?.addOnLineItems?.map(line => line.sourceProposalLineItemId)).toEqual([ovenLine, floorsLine]);
    await s.t.mutation(api.mutations.invoices.markIssued, { ...s.owner, invoiceId: first!._id });
    const second = await invoiceFor("02");
    expect(second).toMatchObject({ baseSubtotalCents: 15000, addOnSubtotalCents: 5000, totalCents: 20000 });
    expect(second?.addOnLineItems?.map(line => line.sourceProposalLineItemId)).toEqual([floorsLine]);
  });

  it("isolates drafts, validates revisions and makes pricing edits manual on reissue", async () => {
    const s = await setup();
    const input = { strategy: "flat", cadence: "one_time", baseCents: 9000 } as const;
    const openArgs = { ...s.owner, clientRequestId: s.clientRequestId, input };
    await expect(s.t.mutation(estimates.openDraft, { ...openArgs, clientRequestId: s.foreignRequestId })).rejects.toThrow("Access denied");
    await expect(s.t.mutation(estimates.openDraft, {
      ...openArgs, userId: s.viewerId, sessionToken: await s.signIn("viewer@test.dev"),
    })).rejects.toThrow("canManageSalesAndCommercial");
    const { estimateId, proposalId, revisionId, applyArgs } = await approveAndApply(s, "one_time");
    expect(await s.t.mutation(estimates.openDraft, openArgs)).toBe(estimateId);
    const sales = { userId: s.salesId, sessionToken: await s.signIn("sales@test.dev") };
    expect(await s.t.mutation(estimates.saveDraft, { ...sales, estimateId, expectedDraftRevision: 1, input })).toBe(2);
    await expect(s.t.mutation(estimates.saveDraft, { ...sales, estimateId, expectedDraftRevision: 1, input })).rejects.toThrow("draft changed");
    expect(await s.t.run(ctx => ctx.db.get(revisionId))).toMatchObject({ approvedBaseCents: 15000, override: { reason: privateReason } });
    const pending = await s.t.mutation(internal.proposalDeliveryInternal.prepareProposalEmail, {
      companyId: s.companyId, proposalId, tokenNonce: "nonce", tokenHash: "hash",
    });
    await expect(s.t.mutation(estimates.applyToProposal, applyArgs)).rejects.toThrow("pending");
    await s.t.mutation(internal.proposalDeliveryInternal.finishProposalEmail, {
      companyId: s.companyId, proposalId, attemptId: pending.attemptId, result: "provider_accepted",
    });
    const firstIssueId = (await s.t.run(ctx => ctx.db.get(proposalId)))!.currentIssueId!;
    await s.t.mutation(proposals.returnProposalToDraft, { ...s.owner, proposalId });
    const newRevision = await s.t.mutation(proposals.updateProposal, {
      ...s.owner, proposalId, title: "Manual edit", clientName: "Client", oneTimePriceCents: 9500,
    });
    await expect(s.t.mutation(estimates.applyToProposal, applyArgs)).rejects.toThrow("Proposal draft changed");
    expect((await s.t.run(ctx => ctx.db.get(proposalId)))?.appliedEstimateRevisionId).toBeUndefined();
    expect((await s.t.run(ctx => ctx.db.get(proposalId)))?.updatedAt).toBe(newRevision);
    await s.t.mutation(proposals.markProposalSent, { ...s.owner, proposalId });
    const first = await s.t.run(ctx => ctx.db.get(firstIssueId));
    const current = await s.t.run(async ctx => ctx.db.get((await ctx.db.get(proposalId))!.currentIssueId!));
    expect(first).toMatchObject({ withdrawnAt: expect.any(Number), appliedEstimateRevisionId: revisionId });
    expect(first?.content.proposal.oneTimePriceCents).toBe(15000);
    expect(current?.appliedEstimateRevisionId).toBeUndefined();
    expect(current?.content.proposal.oneTimePriceCents).toBe(9500);
  });

  it("rejects changed add-ons and unsupported handoff cadence before applying", async () => {
    const s = await setup();
    const { estimateId, proposalId, applyArgs, ovenLine } = await approveAndApply(s, "one_time");
    await s.t.mutation(proposals.removeAddOnLine, { ...s.owner, proposalId, lineItemId: ovenLine });
    const current = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    await expect(s.t.mutation(estimates.applyToProposal, { ...applyArgs, expectedProposalRevision: current.updatedAt }))
      .rejects.toThrow("Proposal add-ons changed");
    await s.t.mutation(estimates.saveDraft, {
      ...s.owner, estimateId, expectedDraftRevision: 1, input: { strategy: "flat", cadence: "monthly", baseCents: 15000 },
    });
    const revisionId = await s.t.mutation(estimates.approve, {
      ...s.owner, estimateId, expectedDraftRevision: 2, proposal: { proposalId, expectedProposalRevision: current.updatedAt },
    });
    await expect(s.t.mutation(estimates.applyToProposal, { ...applyArgs, revisionId, expectedProposalRevision: current.updatedAt }))
      .rejects.toThrow("requires one-time pricing only");
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toEqual(current);
  });

  it.each([
    { type: "residential", baseCents: 15000, lineCount: 21, error: "Too many priced add-ons" },
    { type: "vacation_rental", baseCents: 100_000_000, lineCount: 1, error: "Customer charge is too large" },
  ] as const)("rejects $error on a $type estimate and leaves the proposal untouched", async ({ type, baseCents, lineCount, error }) => {
    const s = await setup(type);
    const proposalId = await s.t.mutation(proposals.createProposalFromLead, { ...s.owner, clientRequestId: s.clientRequestId });
    for (let index = 0; index < lineCount; index++) {
      await s.t.mutation(proposals.addCustomAddOnLine, {
        ...s.owner, proposalId, name: `Service ${index + 1}`, pricingMethod: "flat", unitPriceCents: 2500, billingCadence: "one_time",
      });
    }
    const before = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    const estimateId = await s.t.mutation(estimates.openDraft, {
      ...s.owner, clientRequestId: s.clientRequestId, input: { strategy: "flat", cadence: "one_time", baseCents },
    });
    const expectedProposalRevision = before.updatedAt;
    const revisionId = await s.t.mutation(estimates.approve, {
      ...s.owner, estimateId, expectedDraftRevision: 1, proposal: { proposalId, expectedProposalRevision },
    });
    await expect(s.t.mutation(estimates.applyToProposal, { ...s.owner, estimateId, revisionId, proposalId, expectedProposalRevision }))
      .rejects.toThrow(`Smart Estimate exceeds job billing constraints: ${error}`);
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toEqual(before);
  });
});
