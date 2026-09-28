import { v } from "convex/values";

export const outgoingRecipientInput = v.union(
  v.object({ type: v.literal("worker"), userId: v.id("users") }),
  v.object({
    type: v.literal("partner_company"),
    companyId: v.id("companies"),
  }),
);
export const outgoingRecipient = v.union(
  v.object({
    type: v.literal("worker"),
    userId: v.id("users"),
    workerProfileId: v.optional(v.id("workerProfiles")),
    displayName: v.string(),
  }),
  v.object({
    type: v.literal("partner_company"),
    companyId: v.id("companies"),
    displayName: v.string(),
  }),
);
export const outgoingSource = v.union(
  v.object({ type: v.literal("worker_job"), jobId: v.id("jobs") }),
  v.object({
    type: v.literal("partner_shared_job"),
    sharedJobId: v.id("sharedJobs"),
  }),
);
export const outgoingLineInput = v.object({
  lineId: v.string(),
  recipient: outgoingRecipientInput,
  amountCents: v.number(),
  basis: v.string(),
});
export const outgoingLine = v.object({
  lineId: v.string(),
  recipient: outgoingRecipient,
  amountCents: v.number(),
  basis: v.string(),
});
export const outsideMethod = v.union(
  v.literal("ach_or_bank_transfer"),
  v.literal("zelle"),
  v.literal("check"),
  v.literal("cash"),
  v.literal("payroll_provider"),
  v.literal("other"),
);
export const outgoingAcceptance = v.object({
  actorUserId: v.id("users"),
  evidence: v.string(),
  acceptedAt: v.number(),
});
export const outgoingEventPayload = v.union(
  v.object({
    type: v.literal("terms_approved"),
    termsId: v.id("outgoingTerms"),
  }),
  v.object({
    type: v.literal("obligation_created"),
    obligationId: v.id("outgoingObligations"),
    termsId: v.id("outgoingTerms"),
  }),
  v.object({
    type: v.literal("principal_adjusted"),
    obligationId: v.id("outgoingObligations"),
    deltaCents: v.number(),
    reason: v.string(),
  }),
  v.object({
    type: v.literal("obligation_voided"),
    obligationId: v.id("outgoingObligations"),
    reason: v.string(),
  }),
  v.object({
    type: v.literal("outside_settlement_recorded"),
    settlementId: v.id("outgoingSettlements"),
  }),
  v.object({
    type: v.literal("outside_settlement_reversed"),
    settlementId: v.id("outgoingSettlements"),
    reason: v.string(),
  }),
);
