import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { getServiceAgreementPresentationStatus } from "../../packages/frontend/src/lib/serviceAgreementStatus";

const MAX_PER_TYPE = 150;
const documentType = v.union(v.literal("proposal"), v.literal("service_agreement"));

async function salesUser(ctx: any, args: { userId: any; sessionToken: string }) {
  return requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageSalesAndCommercial");
}

async function ownedIssue(ctx: any, issueId: any, parent: any, type: "proposal" | "service_agreement") {
  if (!issueId) return null;
  const issue = await ctx.db.get(issueId);
  const matches = type === "proposal" ? issue?.proposalId === parent._id : issue?.agreementId === parent._id;
  return matches && issue.companyId === parent.companyId && issue.issuedAt && !issue.withdrawnAt ? issue : null;
}

function proposalDate(proposal: any) {
  if (proposal.status === "accepted") return { date: proposal.acceptedAt ?? null, dateKind: "accepted" };
  if (proposal.status === "declined") return { date: proposal.declinedAt ?? null, dateKind: "declined" };
  if (proposal.status === "sent") return { date: proposal.sentAt ?? null, dateKind: "sent" };
  return { date: proposal.updatedAt, dateKind: "updated" };
}

function agreementDate(agreement: any, status: string) {
  if (status === "signed_received") return { date: agreement.signedAt ?? null, dateKind: "signed_received" };
  if (status === "acknowledged") return { date: agreement.acknowledgedAt ?? agreement.clientRespondedAt ?? null, dateKind: "acknowledged" };
  if (status === "declined") return { date: agreement.declinedAt ?? null, dateKind: "declined" };
  if (status === "cancelled") return { date: agreement.cancelledAt ?? null, dateKind: "cancelled" };
  if (status === "sent") return { date: agreement.sentAt ?? null, dateKind: "sent" };
  if (status === "ready") return { date: agreement.readyAt ?? null, dateKind: "ready" };
  return { date: agreement.updatedAt, dateKind: "updated" };
}

/** A bounded navigation projection. Domain records and immutable issues stay authoritative. */
export const listClientDocuments = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await salesUser(ctx, args);
    const [proposals, agreements] = await Promise.all([
      ctx.db.query("proposals").withIndex("by_companyId", (q) => q.eq("companyId", user.companyId)).order("desc").take(MAX_PER_TYPE + 1),
      ctx.db.query("serviceAgreements").withIndex("by_company", (q) => q.eq("companyId", user.companyId)).order("desc").take(MAX_PER_TYPE + 1),
    ]);
    const limited = proposals.length > MAX_PER_TYPE || agreements.length > MAX_PER_TYPE;
    const rows = await Promise.all([
      ...proposals.slice(0, MAX_PER_TYPE).map(async (proposal) => {
        const issueId = ["accepted", "declined"].includes(proposal.status)
          ? proposal.responseIssueId : proposal.currentIssueId;
        const issue = await ownedIssue(ctx, issueId, proposal, "proposal");
        const firstIssue = await ctx.db.query("proposalIssues")
          .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id)).first();
        const relationship = proposal.clientRelationshipId ? await ctx.db.get(proposal.clientRelationshipId) : null;
        const request = await ctx.db.get(proposal.clientRequestId);
        const safeRequest = request?.companyId === user.companyId ? request : null;
        const content = issue?.content;
        return {
          id: String(proposal._id), type: "proposal" as const,
          title: content?.proposal.title ?? proposal.title,
          clientName: content?.clientName ?? proposal.clientName,
          businessName: content?.proposal.businessName ?? proposal.businessName ?? (relationship?.companyId === user.companyId ? relationship.businessName : null),
          address: content?.proposal.propertyAddress ?? proposal.propertyAddress ?? safeRequest?.propertySnapshot?.address ?? null,
          status: proposal.status, issueNumber: issue?.issueNumber ?? null,
          hasHistory: firstIssue?.companyId === user.companyId && Boolean(firstIssue.issuedAt), provenance: issue ? "issued_snapshot" : proposal.status === "draft" ? "working" : "legacy_current",
          ...proposalDate(proposal),
          href: safeRequest ? `/requests/${proposal.clientRequestId}#request-proposal` : null,
          destination: "request" as const,
        };
      }),
      ...agreements.slice(0, MAX_PER_TYPE).map(async (agreement) => {
        const status = getServiceAgreementPresentationStatus(agreement);
        const responseIssueId = status === "declined" ? agreement.declinedIssueId
          : status === "signed_received" ? agreement.signedReceivedIssueId
          : status === "acknowledged" ? agreement.acknowledgedIssueId : null;
        const issue = await ownedIssue(ctx, responseIssueId ?? (["draft", "ready", "sent"].includes(status) ? agreement.currentIssueId : null), agreement, "service_agreement");
        const firstIssue = await ctx.db.query("serviceAgreementIssues")
          .withIndex("by_agreement", (q) => q.eq("agreementId", agreement._id)).first();
        const relationship = agreement.clientRelationshipId ? await ctx.db.get(agreement.clientRelationshipId) : null;
        const proposal = await ctx.db.get(agreement.proposalId);
        const requestId = agreement.clientRequestId ?? (proposal?.companyId === user.companyId ? proposal.clientRequestId : null);
        const request = requestId ? await ctx.db.get(requestId) : null;
        const safeRequestId = request?.companyId === user.companyId ? requestId : null;
        const account = agreement.commercialAccountId ? await ctx.db.get(agreement.commercialAccountId) : null;
        const safeAccountId = account?.companyId === user.companyId ? agreement.commercialAccountId : null;
        const content = issue?.content;
        return {
          id: String(agreement._id), type: "service_agreement" as const,
          title: content?.title ?? agreement.title,
          clientName: content?.clientName ?? agreement.clientName ?? (proposal?.companyId === user.companyId ? proposal.clientName : null) ?? null,
          businessName: relationship?.companyId === user.companyId ? relationship.businessName ?? relationship.displayName : null,
          address: content?.propertyAddress ?? agreement.propertyAddress ?? (safeRequestId ? request?.propertySnapshot?.address : null) ?? null,
          status, issueNumber: issue?.issueNumber ?? null,
          hasHistory: firstIssue?.companyId === user.companyId && Boolean(firstIssue.issuedAt), provenance: issue ? "issued_snapshot" : ["draft", "ready"].includes(status) ? "working" : "legacy_current",
          ...agreementDate(agreement, status),
          href: safeRequestId ? `/requests/${safeRequestId}#request-agreement` : safeAccountId ? `/commercial-accounts/${safeAccountId}` : null,
          destination: safeRequestId ? "request" as const : "account" as const,
        };
      }),
    ]);
    return { rows: rows.sort((a, b) => (b.date ?? 0) - (a.date ?? 0) || b.id.localeCompare(a.id)), limited };
  },
});

/** Read-only issue chronology, loaded only when a Hub row is expanded. */
export const getClientDocumentHistory = query({
  args: { userId: v.id("users"), sessionToken: v.string(), type: documentType, documentId: v.string() },
  handler: async (ctx, args) => {
    const user = await salesUser(ctx, args);
    const id = ctx.db.normalizeId(args.type === "proposal" ? "proposals" : "serviceAgreements", args.documentId);
    if (!id) throw new Error("Document unavailable");
    const parent: any = args.type === "proposal"
      ? await ctx.db.get(id as import("../_generated/dataModel").Id<"proposals">)
      : await ctx.db.get(id as import("../_generated/dataModel").Id<"serviceAgreements">);
    if (!parent || parent.companyId !== user.companyId) throw new Error("Document unavailable");
    const issues = args.type === "proposal"
      ? await ctx.db.query("proposalIssues").withIndex("by_proposal", (q) => q.eq("proposalId", id as import("../_generated/dataModel").Id<"proposals">)).order("desc").take(100)
      : await ctx.db.query("serviceAgreementIssues").withIndex("by_agreement", (q) => q.eq("agreementId", id as import("../_generated/dataModel").Id<"serviceAgreements">)).order("desc").take(100);
    return issues.filter((issue: any) => issue.companyId === user.companyId && issue.issuedAt).map((issue: any) => {
      const current = parent.currentIssueId === issue._id && !issue.withdrawnAt;
      const responded = args.type === "proposal"
        ? parent.responseIssueId === issue._id
        : parent.acknowledgedIssueId === issue._id || parent.declinedIssueId === issue._id || parent.signedReceivedIssueId === issue._id;
      const responseStatus = args.type === "proposal" ? responded ? parent.status : null
        : parent.declinedIssueId === issue._id ? "declined"
          : parent.signedReceivedIssueId === issue._id ? "signed_received"
            : parent.acknowledgedIssueId === issue._id ? "acknowledged" : null;
      return {
        issueNumber: issue.issueNumber, issuedAt: issue.issuedAt,
        title: args.type === "proposal" ? issue.content.proposal.title : issue.content.title,
        state: responseStatus ?? (current ? "current" : "previous"),
        responseAt: responseStatus === "accepted" ? parent.acceptedAt ?? null
          : responseStatus === "declined" ? parent.declinedAt ?? null
            : responseStatus === "acknowledged" ? parent.acknowledgedAt ?? null
              : responseStatus === "signed_received" ? parent.signedAt ?? null : null,
      };
    });
  },
});
