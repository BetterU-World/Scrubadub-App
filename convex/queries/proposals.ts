import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { calculateProposalTotals } from "../lib/proposalAddOnLineItems";
import { safeProposalPayload } from "../proposalDeliveryInternal";
import { proposalIssueContent } from "../lib/proposalIssueContent";

async function decorateProposal(ctx: any, proposal: any) {
  const issueId = ["accepted", "declined"].includes(proposal.status)
    ? proposal.responseIssueId ?? proposal.currentIssueId : proposal.currentIssueId;
  const issue = issueId ? await ctx.db.get(issueId) : null;
  const validIssue = issue && issue.companyId === proposal.companyId && issue.proposalId === proposal._id &&
    !issue.withdrawnAt && issue.issuedAt ? issue : null;
  const priorIssue = await ctx.db.query("proposalIssues")
    .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposal._id)).first();
  const source = proposal.sourceWalkthroughId ? await ctx.db.get(proposal.sourceWalkthroughId) : null;
  const savedContent = validIssue ? null : proposalIssueContent(await safeProposalPayload(ctx, proposal));
  const relationship = proposal.clientRelationshipId
    ? await ctx.db.get(proposal.clientRelationshipId)
    : null;
  const latestDeliveryAttempt = await ctx.db.query("transactionalDocumentDeliveryAttempts")
    .withIndex("by_document", (q: any) => q.eq("documentKind", "proposal").eq("documentId", String(proposal._id)))
    .order("desc").first();
  return {
    ...proposal,
    canonicalPreview: {
      source: validIssue ? "issued_snapshot" : proposal.status === "draft" ? "saved_draft" : "legacy_current",
      content: validIssue?.content ?? savedContent,
      issueNumber: validIssue?.issueNumber ?? null,
    },
    hasPriorIssue: Boolean(priorIssue),
    sourceAssessment: source && source.companyId === proposal.companyId && source.clientRequestId === proposal.clientRequestId
      ? { title: source.title, completedAt: source.completedAt ?? null } : null,
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
