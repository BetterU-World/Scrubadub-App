import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const PROPOSAL_TOKEN_EXPIRY_MS = 60 * 24 * 60 * 60 * 1000;
const PROPOSAL_LINK_UNAVAILABLE_ERROR = "Proposal link unavailable or expired";

function proposalTokenIsExpired(proposal: any, now = Date.now()) {
  return (
    typeof proposal.proposalTokenCreatedAt !== "number" ||
    now - proposal.proposalTokenCreatedAt >= PROPOSAL_TOKEN_EXPIRY_MS
  );
}

function formatFrequency(value: string | undefined) {
  const labels: Record<string, string> = {
    one_time: "One-time",
    weekly: "Weekly",
    biweekly: "Biweekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    custom: "Custom",
  };
  return value ? labels[value] ?? value : null;
}

function formatCents(cents: number | undefined) {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function cleanNote(value: string | undefined, max = 1000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

async function companyBranding(ctx: any, companyId: any) {
  const [company, site] = await Promise.all([
    ctx.db.get(companyId),
    ctx.db
      .query("companySites")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
      .first(),
  ]);

  return {
    companyName:
      site?.brandName ??
      company?.companyDisplayName ??
      company?.name ??
      "Your Cleaning Company",
    companyLogoUrl: site?.logoUrl ?? null,
    companyEmail: site?.publicEmail ?? company?.contactEmail ?? null,
    companyPhone: site?.publicPhone ?? company?.contactPhone ?? null,
  };
}

async function safeWalkthroughSummary(ctx: any, proposal: any) {
  const walkthroughs = await ctx.db
    .query("walkthroughs")
    .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposal._id))
    .collect();

  const walkthrough = walkthroughs
    .filter(
      (item: any) =>
        item.companyId === proposal.companyId &&
        item.status !== "archived" &&
        (item.proposalNotes ||
          item.serviceFrequencyRecommendation ||
          item.estimatedHours ||
          item.squareFootage)
    )
    .sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];

  if (!walkthrough) return null;

  return {
    title: walkthrough.title,
    walkthroughType: walkthrough.walkthroughType,
    squareFootage: walkthrough.squareFootage ?? null,
    estimatedHours: walkthrough.estimatedHours ?? null,
    serviceFrequencyRecommendation:
      walkthrough.serviceFrequencyRecommendation ?? null,
    proposalNotes: walkthrough.proposalNotes ?? null,
  };
}

async function safeProposalPayload(ctx: any, proposal: any) {
  const [request, relationship, branding, walkthroughSummary] = await Promise.all([
    ctx.db.get(proposal.clientRequestId),
    proposal.clientRelationshipId ? ctx.db.get(proposal.clientRelationshipId) : null,
    companyBranding(ctx, proposal.companyId),
    safeWalkthroughSummary(ctx, proposal),
  ]);

  return {
    company: branding,
    recipientEmail:
      relationship?.companyId === proposal.companyId
        ? relationship.email ?? request?.requesterEmail ?? null
        : request?.requesterEmail ?? null,
    clientName: proposal.clientName,
    proposal: {
      title: proposal.title,
      businessName: proposal.businessName ?? null,
      propertyAddress: proposal.propertyAddress ?? request?.propertySnapshot?.address ?? null,
      requestedDate: request?.requestedDate ?? null,
      serviceFrequency: proposal.serviceFrequency ?? null,
      serviceFrequencyLabel: formatFrequency(proposal.serviceFrequency),
      serviceFrequencyNotes: proposal.serviceFrequencyNotes ?? null,
      scopeOfWork: proposal.scopeOfWork ?? null,
      notes: proposal.notes ?? null,
      monthlyPriceCents: proposal.monthlyPriceCents ?? null,
      monthlyPriceLabel: formatCents(proposal.monthlyPriceCents),
      oneTimePriceCents: proposal.oneTimePriceCents ?? null,
      oneTimePriceLabel: formatCents(proposal.oneTimePriceCents),
      status: proposal.status,
      sentAt: proposal.sentAt ?? null,
      acceptedAt: proposal.acceptedAt ?? null,
      declinedAt: proposal.declinedAt ?? null,
      proposalResponseNote: proposal.proposalResponseNote ?? null,
    },
    walkthroughSummary,
  };
}

function clientProposalPayload(payload: any) {
  return {
    company: payload.company,
    clientName: payload.clientName,
    proposal: payload.proposal,
    walkthroughSummary: payload.walkthroughSummary,
  };
}

export const getProposalForOwnerDelivery = internalQuery({
  args: {
    companyId: v.id("companies"),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.companyId !== args.companyId) throw new Error("Access denied");
    if (proposal.status === "accepted" || proposal.status === "declined") {
      throw new Error("Accepted or declined proposals cannot be sent");
    }

    return await safeProposalPayload(ctx, proposal);
  },
});

export const setProposalDeliveryTokenAndSent = internalMutation({
  args: {
    companyId: v.id("companies"),
    proposalId: v.id("proposals"),
    proposalTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.companyId !== args.companyId) throw new Error("Access denied");
    if (proposal.status === "accepted" || proposal.status === "declined") {
      throw new Error("Accepted or declined proposals cannot be sent");
    }

    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      status: "sent",
      sentAt: proposal.sentAt ?? now,
      proposalTokenHash: args.proposalTokenHash,
      proposalTokenCreatedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(proposal.clientRequestId, {
      leadStage: "proposal_sent",
      lastStageChangedAt: now,
    });

    return { sentAt: proposal.sentAt ?? now };
  },
});

export const getClientProposalByTokenHash = internalQuery({
  args: { proposalTokenHash: v.string() },
  handler: async (ctx, args) => {
    const proposal = await ctx.db
      .query("proposals")
      .withIndex("by_proposalTokenHash", (q) =>
        q.eq("proposalTokenHash", args.proposalTokenHash)
      )
      .first();

    if (!proposal || proposalTokenIsExpired(proposal)) return null;
    return clientProposalPayload(await safeProposalPayload(ctx, proposal));
  },
});

export const respondToProposalByTokenHash = internalMutation({
  args: {
    proposalTokenHash: v.string(),
    decision: v.union(v.literal("accepted"), v.literal("declined")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db
      .query("proposals")
      .withIndex("by_proposalTokenHash", (q) =>
        q.eq("proposalTokenHash", args.proposalTokenHash)
      )
      .first();

    if (!proposal || proposalTokenIsExpired(proposal)) {
      throw new Error(PROPOSAL_LINK_UNAVAILABLE_ERROR);
    }
    if (proposal.status === "accepted" || proposal.status === "declined") {
      return clientProposalPayload(await safeProposalPayload(ctx, proposal));
    }
    if (proposal.status !== "sent") {
      throw new Error("This proposal is not ready for response");
    }

    const now = Date.now();
    if (args.decision === "accepted") {
      await ctx.db.patch(proposal._id, {
        status: "accepted",
        acceptedAt: now,
        proposalResponseNote: cleanNote(args.note),
        updatedAt: now,
      });
      await ctx.db.patch(proposal.clientRequestId, {
        leadStage: "accepted",
        lastStageChangedAt: now,
      });
    } else {
      const request = await ctx.db.get(proposal.clientRequestId);
      const requestPatch: Record<string, unknown> = {
        leadStage: "declined",
        lastStageChangedAt: now,
      };
      if (request && request.status !== "converted") requestPatch.status = "declined";

      await ctx.db.patch(proposal._id, {
        status: "declined",
        declinedAt: now,
        proposalResponseNote: cleanNote(args.note),
        updatedAt: now,
      });
      await ctx.db.patch(proposal.clientRequestId, requestPatch);
    }

    const updated = await ctx.db.get(proposal._id);
    return clientProposalPayload(await safeProposalPayload(ctx, updated));
  },
});
