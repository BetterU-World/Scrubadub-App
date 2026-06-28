import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

async function requireOwnerCompany(ctx: any, userId: any) {
  const user = await getSessionUser(ctx, userId);
  if (user.role !== "owner" || !user.companyId) {
    throw new Error("Owner access required");
  }
  return user;
}

async function getOwnedAgreement(ctx: any, userId: any, agreementId: any) {
  const owner = await requireOwnerCompany(ctx, userId);
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
    agreementId: v.id("serviceAgreements"),
  },
  handler: async (ctx, args) => {
    const agreement = await getOwnedAgreement(ctx, args.userId, args.agreementId);
    return agreement ? await decorateAgreement(ctx, agreement) : null;
  },
});

export const getByProposal = query({
  args: {
    userId: v.id("users"),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
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
    commercialAccountId: v.id("commercialAccounts"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
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
