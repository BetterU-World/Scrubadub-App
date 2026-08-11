import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireVerifiedClientSession } from "../lib/sessionAuth";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";

async function requireOwnerCompany(ctx: any, sessionToken: string, userId: any) {
  const user = await requireOwnerOrManagerCapability(
    ctx, sessionToken, userId, "canManageSalesAndCommercial"
  );
  if (!user.companyId) throw new Error("Company access required");
  return user;
}

async function getOwnedAgreement(ctx: any, sessionToken: string, userId: any, agreementId: any) {
  const owner = await requireOwnerCompany(ctx, sessionToken, userId);
  const agreement = await ctx.db.get(agreementId);
  if (!agreement) return null;
  if (agreement.companyId !== owner.companyId) throw new Error("Access denied");
  return agreement;
}

async function decorateAgreement(ctx: any, agreement: any) {
  const relationship = agreement.clientRelationshipId
    ? await ctx.db.get(agreement.clientRelationshipId)
    : null;
  return {
    ...agreement,
    clientRelationship:
      relationship?.companyId === agreement.companyId
        ? {
            _id: relationship._id,
            displayName: relationship.displayName,
            businessName: relationship.businessName,
            clientType: relationship.clientType,
            status: relationship.status,
          }
        : null,
  };
}

export const getById = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    agreementId: v.id("serviceAgreements"),
  },
  handler: async (ctx, args) => {
    const agreement = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    return agreement ? await decorateAgreement(ctx, agreement) : null;
  },
});

export const getByProposal = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) return null;
    if (proposal.companyId !== owner.companyId) throw new Error("Access denied");

    const agreement = await ctx.db
      .query("serviceAgreements")
      .withIndex("by_proposal", (q) => q.eq("proposalId", args.proposalId))
      .first();

    if (!agreement) return null;
    if (agreement.companyId !== owner.companyId) throw new Error("Access denied");
    return await decorateAgreement(ctx, agreement);
  },
});

export const getByCommercialAccount = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    commercialAccountId: v.id("commercialAccounts"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const account = await ctx.db.get(args.commercialAccountId);
    if (!account) return null;
    if (account.companyId !== owner.companyId) throw new Error("Access denied");

    const agreement = account.serviceAgreementId
      ? await ctx.db.get(account.serviceAgreementId)
      : await ctx.db
          .query("serviceAgreements")
          .withIndex("by_commercialAccount", (q) =>
            q.eq("commercialAccountId", args.commercialAccountId)
          )
          .first();

    if (!agreement) return null;
    if (agreement.companyId !== owner.companyId) throw new Error("Access denied");
    return await decorateAgreement(ctx, agreement);
  },
});

async function clientRelationshipIds(ctx: any, clientUserId: any) {
  const relationships = await ctx.db
    .query("clientRelationships")
    .withIndex("by_clientUserId", (q: any) => q.eq("clientUserId", clientUserId))
    .collect();

  return new Set(
    relationships
      .filter((relationship: any) => relationship.status === "active")
      .map((relationship: any) => String(relationship._id))
  );
}

async function clientAgreementPayload(ctx: any, agreement: any) {
  const company = await ctx.db.get(agreement.companyId);
  const site = await ctx.db
    .query("companySites")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", agreement.companyId))
    .first();
  return {
    _id: agreement._id,
    companyName: company?.companyDisplayName ?? company?.name ?? "Your Cleaning Company",
    companyEmail: site?.publicEmail ?? company?.contactEmail ?? null,
    title: agreement.title,
    status: agreement.status,
    clientName: agreement.clientName,
    propertyAddress: agreement.propertyAddress,
    servicesIncluded: agreement.servicesIncluded,
    serviceFrequency: agreement.serviceFrequency,
    contractAmountCents: agreement.contractAmountCents,
    priceSummary: agreement.priceSummary,
    billingSchedule: agreement.billingSchedule,
    effectiveStartDate: agreement.effectiveStartDate,
    specialInstructions: agreement.specialInstructions,
    exceptions: agreement.exceptions,
    body: agreement.body,
    sentAt: agreement.sentAt,
    signedAt: agreement.signedAt,
    clientRespondedAt: agreement.clientRespondedAt,
    declinedAt: agreement.declinedAt,
    clientResponseNote: agreement.clientResponseNote,
    committedAddOns: (agreement.acceptedProposalAddOnSnapshots ?? []).map((line: any) => ({
      snapshotId: line.snapshotId,
      name: line.name,
      pricingMethod: line.pricingMethod,
      unitPriceCents: line.unitPriceCents,
      unitLabel: line.unitLabel ?? null,
      quantity: line.quantity ?? null,
      finalizedPriceCents: line.finalizedPriceCents ?? null,
      lineTotalCents: line.lineTotalCents,
      billingCadence: line.billingCadence,
    })),
  };
}

export const listForClient = query({
  args: {
    clientUserId: v.id("clientUsers"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const clientUser = await requireVerifiedClientSession(ctx, args.sessionToken, args.clientUserId);
    const relationshipIds = await clientRelationshipIds(ctx, clientUser._id);
    if (relationshipIds.size === 0) return [];

    const relationships = await ctx.db
      .query("clientRelationships")
      .withIndex("by_clientUserId", (q: any) => q.eq("clientUserId", clientUser._id))
      .collect();
    const companyIds = Array.from(new Set(relationships.map((item: any) => String(item.companyId))));
    const agreements: any[] = [];

    for (const companyId of companyIds) {
      const companyAgreements = await ctx.db
        .query("serviceAgreements")
        .withIndex("by_company", (q: any) => q.eq("companyId", companyId))
        .collect();
      agreements.push(
        ...companyAgreements.filter(
          (agreement: any) =>
            agreement.clientRelationshipId &&
            relationshipIds.has(String(agreement.clientRelationshipId)) &&
            ["sent", "signed", "cancelled"].includes(agreement.status)
        )
      );
    }

    agreements.sort((a, b) => (b.sentAt ?? b.updatedAt) - (a.sentAt ?? a.updatedAt));
    return await Promise.all(agreements.map((agreement) => clientAgreementPayload(ctx, agreement)));
  },
});

export const getForClient = query({
  args: {
    clientUserId: v.id("clientUsers"),
    sessionToken: v.string(),
    agreementId: v.id("serviceAgreements"),
  },
  handler: async (ctx, args) => {
    const clientUser = await requireVerifiedClientSession(ctx, args.sessionToken, args.clientUserId);
    const relationshipIds = await clientRelationshipIds(ctx, clientUser._id);
    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement || !agreement.clientRelationshipId) return null;
    if (!relationshipIds.has(String(agreement.clientRelationshipId))) return null;
    if (!["sent", "signed", "cancelled"].includes(agreement.status)) return null;
    return await clientAgreementPayload(ctx, agreement);
  },
});
