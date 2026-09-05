import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertQaFixtureEnvironment, QA_COMPANY_NAME, QA_FIXTURE_KEY, QA_PERSONAS } from "./lib/qaFixture";

const hashesValidator = v.object({ owner: v.string(), manager: v.string(), worker: v.string(), worker2: v.string(), client: v.string(), proposalTokenHash: v.string() });
const fail = (message: string): never => { throw new Error(`QA fixture refused: ${message}`); };
const isoDay = (now: number, offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10);

async function findFixtureCompanies(ctx: any) {
  return ctx.db.query("companies").withIndex("by_qaFixtureKey", (q: any) => q.eq("qaFixtureKey", QA_FIXTURE_KEY)).collect();
}

async function expectedPersonas(ctx: any, companyId?: any, allowLegacyFixture = false) {
  const staff: { owner: any; manager: any; worker: any; worker2: any } = { owner: null, manager: null, worker: null, worker2: null };
  for (const key of ["owner", "manager", "worker", "worker2"] as const) {
    staff[key] = await ctx.db.query("users").withIndex("by_email", (q: any) => q.eq("email", QA_PERSONAS[key].email)).unique();
  }
  const client = await ctx.db.query("clientUsers").withIndex("by_email", (q: any) => q.eq("email", QA_PERSONAS.client.email)).unique();
  if (companyId) {
    for (const key of ["owner", "manager", "worker", "worker2"] as const) {
      const user = staff[key];
      if (key === "worker2" && allowLegacyFixture && !user) continue;
      if (!user || user.companyId !== companyId || user.name !== QA_PERSONAS[key].name || user.role !== QA_PERSONAS[key].role) {
        fail(`${key} persona identity is missing or inconsistent`);
      }
    }
    if (!client || client.displayName !== QA_PERSONAS.client.name || client.status !== "active") fail("client persona identity is missing or inconsistent");
    const relationships = await ctx.db.query("clientRelationships").withIndex("by_clientUserId", (q: any) => q.eq("clientUserId", client._id)).collect();
    if (relationships.length !== 1 || relationships[0].companyId !== companyId || relationships[0].displayName !== "Harborlight Stays") {
      fail("client persona relationship is missing, foreign, or inconsistent");
    }
  }
  return { ...staff, client };
}

async function fixtureState(ctx: any, allowLegacyFixture = false) {
  const companies = await findFixtureCompanies(ctx);
  if (companies.length > 1) fail("more than one company has the reserved fixture marker");
  const company = companies[0] ?? null;
  const personas = await expectedPersonas(ctx, company?._id, allowLegacyFixture);
  if (!company) {
    if (personas.owner || personas.manager || personas.worker || personas.worker2 || personas.client) fail("reserved persona email exists without the fixture company");
    return { company: null, personas };
  }
  if (company.name !== QA_COMPANY_NAME || company.qaFixtureKey !== QA_FIXTURE_KEY) fail("fixture company identity is inconsistent");
  return { company, personas };
}

export const status = internalQuery({ args: {}, handler: async (ctx) => {
  assertQaFixtureEnvironment();
  const state = await fixtureState(ctx, true);
  return state.company ? {
    exists: true, fixtureKey: QA_FIXTURE_KEY, companyId: state.company._id,
    personaIds: { owner: state.personas.owner._id, manager: state.personas.manager._id, worker: state.personas.worker._id, worker2: state.personas.worker2?._id, client: state.personas.client._id },
  } : { exists: false, fixtureKey: QA_FIXTURE_KEY };
} });

export const seed = internalMutation({ args: { passwordHashes: hashesValidator }, handler: async (ctx, args) => {
  assertQaFixtureEnvironment();
  const existing = await fixtureState(ctx);
  if (existing.company) return {
    created: false, fixtureKey: QA_FIXTURE_KEY, companyId: existing.company._id,
    personaIds: { owner: existing.personas.owner._id, manager: existing.personas.manager._id, worker: existing.personas.worker._id, worker2: existing.personas.worker2._id, client: existing.personas.client._id },
  };

  const now = Date.now();
  const companyId = await ctx.db.insert("companies", {
    qaFixtureKey: QA_FIXTURE_KEY, name: QA_COMPANY_NAME, timezone: "America/New_York", tier: "scrub_pro",
    subscriptionStatus: "active", currentPeriodEnd: now + 180 * 86_400_000, cancelAtPeriodEnd: false,
    companyDisplayName: "Bright Harbor Cleaning Co.", contactEmail: "hello@brightharbor.example.test",
    contactPhone: "+1 555 010 2400", serviceAreaText: "Port Aurora and the neighboring coast",
  });
  const ownerId = await ctx.db.insert("users", { email: QA_PERSONAS.owner.email, passwordHash: args.passwordHashes.owner, name: QA_PERSONAS.owner.name, companyId, role: "owner", status: "active" });
  const managerId = await ctx.db.insert("users", {
    email: QA_PERSONAS.manager.email, passwordHash: args.passwordHashes.manager, name: QA_PERSONAS.manager.name, companyId, role: "manager", status: "active",
    canSeeAllJobs: true, canCreateJobs: true, canAssignCleaners: true, canRequestRework: true, canApproveForms: true,
    canManageSchedule: true, canResolveRedFlags: true, canManageClients: true, canManageSalesAndCommercial: true,
    canManageBusinessConfiguration: false, canManageTeam: false, canViewFinancials: false, canManageInvoices: false,
    canManageDocuments: true, canViewAnalytics: true,
  });
  const workerId = await ctx.db.insert("users", { email: QA_PERSONAS.worker.email, passwordHash: args.passwordHashes.worker, name: QA_PERSONAS.worker.name, companyId, role: "cleaner", status: "active", phone: "+1 555 010 2403" });
  const worker2Id = await ctx.db.insert("users", { email: QA_PERSONAS.worker2.email, passwordHash: args.passwordHashes.worker2, name: QA_PERSONAS.worker2.name, companyId, role: "cleaner", status: "active", phone: "+1 555 010 2405" });
  const clientId = await ctx.db.insert("clientUsers", { email: QA_PERSONAS.client.email, passwordHash: args.passwordHashes.client, displayName: QA_PERSONAS.client.name, phone: "+1 555 010 2404", language: "en", status: "active", createdAt: now, updatedAt: now });
  await ctx.db.patch(companyId, { defaultManagerId: managerId });
  await ctx.db.insert("companySettings", { companyId, companyName: "Bright Harbor Cleaning Co.", phone: "+1 555 010 2400", email: "hello@brightharbor.example.test", website: "https://brightharbor.example.test", address: "24 Beacon Walk, Port Aurora, ME 04000", primaryColor: "#164E63", secondaryColor: "#F0FDFA", accentColor: "#F59E0B", emailSignature: "Bright Harbor Operations", defaultCurrency: "USD", requirePropertyConditionChecksByDefault: true, createdAt: now, updatedAt: now });

  const harborlightId = await ctx.db.insert("clientRelationships", { companyId, clientUserId: clientId, displayName: "Harborlight Stays", clientType: "property_manager", businessName: "Harborlight Stays", primaryContactName: QA_PERSONAS.client.name, email: QA_PERSONAS.client.email, phone: "+1 555 010 2404", notes: "Manages three coastal short-term rentals; prefers a text update after turnovers.", status: "active", createdAt: now, updatedAt: now });
  const averyId = await ctx.db.insert("clientRelationships", { companyId, displayName: "Avery Household", clientType: "residential", primaryContactName: "Sam Avery", email: "sam.avery@example.test", notes: "Biweekly residential client; fragrance-free products only.", status: "active", createdAt: now, updatedAt: now });
  const lighthouseId = await ctx.db.insert("clientRelationships", { companyId, displayName: "Port Aurora Lighthouse Museum", clientType: "commercial", businessName: "Port Aurora Lighthouse Museum", primaryContactName: "Theo Marsh", email: "facilities@lighthouse.example.test", status: "active", createdAt: now, updatedAt: now });

  const workerProfileId = await ctx.db.insert("workerProfiles", { companyId, userId: workerId, workerType: "contractor_1099", workerStatus: "active", primaryRole: "cleaner", eligibleRoles: ["cleaner", "team_lead"], onboardingStatus: "complete", jobEligibilityStatus: "eligible", payProfile: { payType: "per_job", defaultRateCents: 7200, currency: "USD", stripeConnectEnabled: false, outsideAppPaymentNotes: "QA fixture: paid outside app; no transfer is created.", taxDocsHandledOffPlatform: true }, createdAt: now, updatedAt: now });
  const worker2ProfileId = await ctx.db.insert("workerProfiles", { companyId, userId: worker2Id, workerType: "w2_employee", workerStatus: "active", primaryRole: "cleaner", eligibleRoles: ["cleaner"], onboardingStatus: "complete", jobEligibilityStatus: "eligible", payProfile: { payType: "hourly", defaultRateCents: 2200, currency: "USD", stripeConnectEnabled: false, outsideAppPaymentNotes: "QA fixture: payroll is handled outside SCRUB.", taxDocsHandledOffPlatform: true }, manualComplianceNotes: "Minimal reassignment-test worker profile.", createdAt: now, updatedAt: now });
  for (const [itemKey, title] of [["safety", "Safety orientation"], ["turnover", "Turnover standards"], ["access", "Property access protocol"]]) await ctx.db.insert("workerOnboardingItems", { companyId, workerProfileId, userId: workerId, itemKey, title, status: "complete", required: true, completedAt: now - 30 * 86_400_000, completedByUserId: ownerId, createdAt: now - 35 * 86_400_000, updatedAt: now - 30 * 86_400_000 });
  await ctx.db.insert("workerDocuments", { companyId, workerProfileId, userId: workerId, documentType: "contractor_agreement", status: "reviewed", required: true, handledOffPlatform: true, reviewedAt: now - 30 * 86_400_000, reviewedByUserId: ownerId, notes: "Fictional QA record; no uploaded document.", createdAt: now - 35 * 86_400_000, updatedAt: now - 30 * 86_400_000 });
  await ctx.db.insert("workerOnboardingItems", { companyId, workerProfileId: worker2ProfileId, userId: worker2Id, itemKey: "safety", title: "Safety orientation", status: "complete", required: true, completedAt: now - 14 * 86_400_000, completedByUserId: managerId, notes: "Minimal QA onboarding record.", createdAt: now - 16 * 86_400_000, updatedAt: now - 14 * 86_400_000 });
  for (const dayOfWeek of [1, 2, 3, 4, 5]) await ctx.db.insert("cleanerAvailability", { cleanerId: workerId, dayOfWeek, startMinutes: 480, endMinutes: 1020, enabled: true });
  for (const dayOfWeek of [2, 3, 4, 5, 6]) await ctx.db.insert("cleanerAvailability", { cleanerId: worker2Id, dayOfWeek, startMinutes: 600, endMinutes: 1080, enabled: true });

  const teamId = await ctx.db.insert("teams", { companyId, name: "Harbor Turnover Crew", description: "Primary STR and residential crew", active: true, createdBy: ownerId, createdAt: now, updatedAt: now });
  await ctx.db.insert("teamMembers", { teamId, companyId, userId: managerId, role: "lead", active: true, addedAt: now });
  await ctx.db.insert("teamMembers", { teamId, companyId, userId: workerId, role: "member", active: true, addedAt: now });
  const inventoryTemplateId = await ctx.db.insert("inventoryTemplates", { companyId, name: "Coastal turnover essentials", isDefault: true, items: [{ name: "Bath towels", category: "Linens", parLevel: 8, required: true }, { name: "Paper towels", category: "Guest supplies", parLevel: 3, required: true }, { name: "Dishwasher pods", category: "Guest supplies", parLevel: 12, required: true }], createdAt: now });
  const p1 = await ctx.db.insert("properties", { companyId, clientRelationshipId: harborlightId, name: "Seabreeze Cottage", type: "vacation_rental", address: "18 Tidal Lane, Port Aurora, ME 04000", accessInstructions: "QA code 2408; lockbox beside blue side door.", amenities: ["Ocean view", "Laundry", "Hot tub"], beds: 4, baths: 2, towelCount: 10, sheetSets: 6, pillowCount: 8, active: true, inventoryTemplateId, propertyConditionCheckOverride: "required" });
  const p2 = await ctx.db.insert("properties", { companyId, clientRelationshipId: harborlightId, name: "Pelican Loft", type: "vacation_rental", address: "72 Wharf Street Unit 3, Port Aurora, ME 04000", accessInstructions: "Keypad; fictional QA access only.", amenities: ["Harbor view", "Elevator"], beds: 2, baths: 1, active: true, inventoryTemplateId });
  const p3 = await ctx.db.insert("properties", { companyId, clientRelationshipId: averyId, name: "Avery Home", type: "residential", address: "9 Juniper Way, Port Aurora, ME 04000", accessInstructions: "Client will be home; use fragrance-free products.", amenities: ["Finished basement", "Dog"], beds: 3, baths: 2.5, active: true });
  const p4 = await ctx.db.insert("properties", { companyId, clientRelationshipId: lighthouseId, name: "Lighthouse Museum Offices", type: "commercial", address: "1 Beacon Point, Port Aurora, ME 04000", amenities: ["Public gallery", "Staff offices"], squareFootage: 6400, restroomCount: 3, trashCanCount: 14, active: true });

  const addOnId = await ctx.db.insert("companyAddOns", { companyId, name: "Linen reset", description: "Wash, fold, and stage guest linens", pricingMethod: "flat", priceCents: 4500, isActive: true, isPublic: true, displayOrder: 1, estimatedDurationMinutes: 45, presetKey: "qa-linen-reset", createdByUserId: ownerId, createdAt: now, updatedAt: now });
  const requestId = await ctx.db.insert("clientRequests", { companyId, clientRelationshipId: harborlightId, createdAt: now - 12 * 86_400_000, status: "converted", requesterName: QA_PERSONAS.client.name, requesterEmail: QA_PERSONAS.client.email, propertySnapshot: { name: "Seabreeze Cottage", address: "18 Tidal Lane, Port Aurora, ME 04000" }, requestedDate: isoDay(now, 2), requestedStart: "10:00", timeWindow: "10:00 AM-2:00 PM", notes: "Same-day guest arrival at 4 PM.", requestedService: "Turnover clean", requestedAddOnSnapshots: [{ sourceCompanyAddOnId: addOnId, name: "Linen reset", pricingMethod: "flat", priceCents: 4500, quantity: 1 }], source: "authenticated_client", originClientUserId: clientId, leadType: "str_airbnb", propertyId: p1, leadStage: "converted", createdByUserId: ownerId });
  const residentialRequestId = await ctx.db.insert("clientRequests", { companyId, clientRelationshipId: averyId, createdAt: now - 2 * 86_400_000, status: "new", requesterName: "Sam Avery", requesterEmail: "sam.avery@example.test", propertySnapshot: { name: "Avery Home", address: "9 Juniper Way, Port Aurora, ME 04000", notes: "Fragrance-free products required." }, requestedDate: isoDay(now, 9), timeWindow: "9:00 AM-noon", requestedService: "Seasonal deep clean", source: "manual", leadType: "residential", propertyId: p3, leadStage: "proposal_needed", estimatedContractValueCents: 28500, estimatedFrequency: "one_time", createdByUserId: managerId });
  const schedulingRequestId = await ctx.db.insert("clientRequests", { companyId, clientRelationshipId: harborlightId, createdAt: now - 86_400_000, status: "contacted", contactedAt: now - 43_200_000, requesterName: QA_PERSONAS.client.name, requesterEmail: QA_PERSONAS.client.email, propertySnapshot: { name: "Pelican Loft", address: "72 Wharf Street Unit 3, Port Aurora, ME 04000" }, requestedDate: isoDay(now, 4), timeWindow: "1:00 PM-5:00 PM", requestedService: "Guest turnover", source: "authenticated_client", originClientUserId: clientId, leadType: "str_airbnb", propertyId: p2, leadStage: "contacted", createdByUserId: managerId });
  const agreementRequestId = await ctx.db.insert("clientRequests", { companyId, clientRelationshipId: harborlightId, createdAt: now - 5 * 86_400_000, status: "converted", requesterName: QA_PERSONAS.client.name, requesterEmail: QA_PERSONAS.client.email, propertySnapshot: { name: "Pelican Loft", address: "72 Wharf Street Unit 3, Port Aurora, ME 04000" }, requestedDate: isoDay(now, 12), requestedService: "Monthly deep clean", source: "authenticated_client", originClientUserId: clientId, leadType: "str_airbnb", propertyId: p2, leadStage: "converted", createdByUserId: ownerId });
  await ctx.db.patch(harborlightId, { sourceClientRequestId: requestId });
  const proposalId = await ctx.db.insert("proposals", { companyId, clientRelationshipId: harborlightId, clientRequestId: requestId, createdByUserId: ownerId, title: "Harborlight turnover service", clientName: QA_PERSONAS.client.name, businessName: "Harborlight Stays", propertyAddress: "18 Tidal Lane, Port Aurora, ME 04000", serviceFrequency: "weekly", scopeOfWork: "Guest-ready turnover, kitchen and bath sanitation, linen reset, and supply count.", monthlyPriceCents: 128000, addOnLineItems: [{ lineItemId: "qa-linen", sourceType: "catalog", sourceClientRequestId: requestId, sourceCompanyAddOnId: addOnId, name: "Linen reset", pricingMethod: "flat", unitPriceCents: 4500, quantity: 1, finalizedPriceCents: 4500, billingCadence: "monthly" }], status: "accepted", sentAt: now - 10 * 86_400_000, acceptedAt: now - 9 * 86_400_000, createdAt: now - 11 * 86_400_000, updatedAt: now - 9 * 86_400_000 });
  await ctx.db.insert("proposals", { companyId, clientRelationshipId: averyId, clientRequestId: residentialRequestId, createdByUserId: managerId, title: "Avery seasonal deep clean", clientName: "Sam Avery", propertyAddress: "9 Juniper Way, Port Aurora, ME 04000", serviceFrequency: "one_time", scopeOfWork: "Deep clean of kitchen, bathrooms, living spaces, and finished basement using fragrance-free products.", oneTimePriceCents: 28500, notes: "Public-response QA proposal; no email was sent.", status: "sent", sentAt: now - 43_200_000, proposalTokenHash: args.passwordHashes.proposalTokenHash, proposalTokenCreatedAt: now - 43_200_000, createdAt: now - 86_400_000, updatedAt: now - 43_200_000 });
  const pendingAgreementProposalId = await ctx.db.insert("proposals", { companyId, clientRelationshipId: harborlightId, clientRequestId: agreementRequestId, createdByUserId: ownerId, title: "Pelican Loft monthly deep clean", clientName: QA_PERSONAS.client.name, businessName: "Harborlight Stays", propertyAddress: "72 Wharf Street Unit 3, Port Aurora, ME 04000", serviceFrequency: "monthly", scopeOfWork: "Monthly deep clean of guest and utility areas between regular turnovers.", monthlyPriceCents: 36000, status: "accepted", sentAt: now - 4 * 86_400_000, acceptedAt: now - 3 * 86_400_000, createdAt: now - 5 * 86_400_000, updatedAt: now - 3 * 86_400_000 });
  const templateId = await ctx.db.insert("documentTemplates", { companyId, type: "service_agreement", name: "Bright Harbor recurring service agreement", body: "Fictional QA agreement for {{clientName}}.", isDefault: true, source: "scrub_editor", status: "active", version: 1, createdByUserId: ownerId, createdAt: now, updatedAt: now });
  const agreementId = await ctx.db.insert("serviceAgreements", { companyId, clientRelationshipId: harborlightId, proposalId, clientRequestId: requestId, templateId, title: "Harborlight recurring turnover agreement", status: "signed", agreementType: "commercial_cleaning", clientName: QA_PERSONAS.client.name, propertyAddress: "18 Tidal Lane, Port Aurora, ME 04000", servicesIncluded: "Weekly turnover clean and linen reset", priceSummary: "$1,280/month", billingSchedule: "Monthly, net 15", effectiveStartDate: isoDay(now, -8), renewalDate: isoDay(now, 357), serviceFrequency: "weekly", contractAmountCents: 128000, signerName: QA_PERSONAS.client.name, signedAt: now - 8 * 86_400_000, clientRespondedAt: now - 8 * 86_400_000, createdAt: now - 9 * 86_400_000, updatedAt: now - 8 * 86_400_000 });
  const pendingAgreementId = await ctx.db.insert("serviceAgreements", { companyId, clientRelationshipId: harborlightId, proposalId: pendingAgreementProposalId, clientRequestId: agreementRequestId, templateId, title: "Pelican Loft monthly deep-clean agreement", status: "sent", agreementType: "commercial_cleaning", clientName: QA_PERSONAS.client.name, propertyAddress: "72 Wharf Street Unit 3, Port Aurora, ME 04000", servicesIncluded: "Monthly deep clean between recurring guest turnovers", priceSummary: "$360/month", billingSchedule: "Monthly, net 15", effectiveStartDate: isoDay(now, 12), renewalDate: isoDay(now, 377), serviceFrequency: "monthly", contractAmountCents: 36000, sentAt: now - 2 * 86_400_000, createdAt: now - 3 * 86_400_000, updatedAt: now - 2 * 86_400_000 });
  const accountId = await ctx.db.insert("commercialAccounts", { companyId, clientRelationshipId: harborlightId, sourceLeadId: requestId, clientRequestId: requestId, sourceProposalId: proposalId, serviceAgreementId: agreementId, clientName: "Harborlight Stays", contactName: QA_PERSONAS.client.name, contactEmail: QA_PERSONAS.client.email, serviceAddress: "18 Tidal Lane, Port Aurora, ME 04000", contractAmountCents: 128000, serviceFrequency: "weekly", startDate: isoDay(now, -8), renewalDate: isoDay(now, 357), assignedManagerId: managerId, assignedCleanerId: workerId, assignedTeamId: teamId, status: "active", notes: "Fictional QA commercial account.", createdAt: now - 8 * 86_400_000, updatedAt: now });
  await ctx.db.patch(agreementId, { commercialAccountId: accountId });
  const scheduleId = await ctx.db.insert("commercialSchedules", { companyId, commercialAccountId: accountId, propertyId: p1, title: "Weekly Seabreeze turnover", status: "active", frequency: "weekly", daysOfWeek: [5], startDate: isoDay(now, -8), defaultStartTime: "10:00", defaultDueTime: "14:00", assignedCleanerId: workerId, assignedManagerId: managerId, assignedTeamId: teamId, sourceProposalId: proposalId, createdAt: now - 8 * 86_400_000, updatedAt: now });

  const baseJob = { companyId, cleanerIds: [workerId], durationMinutes: 180, reworkCount: 0, assignedManagerId: managerId, assignedTeamId: teamId, source: "manual" as const };
  const approvedJob = await ctx.db.insert("jobs", { ...baseJob, clientRelationshipId: harborlightId, propertyId: p1, type: "turnover", status: "approved", scheduledDate: isoDay(now, -7), startTime: "10:00", notes: "Completed guest-ready turnover.", arrivedAt: now - 7 * 86_400_000, startedAt: now - 7 * 86_400_000 + 600_000, completedAt: now - 7 * 86_400_000 + 10_800_000, approvedAt: now - 7 * 86_400_000 + 12_000_000, timerStoppedAt: now - 7 * 86_400_000 + 10_800_000, plannedCleanerPayCents: 7200, inspectionCycleOpen: false });
  const submittedJob = await ctx.db.insert("jobs", { ...baseJob, clientRelationshipId: harborlightId, propertyId: p2, type: "turnover", status: "submitted", scheduledDate: isoDay(now, -1), startTime: "11:00", notes: "Awaiting manager review.", arrivedAt: now - 86_400_000, startedAt: now - 85_800_000, completedAt: now - 75_000_000, timerStoppedAt: now - 75_000_000, plannedCleanerPayCents: 6800, inspectionCycleOpen: true });
  const progressJob = await ctx.db.insert("jobs", { ...baseJob, clientRelationshipId: averyId, propertyId: p3, type: "standard", status: "in_progress", scheduledDate: isoDay(now, 0), startTime: "09:00", notes: "Fragrance-free products staged.", arrivedAt: now - 3_600_000, startedAt: now - 3_300_000, plannedCleanerPayCents: 6500, inventoryChecklist: [{ name: "Fragrance-free cleaner", category: "Supplies", parLevel: 2, required: true, status: "ok", reportedQty: 2 }] });
  const scheduledJob = await ctx.db.insert("jobs", { ...baseJob, clientRelationshipId: harborlightId, propertyId: p1, type: "turnover", status: "scheduled", scheduledDate: isoDay(now, 2), startTime: "10:00", notes: "Guest check-in at 4 PM.", sourceProposalId: proposalId, sourceClientRequestId: requestId, commercialAccountId: accountId, commercialScheduleId: scheduleId, generatedFromCommercialSchedule: true, requireConfirmation: true, acceptanceStatus: "pending", plannedCleanerPayCents: 7200 });
  const reworkJob = await ctx.db.insert("jobs", { ...baseJob, clientRelationshipId: harborlightId, propertyId: p2, type: "deep_clean", status: "rework_requested", scheduledDate: isoDay(now, -3), startTime: "08:30", notes: "Return visit requested for shower glass.", completedAt: now - 3 * 86_400_000 + 12_000_000, timerStoppedAt: now - 3 * 86_400_000 + 12_000_000, reworkCount: 1, plannedCleanerPayCents: 8000, inspectionCycleOpen: true });
  await ctx.db.insert("jobs", { ...baseJob, clientRelationshipId: lighthouseId, propertyId: p4, type: "standard", status: "confirmed", scheduledDate: isoDay(now, 5), startTime: "18:00", durationMinutes: 240, notes: "After-hours museum office service.", acceptanceStatus: "accepted", acceptedAt: now, plannedCleanerPayCents: 10500 });
  await ctx.db.insert("jobs", { companyId, clientRelationshipId: harborlightId, propertyId: p2, cleanerIds: [], type: "turnover", status: "scheduled", scheduledDate: isoDay(now, 3), startTime: "13:30", durationMinutes: 150, notes: "Unassigned coverage gap for reassignment QA.", reworkCount: 0, assignedManagerId: managerId, requireConfirmation: false, source: "manual" });

  const approvedForm = await ctx.db.insert("forms", { jobId: approvedJob, companyId, cleanerId: workerId, cleanerScore: 9, finalPass: true, submittedAt: now - 7 * 86_400_000 + 10_800_000, status: "approved", ownerNotes: "Guest-ready standard met." });
  await ctx.db.insert("formItems", { formId: approvedForm, section: "Kitchen", itemName: "Sanitize counters and appliances", completed: true, isRedFlag: false, order: 1 });
  await ctx.db.insert("formItems", { formId: approvedForm, section: "Guest readiness", itemName: "Stage linens and welcome supplies", completed: true, note: "Two dishwasher pods remain after reset.", isRedFlag: false, order: 2 });
  const submittedForm = await ctx.db.insert("forms", { jobId: submittedJob, companyId, cleanerId: workerId, cleanerScore: 8, finalPass: true, submittedAt: now - 75_000_000, status: "submitted" });
  await ctx.db.insert("formItems", { formId: submittedForm, section: "Bathroom", itemName: "Polish shower glass", completed: true, isRedFlag: false, order: 1 });
  const progressForm = await ctx.db.insert("forms", { jobId: progressJob, companyId, cleanerId: workerId, status: "in_progress" });
  await ctx.db.insert("formItems", { formId: progressForm, section: "Living areas", itemName: "Vacuum and mop floors", completed: true, isRedFlag: false, order: 1 });
  await ctx.db.insert("formItems", { formId: progressForm, section: "Kitchen", itemName: "Clean refrigerator exterior", completed: false, isRedFlag: false, order: 2 });
  const reworkForm = await ctx.db.insert("forms", { jobId: reworkJob, companyId, cleanerId: workerId, cleanerScore: 6, finalPass: false, submittedAt: now - 3 * 86_400_000 + 12_000_000, status: "rework_requested", ownerNotes: "Shower glass needs another pass." });
  const redItem = await ctx.db.insert("formItems", { formId: reworkForm, section: "Bathroom", itemName: "Polish shower glass", completed: false, note: "Mineral buildup remains near lower seal.", isRedFlag: true, order: 1 });
  const redFlagId = await ctx.db.insert("redFlags", { companyId, propertyId: p2, jobId: reworkJob, formItemId: redItem, category: "cleanliness", severity: "medium", note: "Shower glass mineral buildup remains.", status: "open", ownerNote: "Manager requested a focused return visit." });
  await ctx.db.patch(reworkJob, { sourceRedFlagId: redFlagId });
  await ctx.db.insert("managerInspections", { jobId: approvedJob, companyId, managerId, readinessScore: 9, notes: "All guest-ready details confirmed.", severity: "none", createdAt: now - 7 * 86_400_000 + 11_400_000 });
  await ctx.db.insert("clientRequestScheduleProposals", { companyId, clientRequestId: requestId, clientRelationshipId: harborlightId, proposedDate: isoDay(now, 2), proposedStartTime: "10:00", durationMinutes: 180, jobType: "turnover", clientNote: "Fits the 4 PM check-in window.", status: "accepted", createdByUserId: managerId, createdAt: now - 2 * 86_400_000, respondedAt: now - 86_400_000, acceptedAt: now - 86_400_000, resultingJobId: scheduledJob });
  await ctx.db.insert("clientRequestScheduleProposals", { companyId, clientRequestId: schedulingRequestId, clientRelationshipId: harborlightId, proposedDate: isoDay(now, 4), proposedStartTime: "13:30", durationMinutes: 150, jobType: "turnover", clientNote: "Proposed after the morning departure window; awaiting Rowan's response.", status: "pending", createdByUserId: managerId, createdAt: now - 21_600_000, expiresAt: now + 7 * 86_400_000 });
  await ctx.db.insert("clientFeedback", { clientRequestId: requestId, createdAt: now - 6 * 86_400_000, rating: 5, comment: "The cottage was guest-ready ahead of check-in.", contactName: QA_PERSONAS.client.name, contactEmail: QA_PERSONAS.client.email, status: "reviewed", featuredOnSite: false });
  await ctx.db.insert("invoices", { companyId, clientRelationshipId: harborlightId, commercialAccountId: accountId, title: "Harborlight weekly turnovers", invoiceNumber: "QA-BH-1001", status: "issued", billingStartDate: isoDay(now, -14), billingEndDate: isoDay(now, -1), issueDate: isoDay(now, 0), dueDate: isoDay(now, 15), subtotalCents: 128000, baseSubtotalCents: 123500, addOnSubtotalCents: 4500, sourceProposalId: proposalId, taxCents: 0, totalCents: 128000, jobIds: [approvedJob, submittedJob], notes: "Inert QA invoice: no Stripe session or payment intent.", createdAt: now, updatedAt: now, issuedAt: now });
  await ctx.db.insert("cleanerPayments", { companyId, jobId: approvedJob, cleanerUserId: workerId, amountCents: 7200, method: "outside_app", status: "PAID", createdAt: now - 6 * 86_400_000, paidAt: now - 6 * 86_400_000, paidByUserId: ownerId });
  await ctx.db.insert("notifications", { companyId, userId: managerId, type: "job_submitted", title: "Pelican Loft ready for review", message: "Elena submitted the turnover checklist.", read: false, relatedJobId: submittedJob });
  await ctx.db.insert("notifications", { companyId, userId: workerId, type: "rework_requested", title: "Focused rework requested", message: "Please revisit the Pelican Loft shower glass.", read: false, relatedJobId: reworkJob });
  await ctx.db.insert("notifications", { companyId, userId: ownerId, type: "new_client_request", title: "Harborlight request converted", message: "The Seabreeze Cottage request is now on the schedule.", read: true, relatedJobId: scheduledJob, relatedClientRequestId: requestId });
  await ctx.db.insert("auditLog", { companyId, userId: ownerId, action: "qa_fixture_seeded", entityType: "company", entityId: String(companyId), details: "Guarded Bright Harbor autonomous QA fixture", timestamp: now });

  return { created: true, fixtureKey: QA_FIXTURE_KEY, companyId, personaIds: { owner: ownerId, manager: managerId, worker: workerId, worker2: worker2Id, client: clientId }, fixtureIds: { pendingAgreement: pendingAgreementId }, summary: { staffUsers: 4, clientUsers: 1, workers: 2, properties: 4, jobs: 7, unassignedJobs: 1, clientRelationships: 3, clientRequests: 4, scheduleProposals: 2, pendingScheduleProposals: 1, proposals: 3, sentProposals: 1, serviceAgreements: 2, sentServiceAgreements: 1 } };
} });

async function indexed(ctx: any, table: string, index: string, field: string, value: any) {
  return ctx.db.query(table).withIndex(index, (q: any) => q.eq(field, value)).collect();
}

export const reset = internalMutation({ args: {}, handler: async (ctx) => {
  assertQaFixtureEnvironment();
  const state = await fixtureState(ctx, true);
  if (!state.company) return { deleted: false, alreadyAbsent: true, fixtureKey: QA_FIXTURE_KEY };
  const companyId = state.company._id;

  // Cross-company or externally rooted relationships make ownership ambiguous.
  const foreignGroups = await Promise.all([
    indexed(ctx, "ownerConnections", "by_companyAId", "companyAId", companyId), indexed(ctx, "ownerConnections", "by_companyBId", "companyBId", companyId),
    indexed(ctx, "sharedJobs", "by_fromCompanyId", "fromCompanyId", companyId), indexed(ctx, "sharedJobs", "by_toCompanyId", "toCompanyId", companyId),
    indexed(ctx, "settlementBatches", "by_fromCompanyId", "fromCompanyId", companyId), indexed(ctx, "settlementBatches", "by_toCompanyId", "toCompanyId", companyId),
  ]);
  for (const status of ["open", "paid", "void"]) {
    foreignGroups.push(await ctx.db.query("companySettlements").withIndex("by_fromCompany_status", (q: any) => q.eq("fromCompanyId", companyId).eq("status", status)).collect());
    foreignGroups.push(await ctx.db.query("companySettlements").withIndex("by_toCompany_status", (q: any) => q.eq("toCompanyId", companyId).eq("status", status)).collect());
  }
  if (foreignGroups.some((rows) => rows.length)) fail("cross-company relationships exist; reset requires manual review");
  for (const user of [state.personas.owner, state.personas.manager, state.personas.worker, state.personas.worker2].filter(Boolean)) {
    if ((await indexed(ctx, "affiliateAttributions", "by_purchaserUserId", "purchaserUserId", user._id)).length || (await indexed(ctx, "affiliateAttributions", "by_referrerUserId", "referrerUserId", user._id)).length || (await indexed(ctx, "affiliateLedger", "by_referrerUserId", "referrerUserId", user._id)).length) fail("fixture staff has affiliate relationships");
  }

  // Collect the complete, indexed ownership graph before the first destructive write.
  const companyTables: [string, string, string][] = [
    ["securityEvents", "by_companyId", "companyId"], ["workerDocuments", "by_companyId", "companyId"], ["workerOnboardingItems", "by_companyId", "companyId"], ["companyOnboardingDocuments", "by_companyId", "companyId"],
    ["teamMembers", "by_companyId", "companyId"], ["forms", "by_companyId", "companyId"], ["notifications", "by_companyId", "companyId"], ["auditLog", "by_companyId_timestamp", "companyId"],
    ["companyAddOns", "by_companyId", "companyId"], ["partnerContacts", "by_companyId", "companyId"], ["companySites", "by_companyId", "companyId"], ["cleanerLeads", "by_companyId_createdAt", "companyId"],
    ["proposals", "by_companyId", "companyId"], ["walkthroughs", "by_company", "companyId"], ["serviceAgreements", "by_company", "companyId"], ["commercialSchedules", "by_company", "companyId"],
    ["invoices", "by_company", "companyId"], ["clientRequests", "by_companyId", "companyId"], ["clientRequestScheduleProposals", "by_companyId", "companyId"], ["cleanerPayments", "by_companyId", "companyId"],
    ["managerInspections", "by_companyId_createdAt", "companyId"], ["inventoryTemplates", "by_companyId", "companyId"], ["checkoutProvisioning", "by_companyId", "companyId"], ["calendarConnections", "by_companyId", "companyId"],
    ["jobAutomationRules", "by_companyId", "companyId"], ["commercialAccounts", "by_companyId", "companyId"], ["properties", "by_companyId", "companyId"], ["teams", "by_companyId", "companyId"],
    ["clientRelationships", "by_companyId", "companyId"], ["workerProfiles", "by_companyId", "companyId"], ["users", "by_companyId", "companyId"], ["companySettings", "by_companyId", "companyId"],
  ];
  const rows = new Map<string, any[]>();
  for (const [table, index, field] of companyTables) rows.set(table, await indexed(ctx, table, index, field, companyId));
  rows.set("documentTemplates", await ctx.db.query("documentTemplates").withIndex("by_company_type", (q: any) => q.eq("companyId", companyId)).collect());
  rows.set("jobs", await ctx.db.query("jobs").withIndex("by_companyId_scheduledDate", (q: any) => q.eq("companyId", companyId)).collect());
  rows.set("redFlags", (await Promise.all(["open", "acknowledged", "in_progress", "resolved", "wont_fix"].map((status) => ctx.db.query("redFlags").withIndex("by_companyId_status", (q: any) => q.eq("companyId", companyId).eq("status", status)).collect()))).flat());
  const formItems = (await Promise.all((rows.get("forms") ?? []).map((x) => indexed(ctx, "formItems", "by_formId", "formId", x._id)))).flat();
  const feedback = (await Promise.all((rows.get("clientRequests") ?? []).map((x) => indexed(ctx, "clientFeedback", "by_clientRequestId", "clientRequestId", x._id)))).flat();
  const paymentJobs = (await Promise.all((rows.get("cleanerPayments") ?? []).map((x) => indexed(ctx, "cleanerPaymentJobs", "by_cleanerPaymentId", "cleanerPaymentId", x._id)))).flat();
  const fixtureWorkers = [state.personas.worker, state.personas.worker2].filter(Boolean);
  const availability = (await Promise.all(fixtureWorkers.map((x) => indexed(ctx, "cleanerAvailability", "by_cleanerId_dayOfWeek", "cleanerId", x._id)))).flat();
  const availabilityOverrides = (await Promise.all(fixtureWorkers.map((x) => indexed(ctx, "cleanerAvailabilityOverrides", "by_cleanerId_date", "cleanerId", x._id)))).flat();
  const calendarReservations = (await Promise.all((rows.get("calendarConnections") ?? []).map((x) => indexed(ctx, "calendarReservations", "by_connectionId", "connectionId", x._id)))).flat();
  const calendarSyncLogs = (await Promise.all((rows.get("calendarConnections") ?? []).map((x) => indexed(ctx, "calendarSyncLogs", "by_connectionId", "connectionId", x._id)))).flat();
  const authSessions = (await Promise.all([state.personas.owner, state.personas.manager, state.personas.worker, state.personas.worker2].filter(Boolean).map((x) => indexed(ctx, "authSessions", "by_userId", "userId", x._id)))).flat();
  authSessions.push(...await indexed(ctx, "authSessions", "by_clientUserId", "clientUserId", state.personas.client._id));
  const clientRelationships = await indexed(ctx, "clientRelationships", "by_clientUserId", "clientUserId", state.personas.client._id);
  if (clientRelationships.some((x: any) => x.companyId !== companyId)) fail("client persona is related to an unrelated company");

  // No fixture operation creates storage objects. Refuse rather than delete if later edits attached any.
  const hasStorage = (rows.get("companySettings") ?? []).some((x) => x.logoStorageId) || (rows.get("companyOnboardingDocuments") ?? []).some((x) => x.storageId) || (rows.get("forms") ?? []).some((x) => x.signatureStorageId || x.photoStorageIds?.length) || formItems.some((x) => x.photoStorageId) || (rows.get("managerInspections") ?? []).some((x) => x.photoStorageIds?.length);
  if (hasStorage) fail("fixture contains storage attachments; reset will not invoke Vercel Blob/storage cleanup");

  for (const item of [...formItems, ...feedback, ...paymentJobs, ...availability, ...availabilityOverrides, ...calendarSyncLogs, ...calendarReservations, ...authSessions]) await ctx.db.delete(item._id);
  const deleteOrder = ["securityEvents", "workerDocuments", "workerOnboardingItems", "companyOnboardingDocuments", "teamMembers", "forms", "notifications", "auditLog", "companyAddOns", "partnerContacts", "companySites", "cleanerLeads", "clientRequestScheduleProposals", "invoices", "cleanerPayments", "managerInspections", "redFlags", "commercialSchedules", "serviceAgreements", "walkthroughs", "proposals", "clientRequests", "jobAutomationRules", "jobs", "commercialAccounts", "documentTemplates", "properties", "inventoryTemplates", "teams", "calendarConnections", "checkoutProvisioning", "clientRelationships", "workerProfiles", "companySettings", "users"];
  let deletedRecords = formItems.length + feedback.length + paymentJobs.length + availability.length + availabilityOverrides.length + calendarSyncLogs.length + calendarReservations.length + authSessions.length;
  for (const table of deleteOrder) for (const item of rows.get(table) ?? []) { await ctx.db.delete(item._id); deletedRecords++; }
  await ctx.db.delete(state.personas.client._id); deletedRecords++;
  await ctx.db.delete(companyId); deletedRecords++;
  return { deleted: true, fixtureKey: QA_FIXTURE_KEY, companyId, deletedRecords };
} });
