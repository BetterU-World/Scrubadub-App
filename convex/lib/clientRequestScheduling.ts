import { logAudit } from "./helpers";
import { resolvePropertyConditionRequirement } from "./propertyConditionRequirements";
import { isExistingClientServiceRequest } from "./requestContext";
import { acceptedOneTimeProposalPrice } from "./jobPricing";

export const REQUEST_JOB_TYPES = [
  "standard",
  "deep_clean",
  "turnover",
  "move_in_out",
  "maintenance",
  "post_construction",
] as const;

function localDate(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function localTime(timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export async function validateClientRequestSchedule(
  ctx: any,
  request: any,
  schedule: any,
) {
  if (!request.clientRelationshipId)
    throw new Error("Active client relationship required");
  const relationship = await ctx.db.get(request.clientRelationshipId);
  if (
    !relationship ||
    relationship.companyId !== request.companyId ||
    relationship.status !== "active"
  )
    throw new Error("Active client relationship required");
  if (["declined", "archived"].includes(request.status))
    throw new Error("Request cannot be scheduled in its current state");
  if (!(await isExistingClientServiceRequest(ctx, request)))
    throw new Error("Request is not an existing-client job request");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(schedule.scheduledDate) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.startTime)
  )
    throw new Error("Invalid final schedule");
  const company = await ctx.db.get(request.companyId);
  const timeZone = company?.timezone || "UTC";
  if (
    !company ||
    schedule.scheduledDate < localDate(timeZone) ||
    (schedule.scheduledDate === localDate(timeZone) &&
      schedule.startTime < localTime(timeZone))
  )
    throw new Error("Final schedule cannot be in the past");
  if (
    !Number.isInteger(schedule.durationMinutes) ||
    schedule.durationMinutes < 30 ||
    schedule.durationMinutes > 1440
  )
    throw new Error("Invalid service duration");
  if (!REQUEST_JOB_TYPES.includes(schedule.type))
    throw new Error("Unsupported service type");
  const clientSchedulingNote = schedule.clientSchedulingNote?.trim();
  if (clientSchedulingNote && clientSchedulingNote.length > 500)
    throw new Error("Scheduling note must be 500 characters or fewer");
  let propertyId;
  let commercialAccountId;
  if (request.propertyId) {
    const property = await ctx.db.get(request.propertyId);
    if (
      !property ||
      property.companyId !== request.companyId ||
      property.clientRelationshipId !== relationship._id ||
      !property.active
    )
      throw new Error("Service location is unavailable");
    propertyId = property._id;
  } else if (request.commercialAccountId) {
    const account = await ctx.db.get(request.commercialAccountId);
    if (
      !account ||
      account.companyId !== request.companyId ||
      account.clientRelationshipId !== relationship._id ||
      account.status !== "active"
    )
      throw new Error("Service location is unavailable");
    commercialAccountId = account._id;
  } else throw new Error("Service location is unavailable");
  return {
    company,
    relationship,
    propertyId,
    commercialAccountId,
    clientSchedulingNote,
  };
}

export async function createJobFromClientRequest(
  ctx: any,
  request: any,
  schedule: any,
  audit: { userId: any; action: string; details?: any },
) {
  const existing = await ctx.db
    .query("jobs")
    .withIndex("by_sourceClientRequestId", (q: any) =>
      q.eq("sourceClientRequestId", request._id),
    )
    .first();
  if (existing) return { job: existing, replayed: true };
  const validated = await validateClientRequestSchedule(ctx, request, schedule);
  const requiresPropertyConditionCheck = await resolvePropertyConditionRequirement(ctx, {
    companyId: request.companyId,
    propertyId: validated.propertyId,
    commercialAccountId: validated.commercialAccountId,
  });
  const offer = request.currentPriceOfferId ? await ctx.db.get(request.currentPriceOfferId) as any : null;
  if (offer && (offer.companyId !== request.companyId || offer.clientRelationshipId !== validated.relationship._id || offer.clientRequestId !== request._id || !["issued", "accepted"].includes(offer.status))) throw new Error("Current price offer is invalid");
  let proposalPrice: any = null;
  let acceptedProposal: any = null;
  if (!offer && !validated.commercialAccountId) {
    const proposals = await ctx.db.query("proposals").withIndex("by_clientRequestId", (q: any) => q.eq("clientRequestId", request._id)).collect();
    const accepted = proposals.filter((proposal: any) => proposal.status === "accepted" && proposal.companyId === request.companyId && proposal.clientRelationshipId === validated.relationship._id);
    if (accepted.length === 1) {
      acceptedProposal = accepted[0];
      proposalPrice = await acceptedOneTimeProposalPrice(ctx, acceptedProposal, request, validated.relationship._id);
    }
  }
  const offerConsent = offer?.status === "accepted" ? { source: offer.acceptedByClientUserId ? "client_in_app" : "owner_reported_outside", acceptedAt: offer.respondedAt, acceptedAmountCents: offer.snapshot.totalCents, clientUserId: offer.acceptedByClientUserId, recordedByUserId: offer.outsideRecordedByUserId, evidenceNote: offer.outsideEvidenceNote, offerId: offer._id } : undefined;
  const jobId = await ctx.db.insert("jobs", {
    companyId: request.companyId,
    clientRelationshipId: validated.relationship._id,
    propertyId: validated.propertyId,
    commercialAccountId: validated.commercialAccountId,
    requiresPropertyConditionCheck,
    cleanerIds: [],
    type: schedule.type,
    status: "confirmed",
    scheduledDate: schedule.scheduledDate,
    startTime: schedule.startTime,
    durationMinutes: schedule.durationMinutes,
    sourceClientRequestId: request._id,
    sourceProposalId: acceptedProposal?._id,
    customerChargeCents: offerConsent ? offer.snapshot.totalCents : proposalPrice?.snapshot.totalCents,
    customerPricingStatus: validated.commercialAccountId ? undefined : offer ? (offerConsent ? "accepted" : "awaiting_acceptance") : proposalPrice ? "accepted" : "pending",
    customerPricingSource: offer ? offer.source : proposalPrice ? "accepted_proposal" : acceptedProposal ? "legacy_unknown" : undefined,
    customerPricingRevision: offer?.version ?? (proposalPrice ? 1 : 0),
    customerPricingSnapshot: offerConsent ? offer.snapshot : proposalPrice?.snapshot,
    customerPriceOfferId: offer?._id,
    customerPriceProposalId: proposalPrice?.proposalId,
    customerPriceProposalIssueId: proposalPrice?.issueId,
    customerPriceConsent: offerConsent ?? proposalPrice?.consent,
    clientSchedulingNote: validated.clientSchedulingNote || undefined,
    requireConfirmation: false,
    acceptanceStatus: "accepted",
    reworkCount: 0,
    requiredAddOnSnapshots: request.requestedAddOnSnapshots?.map(
      (item: any, index: number) => ({
        snapshotId: `request:${request._id}:${index}`,
        name: item.name,
        quantity: item.quantity,
        unitLabel: item.unitLabel,
      }),
    ),
  });
  if (offer) await ctx.db.patch(offer._id, { jobId });
  await ctx.db.patch(request._id, {
    status: "converted",
    leadStage: "converted",
    lastStageChangedAt: Date.now(),
  });
  await logAudit(ctx, {
    companyId: request.companyId,
    userId: audit.userId,
    action: audit.action,
    entityType: "job",
    entityId: jobId,
    details: JSON.stringify({ requestId: request._id, ...audit.details }),
  });
  return { job: await ctx.db.get(jobId), replayed: false };
}
