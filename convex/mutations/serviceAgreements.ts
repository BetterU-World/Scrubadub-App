import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";
import { ensureClientRelationshipForLead } from "../lib/clientRelationships";

const agreementFields = {
  title: v.string(),
  effectiveStartDate: v.optional(v.string()),
  effectiveEndDate: v.optional(v.string()),
  renewalDate: v.optional(v.string()),
  serviceFrequency: v.optional(v.string()),
  contractAmountCents: v.optional(v.number()),
  paymentTerms: v.optional(v.string()),
  scopeOfWork: v.optional(v.string()),
  terms: v.optional(v.string()),
  notes: v.optional(v.string()),
};

async function requireOwnerCompany(ctx: any, userId: any) {
  const user = await getSessionUser(ctx, userId);
  if (user.role !== "owner" || !user.companyId) {
    throw new Error("Owner access required");
  }
  return user;
}

function cleanOptional(value: string | undefined, max = 4000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanRequired(value: string, fallback: string, max = 200) {
  return value.trim().slice(0, max) || fallback;
}

function cleanAmount(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error("Agreement amount must be a non-negative whole-cent value");
  }
  if (value > 1_000_000_000) throw new Error("Agreement amount is too large");
  return value;
}

function buildAgreementPatch(args: any) {
  return {
    title: cleanRequired(args.title, "Commercial Service Agreement", 200),
    effectiveStartDate: cleanOptional(args.effectiveStartDate, 50),
    effectiveEndDate: cleanOptional(args.effectiveEndDate, 50),
    renewalDate: cleanOptional(args.renewalDate, 50),
    serviceFrequency: cleanOptional(args.serviceFrequency, 100),
    contractAmountCents: cleanAmount(args.contractAmountCents),
    paymentTerms: cleanOptional(args.paymentTerms, 1000),
    scopeOfWork: cleanOptional(args.scopeOfWork, 4000),
    terms: cleanOptional(args.terms, 4000),
    notes: cleanOptional(args.notes, 4000),
  };
}

async function getOwnedAgreement(ctx: any, userId: any, agreementId: any) {
  const owner = await requireOwnerCompany(ctx, userId);
  const agreement = await ctx.db.get(agreementId);
  if (!agreement) throw new Error("Service agreement not found");
  if (agreement.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, agreement };
}

export const createDraftFromAcceptedProposal = mutation({
  args: {
    userId: v.id("users"),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const companyId = owner.companyId!;
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.companyId !== companyId) throw new Error("Access denied");
    if (proposal.status !== "accepted") {
      throw new Error("Service agreements can only be created from accepted proposals");
    }

    const existing = await ctx.db
      .query("serviceAgreements")
      .withIndex("by_proposal", (q) => q.eq("proposalId", args.proposalId))
      .first();
    if (existing) return existing._id;

    const account = await ctx.db
      .query("commercialAccounts")
      .withIndex("by_sourceProposalId", (q) =>
        q.eq("sourceProposalId", args.proposalId)
      )
      .first();
    if (account && account.companyId !== companyId) throw new Error("Access denied");

    const request = await ctx.db.get(proposal.clientRequestId);
    if (!request) throw new Error("Lead not found");
    if (request.companyId !== companyId) throw new Error("Access denied");

    const now = Date.now();
    const clientRelationshipId =
      (account as any)?.clientRelationshipId ??
      (proposal as any).clientRelationshipId ??
      await ensureClientRelationshipForLead(ctx, request);
    const agreementId = await ctx.db.insert("serviceAgreements", {
      companyId,
      clientRelationshipId,
      proposalId: proposal._id,
      clientRequestId: proposal.clientRequestId,
      commercialAccountId: account?._id,
      title: `${proposal.businessName || proposal.clientName} Service Agreement`,
      status: "draft",
      agreementType: "commercial_cleaning",
      serviceFrequency: proposal.serviceFrequency,
      contractAmountCents: proposal.monthlyPriceCents ?? proposal.oneTimePriceCents,
      scopeOfWork: proposal.scopeOfWork,
      notes: proposal.notes,
      createdAt: now,
      updatedAt: now,
    });

    if (account && !account.serviceAgreementId) {
      await ctx.db.patch(account._id, {
        serviceAgreementId: agreementId,
        updatedAt: now,
      });
    }

    return agreementId;
  },
});

export const update = mutation({
  args: {
    userId: v.id("users"),
    agreementId: v.id("serviceAgreements"),
    ...agreementFields,
  },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.userId, args.agreementId);
    if (agreement.status === "signed" || agreement.status === "cancelled") {
      throw new Error("Signed or cancelled agreements cannot be edited");
    }

    await ctx.db.patch(args.agreementId, {
      ...buildAgreementPatch(args),
      updatedAt: Date.now(),
    });
  },
});

export const markSent = mutation({
  args: { userId: v.id("users"), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.userId, args.agreementId);
    if (agreement.status === "signed" || agreement.status === "cancelled") {
      throw new Error("Signed or cancelled agreements cannot be marked sent");
    }
    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "sent",
      sentAt: agreement.sentAt ?? now,
      updatedAt: now,
    });
  },
});

export const markSigned = mutation({
  args: { userId: v.id("users"), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.userId, args.agreementId);
    if (agreement.status === "cancelled") {
      throw new Error("Cancelled agreements cannot be signed");
    }
    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "signed",
      signedAt: agreement.signedAt ?? now,
      updatedAt: now,
    });
  },
});

export const markCancelled = mutation({
  args: { userId: v.id("users"), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.userId, args.agreementId);
    if (agreement.status === "signed") {
      throw new Error("Signed agreements cannot be cancelled");
    }
    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "cancelled",
      cancelledAt: agreement.cancelledAt ?? now,
      updatedAt: now,
    });
  },
});
