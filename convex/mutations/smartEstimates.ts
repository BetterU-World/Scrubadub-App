import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { propertyTypeFromRequestLeadType } from "../lib/commercialEligibility";
import { calculateEstimate, estimateBaseValidator, estimateOverrideValidator, estimateProposalBase } from "../lib/smartEstimatePricing";
import { getOwnedProposal, requireDraft } from "./proposals";

const authArgs = { userId: v.id("users"), sessionToken: v.string() };
const draftInputs = { input: estimateBaseValidator, override: v.optional(estimateOverrideValidator) };

async function requireSales(ctx: MutationCtx, args: Infer<typeof authValidator>) {
  const actor = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageSalesAndCommercial");
  if (!actor.companyId) throw new Error("Company access required");
  return actor.companyId;
}

const authValidator = v.object(authArgs);

async function estimateContext(ctx: MutationCtx, companyId: Id<"companies">, requestId: Id<"clientRequests">, walkthroughId?: Id<"walkthroughs">) {
  const request = await ctx.db.get(requestId);
  if (!request || request.companyId !== companyId) throw new Error("Access denied");
  const walkthrough = walkthroughId ? await ctx.db.get(walkthroughId) : null;
  if (walkthroughId && (!walkthrough || walkthrough.companyId !== companyId || walkthrough.clientRequestId !== requestId)) {
    throw new Error("Walkthrough must match the estimate request");
  }
  if (walkthrough?.propertyId && request.propertyId && walkthrough.propertyId !== request.propertyId) {
    throw new Error("Walkthrough property must match the request");
  }
  if (walkthrough?.clientRelationshipId && request.clientRelationshipId &&
      walkthrough.clientRelationshipId !== request.clientRelationshipId) {
    throw new Error("Walkthrough client must match the request");
  }
  const propertyId = request.propertyId ?? walkthrough?.propertyId;
  const relationshipId = request.clientRelationshipId ?? walkthrough?.clientRelationshipId;
  if (relationshipId && (await ctx.db.get(relationshipId))?.companyId !== companyId) {
    throw new Error("Estimate client is outside the company");
  }
  const property = propertyId ? await ctx.db.get(propertyId) : null;
  if (propertyId) {
    if (!property || property.companyId !== companyId ||
        (relationshipId && property.clientRelationshipId && property.clientRelationshipId !== relationshipId)) {
      throw new Error("Estimate property must match the company and client");
    }
  }
  return { propertyId, relationshipId, propertyType: property?.type ?? propertyTypeFromRequestLeadType(request.leadType) };
}

async function ownedEstimate(ctx: MutationCtx, args: Infer<typeof authValidator> & { estimateId: Id<"smartEstimates"> }) {
  const companyId = await requireSales(ctx, args);
  const estimate = await ctx.db.get(args.estimateId);
  if (!estimate || estimate.companyId !== companyId) throw new Error("Access denied");
  const context = await estimateContext(ctx, companyId, estimate.clientRequestId, estimate.walkthroughId);
  return { estimate, ...context };
}

// Only registered as internal functions in Phase 1. Sales authorization still applies to internal calls.
export const openDraft = internalMutation({
  args: { ...authArgs, clientRequestId: v.id("clientRequests"), walkthroughId: v.optional(v.id("walkthroughs")), ...draftInputs },
  returns: v.id("smartEstimates"),
  handler: async (ctx, args) => {
    const companyId = await requireSales(ctx, args);
    const { propertyId } = await estimateContext(ctx, companyId, args.clientRequestId, args.walkthroughId);
    const existing = await ctx.db.query("smartEstimates")
      .withIndex("by_companyId_clientRequestId", q => q.eq("companyId", companyId).eq("clientRequestId", args.clientRequestId))
      .unique();
    if (existing) {
      await estimateContext(ctx, companyId, existing.clientRequestId, existing.walkthroughId);
      if (args.walkthroughId && existing.walkthroughId && args.walkthroughId !== existing.walkthroughId) {
        throw new Error("Existing estimate has a different walkthrough");
      }
      return existing._id;
    }
    const calculated = calculateEstimate(args.input, [], args.override);
    return await ctx.db.insert("smartEstimates", {
      companyId, clientRequestId: args.clientRequestId, walkthroughId: args.walkthroughId,
      propertyId, draftRevision: 1, input: args.input, override: calculated.override,
    });
  },
});

export const saveDraft = internalMutation({
  args: { ...authArgs, estimateId: v.id("smartEstimates"), expectedDraftRevision: v.number(), walkthroughId: v.optional(v.id("walkthroughs")), ...draftInputs },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { estimate, propertyId } = await ownedEstimate(ctx, args);
    if (estimate.draftRevision !== args.expectedDraftRevision) throw new Error("Estimate draft changed");
    if (args.walkthroughId && estimate.walkthroughId && args.walkthroughId !== estimate.walkthroughId) {
      throw new Error("Existing estimate has a different walkthrough");
    }
    const walkthrough = args.walkthroughId
      ? await estimateContext(ctx, estimate.companyId, estimate.clientRequestId, args.walkthroughId)
      : null;
    const calculated = calculateEstimate(args.input, [], args.override);
    const draftRevision = estimate.draftRevision + 1;
    await ctx.db.patch(estimate._id, {
      draftRevision, input: args.input, override: calculated.override,
      walkthroughId: estimate.walkthroughId ?? args.walkthroughId,
      propertyId: walkthrough?.propertyId ?? propertyId,
    });
    return draftRevision;
  },
});

async function targetProposal(
  ctx: MutationCtx,
  args: Infer<typeof authValidator> & { proposalId: Id<"proposals"> },
  estimate: Awaited<ReturnType<typeof ownedEstimate>>,
) {
  const { proposal } = await getOwnedProposal(ctx, args.sessionToken, args.userId, args.proposalId);
  requireDraft(proposal);
  if (proposal.clientRequestId !== estimate.estimate.clientRequestId ||
      (estimate.relationshipId && proposal.clientRelationshipId !== estimate.relationshipId) ||
      (estimate.estimate.walkthroughId && proposal.sourceWalkthroughId &&
        estimate.estimate.walkthroughId !== proposal.sourceWalkthroughId)) {
    throw new Error("Proposal must match the estimate context");
  }
  if (proposal.sourceWalkthroughId) {
    const context = await estimateContext(ctx, proposal.companyId, proposal.clientRequestId, proposal.sourceWalkthroughId);
    if (estimate.propertyId && context.propertyId !== estimate.propertyId) {
      throw new Error("Proposal walkthrough property must match the estimate");
    }
  }
  return proposal;
}

function fingerprintAddOns(lines: readonly object[]) {
  return JSON.stringify(lines.map(line => Object.fromEntries(Object.entries(line).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))));
}

export const approve = internalMutation({
  args: {
    ...authArgs, estimateId: v.id("smartEstimates"), expectedDraftRevision: v.number(),
    proposal: v.optional(v.object({ proposalId: v.id("proposals"), expectedProposalRevision: v.number() })),
  },
  returns: v.id("smartEstimateRevisions"),
  handler: async (ctx, args) => {
    const context = await ownedEstimate(ctx, args);
    const { estimate } = context;
    if (estimate.draftRevision !== args.expectedDraftRevision) throw new Error("Estimate draft changed");
    if (estimate.propertyId !== context.propertyId) throw new Error("Estimate property changed. Save the draft again");
    const proposal = args.proposal && await targetProposal(ctx, { ...args, proposalId: args.proposal.proposalId }, context);
    if (proposal && proposal.updatedAt !== args.proposal?.expectedProposalRevision) throw new Error("Proposal draft changed");
    const lines = proposal?.addOnLineItems ?? [];
    const calculated = calculateEstimate(estimate.input, lines, estimate.override);
    return await ctx.db.insert("smartEstimateRevisions", {
      companyId: estimate.companyId, estimateId: estimate._id, draftRevision: estimate.draftRevision,
      walkthroughId: estimate.walkthroughId, propertyId: context.propertyId, clientRelationshipId: context.relationshipId,
      input: estimate.input, override: calculated.override, proposalId: proposal?._id,
      addOnSnapshot: lines, engineVersion: calculated.engineVersion,
      recommendedBaseCents: calculated.recommendedBaseCents, approvedBaseCents: calculated.approvedBaseCents,
      addOnOneTimeTotalCents: calculated.approved.addOnOneTimeTotalCents,
      addOnMonthlyTotalCents: calculated.approved.addOnMonthlyTotalCents,
      approvedByUserId: args.userId, approvedAt: Date.now(),
    });
  },
});

export const applyToProposal = internalMutation({
  args: { ...authArgs, estimateId: v.id("smartEstimates"), revisionId: v.id("smartEstimateRevisions"), proposalId: v.id("proposals"), expectedProposalRevision: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const context = await ownedEstimate(ctx, args);
    const proposal = await targetProposal(ctx, args, context);
    const revision = await ctx.db.get(args.revisionId);
    if (!revision || revision.companyId !== proposal.companyId || revision.estimateId !== context.estimate._id ||
        (revision.proposalId && revision.proposalId !== proposal._id)) {
      throw new Error("Approved revision must match the estimate and proposal");
    }
    if (revision.propertyId !== context.propertyId || revision.walkthroughId !== context.estimate.walkthroughId ||
        (revision.clientRelationshipId && revision.clientRelationshipId !== context.relationshipId)) {
      throw new Error("Estimate context changed. Approve the estimate again");
    }
    const lines = proposal.addOnLineItems ?? [];
    if (fingerprintAddOns(lines) !== fingerprintAddOns(revision.addOnSnapshot)) {
      throw new Error("Proposal add-ons changed. Approve the estimate again");
    }
    const calculated = calculateEstimate(revision.input, lines, revision.override);
    if (calculated.engineVersion !== revision.engineVersion ||
        calculated.approvedBaseCents !== revision.approvedBaseCents ||
        calculated.recommendedBaseCents !== revision.recommendedBaseCents ||
        calculated.approved.addOnOneTimeTotalCents !== revision.addOnOneTimeTotalCents ||
        calculated.approved.addOnMonthlyTotalCents !== revision.addOnMonthlyTotalCents) {
      throw new Error("Approved estimate no longer matches its calculation");
    }
    if (context.propertyType === "commercial" && revision.input.cadence !== "monthly") {
      throw new Error("Smart Estimate commercial handoff requires a monthly base");
    }
    if ((context.propertyType === "residential" || context.propertyType === "vacation_rental") &&
        calculated.approved.hasMonthlyPricing) {
      throw new Error("Smart Estimate job billing handoff requires one-time pricing only");
    }
    const base = estimateProposalBase(revision.input.cadence, revision.approvedBaseCents);
    if (proposal.appliedEstimateRevisionId === revision._id &&
        proposal.oneTimePriceCents === base.oneTimePriceCents && proposal.monthlyPriceCents === base.monthlyPriceCents) {
      return proposal.updatedAt;
    }
    if (proposal.updatedAt !== args.expectedProposalRevision) throw new Error("Proposal draft changed");
    const updatedAt = Math.max(Date.now(), proposal.updatedAt + 1);
    await ctx.db.patch(proposal._id, { ...base, appliedEstimateRevisionId: revision._id, updatedAt });
    return updatedAt;
  },
});
