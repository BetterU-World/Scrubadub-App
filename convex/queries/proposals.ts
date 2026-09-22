import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { calculateProposalTotals } from "../lib/proposalAddOnLineItems";

async function decorateProposal(ctx: any, proposal: any) {
  const relationship = proposal.clientRelationshipId
    ? await ctx.db.get(proposal.clientRelationshipId)
    : null;
  const latestDeliveryAttempt = await ctx.db.query("transactionalDocumentDeliveryAttempts")
    .withIndex("by_document", (q: any) => q.eq("documentKind", "proposal").eq("documentId", String(proposal._id)))
    .order("desc").first();
  return {
    ...proposal,
    calculatedTotals: calculateProposalTotals(proposal),
    latestDeliveryAttempt: latestDeliveryAttempt?.companyId === proposal.companyId
      ? { channel: latestDeliveryAttempt.channel, result: latestDeliveryAttempt.result, attemptedAt: latestDeliveryAttempt.attemptedAt }
      : null,
    clientRelationship:
      relationship?.companyId === proposal.companyId
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

/**
 * Get the proposal for a client request.
 * Owner-only; verifies the request and proposal belong to the caller's company.
 */
export const getProposalByClientRequest = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerOrManagerCapability(
      ctx, args.sessionToken, args.userId, "canManageSalesAndCommercial"
    );

    const request = await ctx.db.get(args.clientRequestId);
    if (!request) return null;
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    const proposal = await ctx.db
      .query("proposals")
      .withIndex("by_clientRequestId", (q) =>
        q.eq("clientRequestId", args.clientRequestId)
      )
      .first();

    if (!proposal) return null;
    if (proposal.companyId !== owner.companyId) throw new Error("Access denied");

    return await decorateProposal(ctx, proposal);
  },
});
