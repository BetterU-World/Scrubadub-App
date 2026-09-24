import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireActiveClientRelationship, requireOwnerOrManagerCapability, requireVerifiedClientSession } from "../lib/sessionAuth";
import { ensureClientRelationshipForLead } from "../lib/clientRelationships";
import { createNotification } from "../lib/helpers";
import {
  buildServiceAgreementMergeValues,
  FALLBACK_SERVICE_AGREEMENT_TEMPLATE,
  renderDocumentTemplate,
} from "../lib/documentMergeFields";
import { copyAcceptedProposalAddOnSnapshots, formatAgreementAddOnLines } from "../lib/acceptedProposalAddOnSnapshots";
import { calculateProposalTotals } from "../lib/proposalAddOnLineItems";
import { activeServiceAgreementIssue, assertAgreementPriceConsistency, buildServiceAgreementIssueContent, renderStructuredAgreementBody } from "../lib/serviceAgreementIssuedContent";
import { approvedServiceAgreementTemplate, approvedServiceAgreementTemplates } from "../lib/serviceAgreementTemplates";

const agreementFields = {
  title: v.string(),
  clientName: v.optional(v.string()),
  propertyAddress: v.optional(v.string()),
  servicesIncluded: v.optional(v.string()),
  priceSummary: v.optional(v.string()),
  billingSchedule: v.optional(v.string()),
  specialInstructions: v.optional(v.string()),
  exceptions: v.optional(v.string()),
  body: v.optional(v.string()),
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

async function requireOwnerCompany(ctx: any, sessionToken: string, userId: any) {
  const user = await requireOwnerOrManagerCapability(
    ctx, sessionToken, userId, "canManageSalesAndCommercial"
  );
  if (!user.companyId) throw new Error("Company access required");
  return user;
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
  return value ? labels[value] ?? value : "";
}

function formatCents(cents: number | undefined) {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function cleanOptional(value: string | undefined, max = 4000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanNote(value: string | undefined, max = 1000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanRequired(value: string, fallback: string, max = 200) {
  return value.trim().slice(0, max) || fallback;
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function cleanAmount(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error("Agreement amount must be a non-negative whole-cent value");
  }
  if (value > 1_000_000_000) throw new Error("Agreement amount is too large");
  return value;
}

async function getDefaultServiceAgreementTemplate(ctx: any, companyId: any) {
  const templates = await approvedServiceAgreementTemplates(ctx, companyId);
  return templates.find((template: any) => template.isDefault) ?? null;
}

async function getAgreementWalkthrough(ctx: any, companyId: any, proposal: any) {
  if (proposal.sourceWalkthroughId) {
    const source = await ctx.db.get(proposal.sourceWalkthroughId);
    return source?.companyId === companyId && source.clientRequestId === proposal.clientRequestId
      ? source
      : null;
  }
  const [proposalWalkthroughs, leadWalkthroughs] = await Promise.all([
    ctx.db
      .query("walkthroughs")
      .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposal._id))
      .collect(),
    ctx.db
      .query("walkthroughs")
      .withIndex("by_clientRequest", (q: any) =>
        q.eq("clientRequestId", proposal.clientRequestId)
      )
      .collect(),
  ]);

  return [...proposalWalkthroughs, ...leadWalkthroughs]
    .filter((walkthrough: any) => walkthrough.companyId === companyId && walkthrough.status !== "archived")
    .sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
}

function buildAgreementPatch(args: any) {
  return {
    title: cleanRequired(args.title, "Commercial Service Agreement", 200),
    clientName: cleanOptional(args.clientName, 200),
    propertyAddress: cleanOptional(args.propertyAddress, 500),
    servicesIncluded: cleanOptional(args.servicesIncluded, 6000),
    priceSummary: cleanOptional(args.priceSummary, 500),
    billingSchedule: cleanOptional(args.billingSchedule, 1000),
    specialInstructions: cleanOptional(args.specialInstructions, 4000),
    exceptions: cleanOptional(args.exceptions, 4000),
    body: cleanOptional(args.body, 20000),
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

async function getOwnedAgreement(ctx: any, sessionToken: string, userId: any, agreementId: any) {
  const owner = await requireOwnerCompany(ctx, sessionToken, userId);
  const agreement = await ctx.db.get(agreementId);
  if (!agreement) throw new Error("Service agreement not found");
  if (agreement.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, agreement };
}

async function getClientOwnedAgreement(ctx: any, clientUser: any, agreementId: any) {
  const agreement = await ctx.db.get(agreementId);
  if (!agreement?.clientRelationshipId) throw new Error("Agreement not found");

  const relationship = await requireActiveClientRelationship(
    ctx,
    clientUser,
    agreement.clientRelationshipId
  );
  if (
    relationship.companyId !== agreement.companyId
  ) {
    throw new Error("Access denied");
  }

  return { clientUser, agreement };
}

async function assertCurrentClientIssue(ctx: any, agreement: any, renderedIssueId: any) {
  if (!agreement.currentIssueId) {
    if (renderedIssueId) throw new Error("This agreement has been updated; reload before responding");
    return; // Legacy sent agreement, with no invented historical issue.
  }
  if (renderedIssueId !== agreement.currentIssueId) {
    throw new Error("This agreement has been updated; reload before responding");
  }
  const issue = await ctx.db.get(agreement.currentIssueId);
  if (!issue || issue.agreementId !== agreement._id || issue.companyId !== agreement.companyId ||
    !issue.issuedAt || issue.withdrawnAt) {
    throw new Error("This agreement is no longer available for response");
  }
}

async function notifyOwnerOfAgreementResponse(
  ctx: any,
  agreement: any,
  type: "service_agreement_accepted" | "service_agreement_declined",
  title: string,
  message: string
) {
  const owner = await ctx.db
    .query("users")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", agreement.companyId))
    .filter((q: any) => q.eq(q.field("role"), "owner"))
    .first();

  if (!owner) return;
  await createNotification(ctx, {
    companyId: agreement.companyId,
    userId: owner._id,
    type,
    title,
    message,
    relatedClientRequestId: agreement.clientRequestId,
  });
}

export const createDraftFromAcceptedProposal = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const companyId = owner.companyId!;
    const { proposal, snapshots } = await copyAcceptedProposalAddOnSnapshots(ctx, args.proposalId, companyId);

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

    const request: any = await ctx.db.get(proposal.clientRequestId);
    if (!request) throw new Error("Lead not found");
    if (request.companyId !== companyId) throw new Error("Access denied");

    const [template, propertyResult, walkthrough] = await Promise.all([
      getDefaultServiceAgreementTemplate(ctx, companyId),
      request.propertyId ? ctx.db.get(request.propertyId) : null,
      getAgreementWalkthrough(ctx, companyId, proposal),
    ]);
    const property: any = propertyResult;
    const now = Date.now();
    const clientRelationshipId =
      (account as any)?.clientRelationshipId ??
      (proposal as any).clientRelationshipId ??
      await ensureClientRelationshipForLead(ctx, request);
    const relationship: any = clientRelationshipId ? await ctx.db.get(clientRelationshipId) : null;
    const clientName = firstText(
      proposal.businessName,
      relationship?.businessName,
      relationship?.displayName,
      proposal.clientName,
      request.requesterName
    );
    const propertyAddress = firstText(
      proposal.propertyAddress,
      (account as any)?.serviceAddress,
      property?.address,
      walkthrough?.address,
      request.propertySnapshot?.address
    );
    const totals = calculateProposalTotals(proposal);
    const priceParts = [
      totals.hasMonthlyPricing ? `${formatCents(totals.monthlyTotalCents)} per month` : undefined,
      totals.hasOneTimePricing ? `${formatCents(totals.oneTimeTotalCents)} one-time` : undefined,
    ].filter(Boolean);
    const priceSummary = priceParts.length ? priceParts.join(" + ") : undefined;
    const contractAmountCents = totals.hasMonthlyPricing && !totals.hasOneTimePricing
      ? totals.monthlyTotalCents
      : totals.hasOneTimePricing && !totals.hasMonthlyPricing
        ? totals.oneTimeTotalCents
        : undefined;
    const servicesIncluded = firstText(
      proposal.scopeOfWork,
      request.requestedService
    );
    const billingSchedule = [totals.hasMonthlyPricing ? "Monthly" : undefined, totals.hasOneTimePricing ? "One-time" : undefined].filter(Boolean).join(" + ") || undefined;
    const effectiveStartDate = request.requestedDate ?? undefined;
    const serviceFrequency =
      proposal.serviceFrequency ?? (request as any).estimatedFrequency ?? undefined;
    const specialInstructions = firstText(proposal.notes);
    const exceptions = "None specified";
    const templateBody = template?.body ?? FALLBACK_SERVICE_AGREEMENT_TEMPLATE;
    const mergeValues = await buildServiceAgreementMergeValues(ctx, companyId, {
      clientName,
      propertyAddress,
      serviceFrequency: formatFrequency(serviceFrequency),
      priceSummary,
      billingSchedule,
      effectiveStartDate,
      servicesIncluded,
      specialInstructions,
      exceptions,
      scopeOfWork: proposal.scopeOfWork,
      paymentTerms: billingSchedule,
      addOnLineItems: formatAgreementAddOnLines(snapshots),
    }, new Date(now));
    const body = renderDocumentTemplate(
      templateBody,
      mergeValues
    );
    const agreementId = await (ctx.db as any).insert("serviceAgreements", {
      companyId,
      clientRelationshipId,
      proposalId: proposal._id,
      clientRequestId: proposal.clientRequestId,
      commercialAccountId: account?._id,
      templateId: template?._id,
      templateNameAtGeneration: template?.name ?? "SCRUB default service agreement",
      templateVersionAtGeneration: template?.version,
      templateBody,
      contentMode: "structured",
      title: `${proposal.businessName || proposal.clientName} Service Agreement`,
      status: "draft",
      agreementType: "commercial_cleaning",
      clientName,
      propertyAddress,
      servicesIncluded,
      priceSummary,
      billingSchedule,
      specialInstructions,
      exceptions,
      body,
      effectiveStartDate,
      serviceFrequency,
      contractAmountCents,
      paymentTerms: billingSchedule,
      scopeOfWork: proposal.scopeOfWork,
      notes: proposal.notes,
      acceptedProposalAddOnSnapshots: snapshots,
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
    sessionToken: v.string(),
    agreementId: v.id("serviceAgreements"),
    ...agreementFields,
  },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    if (!["draft", "ready"].includes(agreement.status)) {
      throw new Error("Make changes before editing a sent agreement; signed or cancelled agreements cannot be edited");
    }
    if (agreement.pendingDeliveryAttemptId) throw new Error("An agreement delivery attempt is still pending");
    const patch = buildAgreementPatch(args);
    if (agreement.contentMode === "structured") {
      patch.body = await renderStructuredAgreementBody(ctx, { ...agreement, ...patch, body: agreement.body });
    }
    await ctx.db.patch(args.agreementId, {
      ...patch,
      updatedAt: Date.now(),
    });
  },
});

/** Explicitly replace only the copied template snapshot. Named authoring fields are preserved. */
export const applyApprovedTemplate = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), agreementId: v.id("serviceAgreements"), templateId: v.id("documentTemplates") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    if (agreement.contentMode !== "structured" || !["draft", "ready"].includes(agreement.status) ||
      agreement.currentIssueId || agreement.pendingDeliveryAttemptId) {
      throw new Error("Only an editable structured agreement can apply a template");
    }
    const template = await approvedServiceAgreementTemplate(ctx, agreement.companyId, args.templateId);
    const next = { ...agreement, templateId: template._id, templateNameAtGeneration: template.name,
      templateVersionAtGeneration: template.version, templateBody: template.body };
    await ctx.db.patch(agreement._id, {
      templateId: template._id, templateNameAtGeneration: template.name,
      templateVersionAtGeneration: template.version, templateBody: template.body,
      body: await renderStructuredAgreementBody(ctx, next), updatedAt: Date.now(),
    });
  },
});

/** Rebuild the derived body from saved fields and the agreement's copied text. */
export const regenerateFromTemplateSnapshot = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    if (agreement.contentMode !== "structured" || !agreement.templateBody ||
      !["draft", "ready"].includes(agreement.status) || agreement.currentIssueId || agreement.pendingDeliveryAttemptId) {
      throw new Error("Only an editable structured agreement can regenerate content");
    }
    await ctx.db.patch(agreement._id, {
      body: await renderStructuredAgreementBody(ctx, agreement), updatedAt: Date.now(),
    });
  },
});

export const markReady = mutation({
  args: { userId: v.id("users"),
    sessionToken: v.string(), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    if (!["draft", "ready"].includes(agreement.status) || agreement.pendingDeliveryAttemptId) {
      throw new Error("Only an editable agreement can be marked ready");
    }
    const now = Date.now();
    await (ctx.db as any).patch(args.agreementId, {
      status: "ready",
      readyAt: agreement.readyAt ?? now,
      updatedAt: now,
    });
  },
});

export const markSent = mutation({
  args: { userId: v.id("users"),
    sessionToken: v.string(), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    if (agreement.status === "signed" || agreement.status === "cancelled") {
      throw new Error("Signed or cancelled agreements cannot be marked sent");
    }
    if (agreement.pendingDeliveryAttemptId) throw new Error("An agreement delivery attempt is still pending");
    const now = Date.now();
    let issue: any = agreement.currentIssueId ? await ctx.db.get(agreement.currentIssueId) : null;
    if (agreement.currentIssueId && (!issue || issue.agreementId !== agreement._id ||
      issue.companyId !== agreement.companyId || !issue.issuedAt || issue.withdrawnAt)) {
      throw new Error("Active agreement issue is invalid");
    }
    if (!issue) {
      assertAgreementPriceConsistency(agreement);
      const latest = await ctx.db.query("serviceAgreementIssues")
        .withIndex("by_agreement", (q) => q.eq("agreementId", agreement._id)).order("desc").first();
      const issueId = await ctx.db.insert("serviceAgreementIssues", {
        companyId: agreement.companyId, agreementId: agreement._id,
        issueNumber: (latest?.issueNumber ?? 0) + 1,
        content: await buildServiceAgreementIssueContent(ctx, agreement),
        templateId: agreement.templateId,
        templateName: agreement.templateNameAtGeneration,
        templateVersion: agreement.templateVersionAtGeneration,
        preparedAt: now, issuedAt: now,
      });
      issue = await ctx.db.get(issueId);
    }
    if (!issue) throw new Error("Agreement issue could not be recorded");
    await ctx.db.insert("transactionalDocumentDeliveryAttempts", {
      companyId: agreement.companyId, documentKind: "service_agreement",
      documentId: String(agreement._id), issueId: String(issue._id),
      channel: "owner_reported_outside_send", attemptedAt: now,
      resultAt: now, result: "owner_reported",
    });
    await ctx.db.patch(args.agreementId, {
      status: "sent",
      sentAt: agreement.sentAt ?? now,
      currentIssueId: issue._id,
      updatedAt: now,
    });
  },
});

export const returnToDraft = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    if (agreement.status !== "sent") throw new Error("Only sent agreements can be changed");
    if (agreement.pendingDeliveryAttemptId) throw new Error("An agreement delivery attempt is still pending");
    const now = Date.now();
    if (agreement.currentIssueId) {
      const issue: any = await ctx.db.get(agreement.currentIssueId);
      if (!issue || issue.agreementId !== agreement._id || issue.companyId !== agreement.companyId ||
        !issue.issuedAt || issue.withdrawnAt) throw new Error("Active agreement issue is invalid");
      await ctx.db.patch(issue._id, { withdrawnAt: now });
    }
    await ctx.db.patch(agreement._id, { status: "draft", currentIssueId: undefined, sentAt: undefined, readyAt: undefined, updatedAt: now });
  },
});

export const markSigned = mutation({
  args: { userId: v.id("users"),
    sessionToken: v.string(), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    if (agreement.status === "cancelled") {
      throw new Error("Cancelled agreements cannot be signed");
    }
    if (agreement.pendingDeliveryAttemptId) throw new Error("An agreement delivery attempt is still pending");
    const now = Date.now();
    if (agreement.currentIssueId && !await activeServiceAgreementIssue(ctx, agreement)) {
      throw new Error("Active agreement issue is invalid");
    }
    await ctx.db.patch(args.agreementId, {
      status: "signed",
      signedAt: agreement.signedAt ?? now,
      signedReceivedIssueId: agreement.currentIssueId,
      signedReceivedRecordedByUserId: args.userId,
      signedReceivedSource: "owner_reported_external",
      updatedAt: now,
    });
  },
});

export const markCancelled = mutation({
  args: { userId: v.id("users"),
    sessionToken: v.string(), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    if (agreement.status === "signed") {
      throw new Error("Signed agreements cannot be cancelled");
    }
    if (agreement.pendingDeliveryAttemptId) throw new Error("An agreement delivery attempt is still pending");
    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "cancelled",
      cancelledAt: agreement.cancelledAt ?? now,
      updatedAt: now,
    });
  },
});

export const clientAccept = mutation({
  args: {
    clientUserId: v.id("clientUsers"),
    sessionToken: v.string(),
    agreementId: v.id("serviceAgreements"),
    issueId: v.optional(v.id("serviceAgreementIssues")),
  },
  handler: async (ctx, args) => {
    const clientUser = await requireVerifiedClientSession(ctx, args.sessionToken, args.clientUserId);
    const { agreement } = await getClientOwnedAgreement(
      ctx,
      clientUser,
      args.agreementId
    );
    if (agreement.status !== "sent") {
      throw new Error("This agreement is not ready for response");
    }
    await assertCurrentClientIssue(ctx, agreement, args.issueId);

    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "signed",
      clientRespondedAt: now,
      acknowledgedAt: now,
      acknowledgedIssueId: agreement.currentIssueId,
      acknowledgedByClientUserId: clientUser._id,
      updatedAt: now,
    });

    await notifyOwnerOfAgreementResponse(
      ctx,
      agreement,
      "service_agreement_accepted",
      "Service agreement acknowledged",
      `${clientUser.displayName} acknowledged ${agreement.title}. This is not an electronic signature.`
    );
  },
});

export const clientDecline = mutation({
  args: {
    clientUserId: v.id("clientUsers"),
    sessionToken: v.string(),
    agreementId: v.id("serviceAgreements"),
    issueId: v.optional(v.id("serviceAgreementIssues")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clientUser = await requireVerifiedClientSession(ctx, args.sessionToken, args.clientUserId);
    const { agreement } = await getClientOwnedAgreement(
      ctx,
      clientUser,
      args.agreementId
    );
    if (agreement.status !== "sent") {
      throw new Error("This agreement is not ready for response");
    }
    await assertCurrentClientIssue(ctx, agreement, args.issueId);

    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "cancelled",
      declinedAt: agreement.declinedAt ?? now,
      cancelledAt: agreement.cancelledAt ?? now,
      clientResponseNote: cleanNote(args.note),
      clientRespondedAt: now,
      declinedIssueId: agreement.currentIssueId,
      declinedByClientUserId: clientUser._id,
      updatedAt: now,
    });

    await notifyOwnerOfAgreementResponse(
      ctx,
      agreement,
      "service_agreement_declined",
      "Service agreement declined",
      `${clientUser.displayName} declined ${agreement.title}.`
    );
  },
});
