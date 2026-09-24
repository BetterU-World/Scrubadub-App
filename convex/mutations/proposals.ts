import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { ensureClientRelationshipForLead } from "../lib/clientRelationships";
import { assertProposalReadyForDelivery, newProposalLineItemId, normalizeProposalAddOnLine, validateProposalAddOnLines } from "../lib/proposalAddOnLineItems";
import { proposalIssueContent } from "../lib/proposalIssueContent";
import { safeProposalPayload } from "../proposalDeliveryInternal";
import { notifyProposalDecision } from "../lib/proposalDecisionNotifications";

const proposalFrequencyValidator = v.union(
  v.literal("one_time"),
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("custom")
);

function cleanOptional(value: string | undefined, max = 1000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanRequired(value: string, fallback: string, max = 200) {
  return value.trim().slice(0, max) || fallback;
}

function cleanPrice(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error("Proposal prices must be non-negative whole cents");
  }
  if (value > 1_000_000_000) throw new Error("Proposal price is too large");
  return value;
}

function assessmentFrequency(value: string | undefined): Doc<"proposals">["serviceFrequency"] {
  switch (value) {
    case "one_time":
    case "weekly":
    case "biweekly":
    case "monthly":
    case "quarterly":
    case "custom":
      return value;
    default:
      return undefined;
  }
}

function assessmentMonthlyEstimate(value: number | undefined) {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000
    ? value
    : undefined;
}

async function getOwnedProposal(
  ctx: MutationCtx,
  sessionToken: string,
  userId: Id<"users">,
  proposalId: Id<"proposals">
) {
  const owner = await requireOwnerOrManagerCapability(
    ctx, sessionToken, userId, "canManageSalesAndCommercial"
  );
  const proposal = await ctx.db.get(proposalId);
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, proposal: proposal as Doc<"proposals"> };
}

function requireDraft(proposal: Doc<"proposals">) {
  if (proposal.status !== "draft") throw new Error("Return the proposal to draft before editing");
  if (proposal.pendingDeliveryAttemptId) throw new Error("Wait for the pending proposal delivery attempt before editing");
}

/** Create an owner-only draft proposal from a lead. Pricing is intentionally blank. */
export const createProposalFromLead = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    clientRequestId: v.id("clientRequests"),
    sourceWalkthroughId: v.optional(v.id("walkthroughs")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerOrManagerCapability(
      ctx, args.sessionToken, args.userId, "canManageSalesAndCommercial"
    );

    const request = await ctx.db.get(args.clientRequestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    const existing = await ctx.db
      .query("proposals")
      .withIndex("by_clientRequestId", (q) =>
        q.eq("clientRequestId", args.clientRequestId)
      )
      .first();
    if (existing) return existing._id;

    const sourceWalkthrough = args.sourceWalkthroughId
      ? await ctx.db.get(args.sourceWalkthroughId)
      : null;
    if (args.sourceWalkthroughId) {
      if (!sourceWalkthrough) throw new Error("Source walkthrough not found");
      if (sourceWalkthrough.companyId !== owner.companyId) throw new Error("Access denied");
      if (sourceWalkthrough.clientRequestId !== request._id) throw new Error("Source walkthrough must match the lead");
      if (sourceWalkthrough.status !== "completed" && sourceWalkthrough.status !== "proposal_created") {
        throw new Error("Complete the walkthrough before creating its proposal");
      }
      if (sourceWalkthrough.proposalId) throw new Error("Source walkthrough is already linked to a proposal");
    }

    const recommendedFrequency = assessmentFrequency(sourceWalkthrough?.serviceFrequencyRecommendation);
    const leadFrequency = (request as any).estimatedFrequency;
    const now = Date.now();
    const clientRelationshipId = await ensureClientRelationshipForLead(ctx, request);
    const proposalId = await ctx.db.insert("proposals", {
      companyId: request.companyId,
      clientRelationshipId,
      clientRequestId: request._id,
      sourceWalkthroughId: sourceWalkthrough?._id,
      createdByUserId: owner._id,
      title: "Cleaning Proposal",
      clientName: request.requesterName,
      businessName: cleanOptional((request as any).businessName, 200),
      propertyAddress: cleanOptional(sourceWalkthrough?.address, 500) ?? cleanOptional(request.propertySnapshot?.address, 500),
      serviceFrequency: recommendedFrequency ?? leadFrequency,
      serviceFrequencyNotes: recommendedFrequency && recommendedFrequency !== leadFrequency
        ? undefined
        : cleanOptional((request as any).estimatedFrequencyNotes, 1000),
      scopeOfWork: sourceWalkthrough?.proposalReadyScopeText &&
        sourceWalkthrough.proposalReadyScopeText === cleanOptional(sourceWalkthrough.scopeNotes, 4000)
        ? sourceWalkthrough.proposalReadyScopeText
        : cleanOptional(request.requestedService, 4000),
      assessmentSuggestedMonthlyPriceCents: assessmentMonthlyEstimate(sourceWalkthrough?.estimatedMonthlyValueCents),
      addOnLineItems: ((request as any).requestedAddOnSnapshots ?? []).map((item: any) => normalizeProposalAddOnLine({
        lineItemId: newProposalLineItemId(), sourceType: "request_snapshot", sourceClientRequestId: request._id,
        sourceCompanyAddOnId: item.sourceCompanyAddOnId, name: item.name, pricingMethod: item.pricingMethod,
        unitPriceCents: item.priceCents, unitLabel: item.unitLabel, quantity: item.quantity, billingCadence: "one_time",
      })),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    if (sourceWalkthrough) {
      await ctx.db.patch(sourceWalkthrough._id, {
        proposalId,
        clientRelationshipId: sourceWalkthrough.clientRelationshipId ?? clientRelationshipId,
        status: "proposal_created",
        updatedAt: now,
      });
    }

    const stage = (request as any).leadStage ?? "new";
    if (["new", "contacted", "walkthrough_scheduled"].includes(stage)) {
      await ctx.db.patch(request._id, {
        leadStage: "proposal_needed",
        lastStageChangedAt: now,
      });
    }

    return proposalId;
  },
});

/** Update editable proposal fields. */
export const updateProposal = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    proposalId: v.id("proposals"),
    title: v.string(),
    clientName: v.string(),
    businessName: v.optional(v.string()),
    propertyAddress: v.optional(v.string()),
    serviceFrequency: v.optional(proposalFrequencyValidator),
    serviceFrequencyNotes: v.optional(v.string()),
    scopeOfWork: v.optional(v.string()),
    monthlyPriceCents: v.optional(v.number()),
    oneTimePriceCents: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.sessionToken, args.userId, args.proposalId);
    requireDraft(proposal);

    const updatedAt = Math.max(Date.now(), proposal.updatedAt + 1);
    await ctx.db.patch(args.proposalId, {
      title: cleanRequired(args.title, "Cleaning Proposal", 200),
      clientName: cleanRequired(args.clientName, "Client", 200),
      businessName: cleanOptional(args.businessName, 200),
      propertyAddress: cleanOptional(args.propertyAddress, 500),
      serviceFrequency: args.serviceFrequency,
      serviceFrequencyNotes: cleanOptional(args.serviceFrequencyNotes, 1000),
      scopeOfWork: cleanOptional(args.scopeOfWork, 4000),
      monthlyPriceCents: cleanPrice(args.monthlyPriceCents),
      oneTimePriceCents: cleanPrice(args.oneTimePriceCents),
      notes: cleanOptional(args.notes, 4000),
      updatedAt,
    });
    return updatedAt;
  },
});

export const markProposalSent = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.sessionToken, args.userId, args.proposalId);
    if (proposal.status === "accepted" || proposal.status === "declined") throw new Error("Finalized proposals are immutable");
    if (proposal.pendingDeliveryAttemptId) throw new Error("A proposal delivery attempt is still pending");
    assertProposalReadyForDelivery(proposal);
    const now = Date.now();
    let issue = proposal.currentIssueId ? await ctx.db.get(proposal.currentIssueId) : null;
    if (issue && (issue.companyId !== proposal.companyId || issue.proposalId !== proposal._id || issue.withdrawnAt)) throw new Error("Active proposal issue is invalid");
    if (!issue) {
      const latest = await ctx.db.query("proposalIssues")
        .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
        .order("desc").first();
      const payload = await safeProposalPayload(ctx, proposal);
      const issueId = await ctx.db.insert("proposalIssues", {
        companyId: proposal.companyId, proposalId: proposal._id,
        issueNumber: (latest?.issueNumber ?? 0) + 1,
        content: proposalIssueContent(payload), preparedAt: now, issuedAt: now,
      });
      issue = await ctx.db.get(issueId);
    }
    if (!issue) throw new Error("Proposal issue could not be recorded");
    await ctx.db.insert("transactionalDocumentDeliveryAttempts", {
      companyId: proposal.companyId, documentKind: "proposal", documentId: String(proposal._id),
      issueId: String(issue._id), channel: "owner_reported_outside_send",
      attemptedAt: now, resultAt: now, result: "owner_reported",
    });
    await ctx.db.patch(args.proposalId, {
      status: "sent",
      sentAt: proposal.sentAt ?? now,
      currentIssueId: issue._id,
      proposalTokenHash: undefined,
      proposalTokenCreatedAt: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(proposal.clientRequestId, {
      leadStage: "proposal_sent",
      lastStageChangedAt: now,
    });
  },
});

export const markProposalAccepted = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.sessionToken, args.userId, args.proposalId);
    if (proposal.status === "accepted" || proposal.status === "declined") throw new Error("Finalized proposals are immutable");
    if (proposal.pendingDeliveryAttemptId) throw new Error("A proposal delivery attempt is still pending");
    assertProposalReadyForDelivery(proposal);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      status: "accepted",
      acceptedAt: now,
      responseIssueId: proposal.currentIssueId,
      responseSource: "owner_reported",
      updatedAt: now,
    });
    await ctx.db.patch(proposal.clientRequestId, {
      leadStage: "accepted",
      lastStageChangedAt: now,
    });
    await notifyProposalDecision(ctx, proposal, "accepted", "owner_reported", args.userId);
  },
});

export const addCatalogAddOnLine = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), proposalId: v.id("proposals"), companyAddOnId: v.id("companyAddOns"), billingCadence: v.union(v.literal("one_time"), v.literal("monthly")) },
  handler: async (ctx, args) => {
    const { owner, proposal } = await getOwnedProposal(ctx, args.sessionToken, args.userId, args.proposalId); requireDraft(proposal);
    const item = await ctx.db.get(args.companyAddOnId);
    if (!item || item.companyId !== owner.companyId || !item.isActive || item.archivedAt !== undefined) throw new Error("Catalog add-on is unavailable");
    const line = normalizeProposalAddOnLine({ lineItemId: newProposalLineItemId(), sourceType: "catalog", sourceCompanyAddOnId: item._id, name: item.name, pricingMethod: item.pricingMethod, unitPriceCents: item.priceCents, unitLabel: item.unitLabel, quantity: item.pricingMethod === "per_unit" ? 1 : undefined, billingCadence: args.billingCadence });
    await ctx.db.patch(proposal._id, { addOnLineItems: validateProposalAddOnLines([...(proposal.addOnLineItems ?? []), line]), updatedAt: Date.now() });
    return line.lineItemId;
  },
});

const editableLineArgs = { name: v.string(), pricingMethod: v.union(v.literal("flat"), v.literal("starting_at"), v.literal("per_unit")), unitPriceCents: v.number(), unitLabel: v.optional(v.string()), quantity: v.optional(v.number()), finalizedPriceCents: v.optional(v.number()), billingCadence: v.union(v.literal("one_time"), v.literal("monthly")) };

export const addCustomAddOnLine = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), proposalId: v.id("proposals"), ...editableLineArgs },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.sessionToken, args.userId, args.proposalId); requireDraft(proposal);
    const line = normalizeProposalAddOnLine({ lineItemId: newProposalLineItemId(), sourceType: "custom", name: args.name, pricingMethod: args.pricingMethod, unitPriceCents: args.unitPriceCents, unitLabel: args.unitLabel, quantity: args.quantity, finalizedPriceCents: args.finalizedPriceCents, billingCadence: args.billingCadence });
    await ctx.db.patch(proposal._id, { addOnLineItems: validateProposalAddOnLines([...(proposal.addOnLineItems ?? []), line]), updatedAt: Date.now() });
    return line.lineItemId;
  },
});

export const updateAddOnLine = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), proposalId: v.id("proposals"), lineItemId: v.string(), ...editableLineArgs },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.sessionToken, args.userId, args.proposalId); requireDraft(proposal);
    const existing: any = (proposal.addOnLineItems ?? []).find((line: any) => line.lineItemId === args.lineItemId);
    if (!existing) throw new Error("Proposal add-on line not found");
    const updated = normalizeProposalAddOnLine({ ...existing, name: args.name, pricingMethod: args.pricingMethod, unitPriceCents: args.unitPriceCents, unitLabel: args.unitLabel, quantity: args.quantity, finalizedPriceCents: args.finalizedPriceCents, billingCadence: args.billingCadence });
    const lines = (proposal.addOnLineItems ?? []).map((line: any) => line.lineItemId === args.lineItemId ? updated : line);
    await ctx.db.patch(proposal._id, { addOnLineItems: validateProposalAddOnLines(lines as any), updatedAt: Date.now() });
  },
});

export const removeAddOnLine = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), proposalId: v.id("proposals"), lineItemId: v.string() },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.sessionToken, args.userId, args.proposalId); requireDraft(proposal);
    const lines = (proposal.addOnLineItems ?? []).filter((line: any) => line.lineItemId !== args.lineItemId);
    if (lines.length === (proposal.addOnLineItems ?? []).length) throw new Error("Proposal add-on line not found");
    await ctx.db.patch(proposal._id, { addOnLineItems: lines, updatedAt: Date.now() });
  },
});

export const returnProposalToDraft = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.sessionToken, args.userId, args.proposalId);
    if (proposal.status !== "sent") throw new Error("Only sent proposals can return to draft");
    if (proposal.pendingDeliveryAttemptId) throw new Error("A proposal delivery attempt is still pending");
    const now = Date.now();
    if (proposal.currentIssueId) {
      const issue = await ctx.db.get(proposal.currentIssueId);
      if (!issue || issue.companyId !== proposal.companyId || issue.proposalId !== proposal._id) throw new Error("Active proposal issue is invalid");
      await ctx.db.patch(issue._id, { withdrawnAt: now });
    }
    await ctx.db.patch(proposal._id, { status: "draft", currentIssueId: undefined, sentAt: undefined, proposalTokenHash: undefined, proposalTokenCreatedAt: undefined, updatedAt: now });
  },
});

export const markProposalDeclined = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.sessionToken, args.userId, args.proposalId);
    if (proposal.status === "accepted" || proposal.status === "declined") throw new Error("Finalized proposals are immutable");
    if (proposal.pendingDeliveryAttemptId) throw new Error("A proposal delivery attempt is still pending");
    const request = await ctx.db.get(proposal.clientRequestId) as Doc<"clientRequests"> | null;
    const now = Date.now();
    const requestPatch: Record<string, unknown> = {
      leadStage: "declined",
      lastStageChangedAt: now,
    };
    if (request && request.status !== "converted") requestPatch.status = "declined";

    await ctx.db.patch(args.proposalId, {
      status: "declined",
      declinedAt: now,
      responseIssueId: proposal.currentIssueId,
      responseSource: "owner_reported",
      updatedAt: now,
    });
    await ctx.db.patch(proposal.clientRequestId, requestPatch);
    await notifyProposalDecision(ctx, proposal, "declined", "owner_reported", args.userId);
  },
});
