import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireOwner } from "../lib/helpers";

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

async function getOwnedProposal(
  ctx: MutationCtx,
  userId: Id<"users">,
  proposalId: Id<"proposals">
) {
  const owner = await requireOwner(ctx, userId);
  const proposal = await ctx.db.get(proposalId);
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, proposal: proposal as Doc<"proposals"> };
}

/** Create an owner-only draft proposal from a lead. Pricing is intentionally blank. */
export const createProposalFromLead = mutation({
  args: {
    userId: v.id("users"),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

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

    const now = Date.now();
    const proposalId = await ctx.db.insert("proposals", {
      companyId: request.companyId,
      clientRequestId: request._id,
      createdByUserId: owner._id,
      title: "Cleaning Proposal",
      clientName: request.requesterName,
      businessName: cleanOptional((request as any).businessName, 200),
      propertyAddress: cleanOptional(request.propertySnapshot?.address, 500),
      serviceFrequency: (request as any).estimatedFrequency,
      serviceFrequencyNotes: cleanOptional((request as any).estimatedFrequencyNotes, 1000),
      scopeOfWork: cleanOptional(request.requestedService, 4000),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

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
    const { proposal } = await getOwnedProposal(ctx, args.userId, args.proposalId);
    if (proposal.status === "accepted" || proposal.status === "declined") {
      throw new Error("Accepted or declined proposals cannot be edited");
    }

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
      updatedAt: Date.now(),
    });
  },
});

export const markProposalSent = mutation({
  args: { userId: v.id("users"), proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.userId, args.proposalId);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      status: "sent",
      sentAt: proposal.sentAt ?? now,
      updatedAt: now,
    });
    await ctx.db.patch(proposal.clientRequestId, {
      leadStage: "proposal_sent",
      lastStageChangedAt: now,
    });
  },
});

export const markProposalAccepted = mutation({
  args: { userId: v.id("users"), proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.userId, args.proposalId);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      status: "accepted",
      acceptedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(proposal.clientRequestId, {
      leadStage: "accepted",
      lastStageChangedAt: now,
    });
  },
});

export const markProposalDeclined = mutation({
  args: { userId: v.id("users"), proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    const { proposal } = await getOwnedProposal(ctx, args.userId, args.proposalId);
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
      updatedAt: now,
    });
    await ctx.db.patch(proposal.clientRequestId, requestPatch);
  },
});
