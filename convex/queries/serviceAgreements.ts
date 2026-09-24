import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireVerifiedClientSession } from "../lib/sessionAuth";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { activeServiceAgreementIssue, buildServiceAgreementIssueContent } from "../lib/serviceAgreementIssuedContent";
import { serviceAgreementPortalAccess } from "../lib/serviceAgreementPortalAccess";
import { buildAgreementAuthoringReview } from "../lib/serviceAgreementAuthoring";
import { approvedServiceAgreementTemplate } from "../lib/serviceAgreementTemplates";

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
  const priorIssue = await ctx.db.query("serviceAgreementIssues")
    .withIndex("by_agreement", (q: any) => q.eq("agreementId", agreement._id)).first();
  const relationship = agreement.clientRelationshipId
    ? await ctx.db.get(agreement.clientRelationshipId)
    : null;
  const latestDeliveryAttempt = await ctx.db.query("transactionalDocumentDeliveryAttempts")
    .withIndex("by_document", (q: any) => q.eq("documentKind", "service_agreement").eq("documentId", String(agreement._id)))
    .order("desc").first();
  const canonicalPreview = (await activeServiceAgreementIssue(ctx, agreement))?.content ??
    (agreement.currentIssueId ? null : await buildServiceAgreementIssueContent(ctx, agreement));
  const portalAccess = await serviceAgreementPortalAccess(ctx, agreement);
  return {
    ...agreement,
    hasPriorIssue: Boolean(priorIssue),
    canonicalPreview,
    authoringReview: canonicalPreview ? await buildAgreementAuthoringReview(ctx, agreement, canonicalPreview, portalAccess) : null,
    latestDeliveryAttempt: latestDeliveryAttempt?.companyId === agreement.companyId
      ? { channel: latestDeliveryAttempt.channel, result: latestDeliveryAttempt.result, attemptedAt: latestDeliveryAttempt.attemptedAt }
      : null,
    portalAccess,
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

/** Preview a deliberate template replacement without changing the saved draft. */
export const previewTemplateApplication = query({
  args: { userId: v.id("users"), sessionToken: v.string(), agreementId: v.id("serviceAgreements"), templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const agreement = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    if (!agreement || agreement.contentMode !== "structured" || !["draft", "ready"].includes(agreement.status) ||
      agreement.currentIssueId || agreement.pendingDeliveryAttemptId) {
      throw new Error("Only an editable structured agreement can preview a template");
    }
    const template = await approvedServiceAgreementTemplate(ctx, agreement.companyId, args.templateId);
    const candidate = { ...agreement, templateId: template._id, templateNameAtGeneration: template.name,
      templateVersionAtGeneration: template.version, templateBody: template.body };
    const canonicalPreview = await buildServiceAgreementIssueContent(ctx, candidate);
    const portalAccess = await serviceAgreementPortalAccess(ctx, candidate);
    return { canonicalPreview, authoringReview: await buildAgreementAuthoringReview(ctx, candidate, canonicalPreview, portalAccess, "template_candidate") };
  },
});

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
  const issue = await activeServiceAgreementIssue(ctx, agreement);
  if (agreement.currentIssueId && !issue) return null;
  const content = issue?.content ?? await buildServiceAgreementIssueContent(ctx, agreement);
  return {
    _id: agreement._id,
    ...content,
    issueId: issue?._id ?? null,
    status: agreement.status,
    sentAt: agreement.sentAt,
    signedAt: agreement.signedAt,
    externalSignedReceiptWithoutIssue: agreement.signedReceivedSource === "owner_reported_external" && !issue,
    acknowledgedAt: agreement.acknowledgedAt,
    clientRespondedAt: agreement.clientRespondedAt,
    declinedAt: agreement.declinedAt,
    clientResponseNote: agreement.clientResponseNote,
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
            String(agreement.companyId) === String(companyId) &&
            ["sent", "signed", "cancelled"].includes(agreement.status)
        )
      );
    }

    agreements.sort((a, b) => (b.sentAt ?? b.updatedAt) - (a.sentAt ?? a.updatedAt));
    return (await Promise.all(agreements.map((agreement) => clientAgreementPayload(ctx, agreement)))).filter(Boolean);
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
    const relationship = await ctx.db.get(agreement.clientRelationshipId);
    if (!relationship || relationship.companyId !== agreement.companyId) return null;
    if (!["sent", "signed", "cancelled"].includes(agreement.status)) {
      const priorIssue = await ctx.db.query("serviceAgreementIssues")
        .withIndex("by_agreement", (q) => q.eq("agreementId", agreement._id)).first();
      return priorIssue ? { _id: agreement._id, unavailable: true } : null;
    }
    return await clientAgreementPayload(ctx, agreement);
  },
});
