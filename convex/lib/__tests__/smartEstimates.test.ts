import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";
import { calculateEstimate } from "../smartEstimatePricing";

const modules = import.meta.glob("../../**/*.ts");
const estimates = internal.mutations.smartEstimates;
const proposals = api.mutations.proposals;
const preview = api.queries.smartEstimatePreview;
const browserEstimates = api.mutations.smartEstimates;
const profileChanges = api.mutations.smartPricingProfiles;
const password = "estimate-test-password";
const privateReason = "internal below-minimum rationale";

beforeEach(() => {
  vi.stubEnv("SCRUB_SMART_ESTIMATES_RELEASE_ENABLED", undefined);
  vi.stubEnv("SCRUB_SMART_ESTIMATES_PREVIEW_COMPANY_ID", undefined);
  vi.stubEnv("SCRUB_BRANDED_PROPOSAL_PREVIEW_COMPANY_ID", undefined);
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
  it("requires a current revision-specific confirmation for budget, frequency and add-on edits", async () => {
    const s = await setup();
    const { proposalId, revisionId, appliedAt, ovenLine, applyArgs } = await approveAndApply(s, "one_time");
    const before = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    const sales = { userId: s.salesId, sessionToken: await s.signIn("sales@test.dev") };
    const edit = { ...sales, proposalId, title: before.title, clientName: before.clientName,
      oneTimePriceCents: before.oneTimePriceCents, expectedProposalRevision: appliedAt };
    const budget = { ...edit, monthlyPriceCents: 12000 };
    const line = { ...sales, proposalId, lineItemId: ovenLine, name: "Oven",
      pricingMethod: "flat" as const, unitPriceCents: 3000, billingCadence: "one_time" as const };
    await expect(s.t.mutation(proposals.updateProposal, budget)).rejects.toThrow("Confirm switching");
    await expect(s.t.mutation(proposals.updateProposal, { ...edit, serviceFrequency: "weekly" })).rejects.toThrow("Confirm switching");
    await expect(s.t.mutation(proposals.updateAddOnLine, line)).rejects.toThrow("Confirm switching");
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toEqual(before);

    const updatedAt = await s.t.mutation(proposals.updateProposal, { ...edit, notes: "Customer note" });
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toMatchObject({ appliedEstimateRevisionId: revisionId });
    await expect(s.t.mutation(proposals.updateProposal, { ...budget, confirmedEstimateRevisionId: revisionId })).rejects.toThrow("Proposal draft changed");
    await s.t.mutation(proposals.updateAddOnLine, { ...line, unitPriceCents: 2500 });
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toMatchObject({ updatedAt, appliedEstimateRevisionId: revisionId });
    await s.t.mutation(proposals.updateAddOnLine, {
      ...line, expectedProposalRevision: updatedAt, confirmedEstimateRevisionId: revisionId,
    });
    const manual = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    expect(manual.appliedEstimateRevisionId).toBeUndefined();
    expect(manual.addOnLineItems).toEqual([expect.objectContaining({
      lineItemId: ovenLine, sourceCompanyAddOnId: s.ovenId, unitPriceCents: 3000,
    })]);
    await expect(s.t.mutation(estimates.applyToProposal, { ...applyArgs, expectedProposalRevision: manual.updatedAt })).rejects.toThrow("add-ons changed");
    expect(await s.t.run(ctx => ctx.db.get(revisionId))).toMatchObject({ approvedBaseCents: 15000 });
  });

  it("adopts a walkthrough budget as manual without stacking on reapplication", async () => {
    const s = await setup();
    const { proposalId, revisionId, appliedAt, ovenLine, applyArgs } = await approveAndApply(s, "one_time");
    const manualAt = await s.t.mutation(proposals.updateProposal, {
      ...s.owner, proposalId, title: "Offer", clientName: "Client",
      oneTimePriceCents: 15000, monthlyPriceCents: 12000,
      expectedProposalRevision: appliedAt, confirmedEstimateRevisionId: revisionId,
    });
    const manual = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    expect(manual.appliedEstimateRevisionId).toBeUndefined();
    expect(manual).toMatchObject({ oneTimePriceCents: 15000, monthlyPriceCents: 12000 });
    await s.t.mutation(estimates.applyToProposal, { ...applyArgs, expectedProposalRevision: manualAt });
    const applied = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    expect(applied).toMatchObject({ oneTimePriceCents: 15000, appliedEstimateRevisionId: revisionId });
    expect(applied.monthlyPriceCents).toBeUndefined();
    expect(applied.addOnLineItems?.map(line => line.lineItemId)).toEqual([ovenLine]);
  });

  it("validates whole cents, base minimums and explicit overrides", () => {
    const input = { strategy: "flat", cadence: "monthly", baseCents: 100, minimumCents: 200 } as const;
    expect(calculateEstimate(input, []).approved.monthlyTotalCents).toBe(200);
    expect(() => calculateEstimate(input, [], { baseCents: 100, reason: " " })).toThrow("requires a reason");
    expect(() => calculateEstimate({ ...input, baseCents: 1.1 }, [])).toThrow("whole cents");
  });

  it("distinguishes blank and zero and rounds the scaled strategies at the cent", () => {
    const cadence = "one_time" as const;
    const area = { strategy: "square_feet", cadence, areaRateHundredthCents: 100 } as const;
    expect(() => calculateEstimate(area, [])).toThrow("required pricing inputs");
    expect(calculateEstimate({ ...area, areaHundredths: 0 }, []).approvedBaseCents).toBe(0);
    expect(calculateEstimate({ ...area, areaHundredths: 50 }, []).approvedBaseCents).toBe(1);
    expect(calculateEstimate({ strategy: "hourly", cadence, laborMinutes: 360, hourlyRateCents: 4500 }, []).approvedBaseCents).toBe(27000);
    expect(calculateEstimate({ strategy: "hourly", cadence, laborMinutes: 1, hourlyRateCents: 30 }, []).approvedBaseCents).toBe(1);
    expect(calculateEstimate({
      strategy: "rooms", cadence, baseCents: 100, bedrooms: 0, bedroomRateCents: 50, bathHalves: 1, bathroomRateCents: 51,
    }, []).approvedBaseCents).toBe(126);
  });

  it("denies direct browser calls with the preview off or without the required role", async () => {
    const s = await setup();
    const input = { strategy: "flat", cadence: "one_time", baseCents: 15000 } as const;
    const scope = { ...s.owner, clientRequestId: s.clientRequestId };
    const estimateId = await s.t.mutation(estimates.openDraft, { ...scope, input });
    const proposalId = await s.t.mutation(proposals.createProposalFromLead, scope);
    const revisionId = await s.t.mutation(estimates.approve, { ...s.owner, estimateId, expectedDraftRevision: 1 });
    const create = { kind: "create", name: "Homes", defaults: input } as const;
    const checkDenied = async (auth: typeof s.owner, error: string) => {
      await expect(s.t.query(preview.workspace, { ...scope, ...auth })).rejects.toThrow(error);
      await expect(s.t.query(preview.profiles, auth)).rejects.toThrow(error);
      await expect(s.t.mutation(browserEstimates.previewOpen, { ...scope, ...auth, input })).rejects.toThrow(error);
      await expect(s.t.mutation(browserEstimates.previewSave, { ...auth, input, estimateId, expectedDraftRevision: 1 })).rejects.toThrow(error);
      await expect(s.t.mutation(browserEstimates.previewApprove, { ...auth, estimateId, expectedDraftRevision: 1 })).rejects.toThrow(error);
      await expect(s.t.mutation(browserEstimates.previewApply, { ...auth, estimateId, revisionId, proposalId, expectedProposalRevision: 0 })).rejects.toThrow(error);
      await expect(s.t.mutation(profileChanges.previewChange, { ...auth, operation: create })).rejects.toThrow(error);
    };
    expect(await s.t.query(preview.access, s.owner)).toEqual({ sales: false, configuration: false });
    await checkDenied(s.owner, "authoring is disabled");
    vi.stubEnv("SCRUB_SMART_ESTIMATES_PREVIEW_COMPANY_ID", s.companyId);
    const viewer = { userId: s.viewerId, sessionToken: await s.signIn("viewer@test.dev") };
    expect(await s.t.query(preview.access, viewer)).toEqual({ sales: false, configuration: false });
    await checkDenied(viewer, "permission required");
    await expect(s.t.query(preview.workspace, { ...scope, clientRequestId: s.foreignRequestId })).rejects.toThrow("Access denied");
    await expect(s.t.mutation(browserEstimates.previewOpen, { ...scope, clientRequestId: s.foreignRequestId, input })).rejects.toThrow("Access denied");
  });

  it("releases both authoring surfaces together without changing tenant or issued-offer access", async () => {
    const s = await setup();
    const hash = await hashPassword(password);
    const { foreignCompany, foreignOwner, configurationManager, legacyRequestId } = await s.t.run(async ctx => {
      const other = (await ctx.db.get(s.foreignRequestId))!;
      await ctx.db.patch(other.companyId, { subscriptionStatus: "trialing" });
      const foreignOwner = await ctx.db.insert("users", {
        companyId: other.companyId, role: "owner", status: "active", name: "Other owner", email: "other-owner@test.dev", passwordHash: hash,
      });
      const configurationManager = await ctx.db.insert("users", {
        companyId: s.companyId, role: "manager", status: "active", name: "Configuration", email: "config@test.dev",
        passwordHash: hash, canManageBusinessConfiguration: true,
      });
      const legacyRequestId = await ctx.db.insert("clientRequests", {
        companyId: s.companyId, status: "new", requesterName: "Legacy client", requesterEmail: "legacy@test.dev",
        propertySnapshot: {}, source: "manual", leadType: "residential", createdAt: 1,
      });
      return { foreignCompany: other.companyId, foreignOwner, configurationManager, legacyRequestId };
    });
    const other = { userId: foreignOwner, sessionToken: await s.signIn("other-owner@test.dev") };
    const configuration = { userId: configurationManager, sessionToken: await s.signIn("config@test.dev") };
    const sales = { userId: s.salesId, sessionToken: await s.signIn("sales@test.dev") };
    const ids = [
      { ...s.owner, clientRequestId: s.clientRequestId },
      { ...other, clientRequestId: s.foreignRequestId },
      { ...s.owner, clientRequestId: legacyRequestId },
    ];
    const [homeProposalId, foreignProposalId, legacyProposalId] = await Promise.all(ids.map(args => s.t.mutation(proposals.createProposalFromLead, args)));
    const input = { strategy: "flat", cadence: "one_time", baseCents: 20000 } as const;
    const profile = { kind: "create", name: "Release profile", defaults: input } as const;
    const edit = { title: "Test offer", clientName: "Client", oneTimePriceCents: 20000, presentation: { locale: "es" as const } };
    const ownerOff = { sales: false, configuration: false };
    const ownerOn = { sales: true, configuration: true };

    // Unset and other truthy spellings do not release authoring.
    expect(await s.t.query(preview.access, s.owner)).toEqual(ownerOff);
    vi.stubEnv("SCRUB_SMART_ESTIMATES_RELEASE_ENABLED", "1");
    await expect(s.t.mutation(browserEstimates.previewOpen, { ...ids[0], input })).rejects.toThrow("authoring is disabled");
    await expect(s.t.mutation(proposals.updateProposal, { ...s.owner, proposalId: homeProposalId, ...edit })).rejects.toThrow("authoring is disabled");
    const { presentation: _presentation, ...legacyEdit } = edit;
    await s.t.mutation(proposals.updateProposal, { ...s.owner, proposalId: legacyProposalId, ...legacyEdit });
    await s.t.action(api.proposalDeliveryActions.sendProposal, { ...s.owner, proposalId: legacyProposalId });
    const { proposalIssueToken } = await import("../tokens");
    const tokenFor = async (proposalId: typeof homeProposalId) => {
      const issue = await s.t.run(async ctx => ctx.db.get((await ctx.db.get(proposalId))!.currentIssueId!));
      return proposalIssueToken(issue!.tokenNonce!);
    };
    const legacyToken = await tokenFor(legacyProposalId);
    const legacyBefore = await s.t.action(api.proposalDeliveryActions.getProposalByToken, { token: legacyToken });
    expect(legacyBefore?.presentation).toBeUndefined();

    vi.stubEnv("SCRUB_SMART_ESTIMATES_PREVIEW_COMPANY_ID", s.companyId);
    vi.stubEnv("SCRUB_BRANDED_PROPOSAL_PREVIEW_COMPANY_ID", s.companyId);
    expect(await s.t.query(preview.access, s.owner)).toEqual(ownerOn);
    expect(await s.t.query(preview.access, other)).toEqual(ownerOff);
    expect((await s.t.query(api.queries.proposals.getProposalByClientRequest, ids[0]))?.brandedAuthoringEnabled).toBe(true);
    expect((await s.t.query(api.queries.proposals.getProposalByClientRequest, ids[1]))?.brandedAuthoringEnabled).toBe(false);
    await expect(s.t.mutation(profileChanges.previewChange, { ...other, operation: profile })).rejects.toThrow("authoring is disabled");
    await expect(s.t.mutation(proposals.updateProposal, { ...other, proposalId: foreignProposalId, ...edit })).rejects.toThrow("authoring is disabled");

    vi.stubEnv("SCRUB_SMART_ESTIMATES_RELEASE_ENABLED", "true");
    expect(await s.t.query(preview.access, other)).toEqual(ownerOn);
    expect(await s.t.query(preview.access, configuration)).toEqual({ sales: false, configuration: true });
    expect(await s.t.query(preview.access, sales)).toEqual({ sales: true, configuration: false });
    await s.t.mutation(profileChanges.previewChange, { ...configuration, operation: profile });
    await expect(s.t.mutation(profileChanges.previewChange, { ...sales, operation: profile })).rejects.toThrow("permission required");
    await expect(s.t.mutation(browserEstimates.previewOpen, { ...configuration, clientRequestId: s.clientRequestId, input })).rejects.toThrow("permission required");
    await s.t.mutation(browserEstimates.previewOpen, { ...sales, clientRequestId: s.clientRequestId, input });
    await s.t.mutation(browserEstimates.previewOpen, { ...ids[1], input });
    const [ownedProfile] = await s.t.query(preview.profiles, sales);
    await expect(s.t.mutation(profileChanges.previewChange, { ...other, operation: {
      kind: "archive", profileId: ownedProfile.profileId, expectedRevisionId: ownedProfile.revisionId,
    } })).rejects.toThrow("unavailable");
    await expect(s.t.query(preview.workspace, { ...sales, clientRequestId: s.foreignRequestId })).rejects.toThrow("Access denied");
    await expect(s.t.mutation(proposals.updateProposal, { ...s.owner, proposalId: foreignProposalId, ...edit })).rejects.toThrow("Access denied");
    await expect(s.t.mutation(proposals.updateProposal, { ...configuration, proposalId: homeProposalId, ...edit })).rejects.toThrow("canManageSalesAndCommercial");
    await s.t.mutation(proposals.updateProposal, { ...other, proposalId: foreignProposalId, ...edit });
    await s.t.mutation(proposals.updateProposal, { ...sales, proposalId: homeProposalId, ...edit });
    await s.t.action(api.proposalDeliveryActions.sendProposal, { ...sales, proposalId: homeProposalId });
    const token = await tokenFor(homeProposalId);
    const offer = await s.t.action(api.proposalDeliveryActions.getProposalByToken, { token });
    expect(offer).toMatchObject({ presentation: { locale: "es" }, proposal: { status: "sent", oneTimePriceCents: 20000 } });
    await s.t.run(ctx => ctx.db.patch(foreignCompany, { subscriptionStatus: "canceled" }));
    expect(await s.t.query(preview.access, other)).toEqual(ownerOff);
    await expect(s.t.mutation(proposals.updateProposal, { ...other, proposalId: foreignProposalId, ...edit })).rejects.toThrow("authoring is disabled");

    vi.stubEnv("SCRUB_SMART_ESTIMATES_RELEASE_ENABLED", "false");
    vi.stubEnv("SCRUB_SMART_ESTIMATES_PREVIEW_COMPANY_ID", undefined);
    vi.stubEnv("SCRUB_BRANDED_PROPOSAL_PREVIEW_COMPANY_ID", undefined);
    expect(await s.t.query(preview.access, sales)).toEqual(ownerOff);
    expect(await s.t.action(api.proposalDeliveryActions.getProposalByToken, { token })).toEqual(offer);
    expect(await s.t.action(api.proposalDeliveryActions.getProposalByToken, { token: legacyToken })).toEqual(legacyBefore);
    const accepted = await s.t.action(api.proposalDeliveryActions.respondToProposal, { token, decision: "accepted" });
    expect(accepted).toMatchObject({ presentation: { locale: "es" }, proposal: { status: "accepted", oneTimePriceCents: 20000 } });
  });

  it("resumes a pre-proposal estimate, preserves archived profile revisions and rejects stale pricing", async () => {
    const s = await setup();
    vi.stubEnv("SCRUB_SMART_ESTIMATES_PREVIEW_COMPANY_ID", s.companyId);
    const sales = { userId: s.salesId, sessionToken: await s.signIn("sales@test.dev") };
    expect(await s.t.query(preview.access, sales)).toEqual({ sales: true, configuration: false });
    const defaults = { strategy: "square_feet", cadence: "one_time", areaRateHundredthCents: 2500 } as const;
    const create = { kind: "create", name: "Standard", defaults } as const;
    await expect(s.t.mutation(profileChanges.previewChange, { ...sales, operation: create })).rejects.toThrow("permission required");
    const profileId = await s.t.mutation(profileChanges.previewChange, { ...s.owner, operation: create });
    const [profile] = await s.t.query(preview.profiles, sales);
    const scope = { ...sales, clientRequestId: s.clientRequestId };
    const estimateId = await s.t.mutation(browserEstimates.previewOpen, { ...scope, input: profile.defaults, profileRevisionId: profile.revisionId });
    await expect(s.t.mutation(browserEstimates.previewApprove, { ...sales, estimateId, expectedDraftRevision: 1 })).rejects.toThrow("required pricing");
    expect((await s.t.query(preview.workspace, scope)).draft?.input).toEqual(defaults);
    await s.t.mutation(profileChanges.previewChange, { ...s.owner, operation: {
      kind: "edit", profileId, expectedRevisionId: profile.revisionId, name: "Higher rate", defaults: { ...defaults, areaRateHundredthCents: 5000 },
    } });
    const [edited] = await s.t.query(preview.profiles, sales);
    await s.t.mutation(profileChanges.previewChange, { ...s.owner, operation: {
      kind: "duplicate", profileId, expectedRevisionId: edited.revisionId, name: "Copy",
    } });
    await s.t.mutation(profileChanges.previewChange, { ...s.owner, operation: {
      kind: "archive", profileId, expectedRevisionId: edited.revisionId,
    } });
    expect((await s.t.query(preview.profiles, sales)).map(item => item.name)).toEqual(["Copy"]);
    const draft = (await s.t.query(preview.workspace, scope)).draft!;
    expect(draft).toMatchObject({ input: defaults, profileName: "Standard", profileRevisionId: profile.revisionId });
    await s.t.mutation(browserEstimates.previewSave, { ...sales, estimateId, expectedDraftRevision: 1,
      input: { ...draft.input, areaHundredths: 60_000 }, profileRevisionId: profile.revisionId });
    const revisionId = await s.t.mutation(browserEstimates.previewApprove, { ...sales, estimateId, expectedDraftRevision: 2 });
    const proposalId = await s.t.mutation(proposals.createProposalFromLead, scope);
    const before = (await s.t.query(preview.workspace, scope)).proposal!;
    await s.t.mutation(browserEstimates.previewSave, { ...sales, estimateId, expectedDraftRevision: 2,
      input: { strategy: "hourly", cadence: "one_time", hourlyRateCents: 3500, laborMinutes: 360, areaHundredths: 60_000 },
      profileRevisionId: profile.revisionId });
    expect((await s.t.query(preview.workspace, scope)).approval?.stale).toBe(true);
    await expect(s.t.mutation(browserEstimates.previewApply, {
      ...sales, estimateId, revisionId, proposalId, expectedProposalRevision: before.updatedAt,
    })).rejects.toThrow("approval is stale");
    expect((await s.t.query(preview.workspace, scope)).proposal).toEqual(before);
    expect(await s.t.run(ctx => ctx.db.get(revisionId))).toMatchObject({ recommendedBaseCents: 15000, profileRevisionId: profile.revisionId,
      input: { ...defaults, areaHundredths: 60000 } });
    const currentApproval = await s.t.mutation(browserEstimates.previewApprove, {
      ...sales, estimateId, expectedDraftRevision: 3, proposal: { proposalId, expectedProposalRevision: before.updatedAt },
    });
    await s.t.mutation(browserEstimates.previewApply, { ...sales, estimateId, revisionId: currentApproval,
      proposalId, expectedProposalRevision: before.updatedAt });
    await s.t.action(api.proposalDeliveryActions.sendProposal, { ...s.owner, proposalId });
    const issue = await s.t.run(async ctx => ctx.db.get((await ctx.db.get(proposalId))!.currentIssueId!));
    const { proposalIssueToken } = await import("../tokens");
    const offer = await s.t.action(api.proposalDeliveryActions.getProposalByToken, { token: await proposalIssueToken(issue!.tokenNonce!) });
    expect(offer?.proposal.oneTimePriceCents).toBe(21000);
    for (const payload of [offer, vi.mocked(fetch).mock.calls]) {
      expect(JSON.stringify(payload)).not.toMatch(/profileRevisionId|laborMinutes|hourlyRateCents|approvedByUserId|appliedEstimateRevisionId/);
    }
  });

  it("explicitly switches an archived walkthrough, preserving inputs and requiring approval for the replacement proposal", async () => {
    const s = await setup();
    const schedule = { ...s.owner, clientRequestId: s.clientRequestId, scheduledDate: "2030-01-10", scheduledStartTime: "09:00" };
    const walk = api.mutations.walkthroughs;
    const a = await s.t.mutation(walk.createFromClientRequest, schedule);
    await s.t.run(ctx => ctx.db.patch(a, { title: "Walkthrough A", squareFootage: 500 }));
    const input = { strategy: "square_feet", cadence: "one_time", areaHundredths: 60_000, areaRateHundredthCents: 2500 } as const;
    const estimateId = await s.t.mutation(estimates.openDraft, { ...s.owner, clientRequestId: s.clientRequestId, walkthroughId: a, input });
    const oldRevision = await s.t.mutation(estimates.approve, { ...s.owner, estimateId, expectedDraftRevision: 1 });
    const oldSnapshot = await s.t.run(ctx => ctx.db.get(oldRevision));
    await s.t.mutation(walk.archive, { ...s.owner, walkthroughId: a });
    const b = await s.t.mutation(walk.createFromClientRequest, { ...schedule, scheduledDate: "2030-01-11" });
    expect(b).not.toBe(a);
    await s.t.run(ctx => ctx.db.patch(b, { title: "Walkthrough B", squareFootage: 900, bedrooms: 2, bathrooms: 1.5 }));
    const replace = { ...s.owner, estimateId, expectedDraftRevision: 1, replacementId: b };
    await expect(s.t.mutation(browserEstimates.previewReplaceWalkthrough, replace)).rejects.toThrow("authoring is disabled");
    vi.stubEnv("SCRUB_SMART_ESTIMATES_PREVIEW_COMPANY_ID", s.companyId);
    const scope = { ...s.owner, clientRequestId: s.clientRequestId, walkthroughId: b };
    expect(await s.t.query(preview.workspace, scope)).toMatchObject({
      draft: { walkthroughId: a, input }, replacement: { id: b, title: "Walkthrough B" }, walkthroughArchived: true,
      approval: { id: oldRevision, stale: true },
      facts: { areaHundredths: { value: 90_000, source: "walkthrough" }, bathHalves: { value: 3 } },
    });
    const foreign = await s.t.run(async ctx => {
      const request = (await ctx.db.get(s.foreignRequestId))!;
      return ctx.db.insert("walkthroughs", {
        companyId: request.companyId, clientRequestId: request._id, title: "Foreign", walkthroughType: "residential",
        status: "draft", rooms: [], photos: [], createdAt: 1, updatedAt: 1,
      });
    });
    await expect(s.t.mutation(browserEstimates.previewReplaceWalkthrough, { ...replace, replacementId: foreign })).rejects.toThrow("must match the estimate request");
    const wrongProperty = await s.t.run(ctx => ctx.db.insert("properties", {
      companyId: s.companyId, name: "Other property", address: "99 Example", type: "residential", amenities: [], active: true,
    }));
    await s.t.run(ctx => ctx.db.patch(b, { propertyId: wrongProperty }));
    await expect(s.t.mutation(browserEstimates.previewReplaceWalkthrough, replace)).rejects.toThrow("Walkthrough property must match the request");
    await s.t.run(ctx => ctx.db.patch(b, { propertyId: s.propertyId }));
    await expect(s.t.mutation(browserEstimates.previewReplaceWalkthrough, { ...replace, expectedDraftRevision: 0 })).rejects.toThrow("draft changed");
    const viewer = { userId: s.viewerId, sessionToken: await s.signIn("viewer@test.dev") };
    await expect(s.t.mutation(browserEstimates.previewReplaceWalkthrough, { ...replace, ...viewer })).rejects.toThrow("permission required");
    expect(await s.t.mutation(browserEstimates.previewReplaceWalkthrough, replace)).toBe(2);
    expect(await s.t.query(preview.workspace, scope)).toMatchObject({
      draft: { walkthroughId: b, input, draftRevision: 2 }, replacement: null, approval: { id: oldRevision, stale: true },
    });
    await s.t.mutation(walk.complete, { ...s.owner, walkthroughId: b });
    const proposalId = await s.t.mutation(proposals.createProposalFromLead, { ...s.owner, clientRequestId: s.clientRequestId, sourceWalkthroughId: b });
    const before = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    const target = { ...s.owner, estimateId, proposalId, expectedProposalRevision: before.updatedAt };
    await expect(s.t.mutation(browserEstimates.previewApply, { ...target, revisionId: oldRevision })).rejects.toThrow("Estimate context changed");
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toEqual(before);
    const revisionId = await s.t.mutation(browserEstimates.previewApprove, {
      ...s.owner, estimateId, expectedDraftRevision: 2, proposal: { proposalId, expectedProposalRevision: before.updatedAt },
    });
    await s.t.mutation(browserEstimates.previewApply, { ...target, revisionId });
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toMatchObject({ sourceWalkthroughId: b, oneTimePriceCents: 15000, appliedEstimateRevisionId: revisionId });
    expect(await s.t.run(ctx => ctx.db.get(oldRevision))).toEqual(oldSnapshot);

    await s.t.mutation(proposals.markProposalSent, { ...s.owner, proposalId });
    const issued = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    const issue = await s.t.run(ctx => ctx.db.get(issued.currentIssueId!));
    await s.t.mutation(walk.archive, { ...s.owner, walkthroughId: b });
    const c = await s.t.mutation(walk.createFromClientRequest, { ...schedule, scheduledDate: "2030-01-12" });
    await s.t.mutation(browserEstimates.previewReplaceWalkthrough, { ...replace, expectedDraftRevision: 2, replacementId: c });
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toEqual(issued);
    expect(await s.t.run(ctx => ctx.db.get(issued.currentIssueId!))).toEqual(issue);
  });

  it("keeps an unclassified move-out draft calculable and blocks application until a supported property is linked", async () => {
    const s = await setup();
    vi.stubEnv("SCRUB_SMART_ESTIMATES_PREVIEW_COMPANY_ID", s.companyId);
    await s.t.run(ctx => ctx.db.patch(s.clientRequestId, { leadType: "move_out", propertyId: undefined }));
    const scope = { ...s.owner, clientRequestId: s.clientRequestId };
    const proposalId = await s.t.mutation(proposals.createProposalFromLead, scope);
    const input = { strategy: "flat", cadence: "one_time", baseCents: 12500 } as const;
    const estimateId = await s.t.mutation(browserEstimates.previewOpen, { ...scope, input });
    await s.t.mutation(browserEstimates.previewSave, { ...s.owner, estimateId, expectedDraftRevision: 1, input });
    const before = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    const target = { ...s.owner, estimateId, proposalId, expectedProposalRevision: before.updatedAt };
    const approve = (expectedDraftRevision: number) => s.t.mutation(browserEstimates.previewApprove, {
      ...s.owner, estimateId, expectedDraftRevision, proposal: { proposalId, expectedProposalRevision: before.updatedAt },
    });
    const initialRevision = await approve(2);
    expect(await s.t.query(preview.workspace, scope)).toMatchObject({ propertyType: null, draft: { input } });
    expect(calculateEstimate(input, []).approved.oneTimeTotalCents).toBe(12500);
    await expect(s.t.mutation(browserEstimates.previewApply, { ...target, revisionId: initialRevision })).rejects.toThrow("Resolve the Smart Estimate billing destination");
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toEqual(before);
    await s.t.run(ctx => ctx.db.patch(s.clientRequestId, { propertyId: s.propertyId }));
    expect(await s.t.query(preview.workspace, scope)).toMatchObject({ propertyType: "residential", propertyChanged: true, approval: { stale: true } });
    await s.t.mutation(browserEstimates.previewSave, { ...s.owner, estimateId, expectedDraftRevision: 2, input });
    const revisionId = await approve(3);
    await s.t.mutation(browserEstimates.previewApply, { ...target, revisionId });
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toMatchObject({ oneTimePriceCents: 12500, appliedEstimateRevisionId: revisionId });
  });

  it.each(["residential", "vacation_rental"] as const)("preserves the %s one-time price and catalog line through issue, acceptance, job and invoice", async (type) => {
    const s = await setup(type);
    vi.stubEnv("SCRUB_BRANDED_PROPOSAL_PREVIEW_COMPANY_ID", s.companyId);
    const { proposalId, revisionId, ovenLine } = await approveAndApply(s, "one_time");
    await s.t.action(api.proposalDeliveryActions.sendProposal, { ...s.owner, proposalId });
    const issue = await s.t.run(async ctx => ctx.db.get((await ctx.db.get(proposalId))!.currentIssueId!));
    expect(issue?.appliedEstimateRevisionId).toBe(revisionId);
    const { proposalIssueToken } = await import("../tokens");
    const token = await proposalIssueToken(issue!.tokenNonce!);
    const publicOffer = await s.t.action(api.proposalDeliveryActions.getProposalByToken, { token });
    expect(publicOffer?.presentation).toEqual({ locale: "en" });
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
    vi.stubEnv("SCRUB_BRANDED_PROPOSAL_PREVIEW_COMPANY_ID", s.companyId);
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
    const before = (await s.t.run(ctx => ctx.db.get(proposalId)))!;
    const manual = {
      ...s.owner, proposalId, title: "Manual edit", clientName: "Client", oneTimePriceCents: 9500,
    };
    await expect(s.t.mutation(proposals.updateProposal, manual)).rejects.toThrow("Confirm switching");
    expect(await s.t.run(ctx => ctx.db.get(proposalId))).toEqual(before);
    const newRevision = await s.t.mutation(proposals.updateProposal, {
      ...manual, expectedProposalRevision: before.updatedAt, confirmedEstimateRevisionId: revisionId,
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
    const { estimateId, proposalId, applyArgs, ovenLine, revisionId: appliedRevisionId, appliedAt } = await approveAndApply(s, "one_time");
    const removal = { ...s.owner, proposalId, lineItemId: ovenLine };
    await expect(s.t.mutation(proposals.removeAddOnLine, removal)).rejects.toThrow("Confirm switching");
    await s.t.mutation(proposals.removeAddOnLine, {
      ...removal, expectedProposalRevision: appliedAt, confirmedEstimateRevisionId: appliedRevisionId,
    });
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
