import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireActiveClientRelationship, requireOwnerSession, requireVerifiedClientSession } from "../lib/sessionAuth";
import { ensureClientRelationshipForLead } from "../lib/clientRelationships";
import { createNotification } from "../lib/helpers";
import {
  buildServiceAgreementMergeValues,
  FALLBACK_SERVICE_AGREEMENT_TEMPLATE,
  renderDocumentTemplate,
} from "../lib/documentMergeFields";

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
  const user = await requireOwnerSession(ctx, sessionToken, userId);
  if (user.role !== "owner" || !user.companyId) {
    throw new Error("Owner access required");
  }
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
  const template = await (ctx.db as any)
    .query("documentTemplates")
    .withIndex("by_company_type_default", (q: any) =>
      q.eq("companyId", companyId).eq("type", "service_agreement").eq("isDefault", true)
    )
    .first();

  return template?.companyId === companyId ? template : null;
}

async function getLatestAgreementWalkthrough(ctx: any, companyId: any, proposal: any) {
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

    const [template, property, walkthrough] = await Promise.all([
      getDefaultServiceAgreementTemplate(ctx, companyId),
      request.propertyId ? ctx.db.get(request.propertyId) : null,
      getLatestAgreementWalkthrough(ctx, companyId, proposal),
    ]);
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
    const contractAmountCents = proposal.monthlyPriceCents ?? proposal.oneTimePriceCents;
    const priceSummary =
      proposal.monthlyPriceCents != null
        ? `${formatCents(proposal.monthlyPriceCents)} per month`
        : proposal.oneTimePriceCents != null
          ? `${formatCents(proposal.oneTimePriceCents)} one-time`
          : undefined;
    const servicesIncluded = firstText(
      proposal.scopeOfWork,
      walkthrough?.proposalNotes,
      walkthrough?.scopeNotes,
      walkthrough?.serviceFrequencyRecommendation,
      request.requestedService,
      request.notes
    );
    const billingSchedule =
      proposal.monthlyPriceCents != null
        ? "Monthly"
        : proposal.oneTimePriceCents != null
          ? "One-time"
          : undefined;
    const effectiveStartDate = request.requestedDate ?? undefined;
    const serviceFrequency =
      proposal.serviceFrequency ?? (request as any).estimatedFrequency ?? undefined;
    const specialInstructions = firstText(
      proposal.notes,
      walkthrough?.accessNotes,
      (request as any).leadNotes,
      request.notes
    );
    const exceptions = "None specified";
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
    });
    const body = renderDocumentTemplate(
      template?.body ?? FALLBACK_SERVICE_AGREEMENT_TEMPLATE,
      mergeValues
    );
    const agreementId = await (ctx.db as any).insert("serviceAgreements", {
      companyId,
      clientRelationshipId,
      proposalId: proposal._id,
      clientRequestId: proposal.clientRequestId,
      commercialAccountId: account?._id,
      templateId: template?._id,
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
    if (agreement.status === "signed" || agreement.status === "cancelled") {
      throw new Error("Signed or cancelled agreements cannot be edited");
    }

    await ctx.db.patch(args.agreementId, {
      ...buildAgreementPatch(args),
      updatedAt: Date.now(),
    });
  },
});

export const markReady = mutation({
  args: { userId: v.id("users"),
    sessionToken: v.string(), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const { agreement } = await getOwnedAgreement(ctx, args.sessionToken, args.userId, args.agreementId);
    if (agreement.status === "signed" || agreement.status === "cancelled") {
      throw new Error("Signed or cancelled agreements cannot be marked ready");
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
    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "sent",
      sentAt: agreement.sentAt ?? now,
      updatedAt: now,
    });
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
    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "signed",
      signedAt: agreement.signedAt ?? now,
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

    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "signed",
      signedAt: agreement.signedAt ?? now,
      signerName: clientUser.displayName,
      clientRespondedAt: now,
      updatedAt: now,
    });

    await notifyOwnerOfAgreementResponse(
      ctx,
      agreement,
      "service_agreement_accepted",
      "Service agreement accepted",
      `${clientUser.displayName} accepted ${agreement.title}.`
    );
  },
});

export const clientDecline = mutation({
  args: {
    clientUserId: v.id("clientUsers"),
    sessionToken: v.string(),
    agreementId: v.id("serviceAgreements"),
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

    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "cancelled",
      declinedAt: agreement.declinedAt ?? now,
      cancelledAt: agreement.cancelledAt ?? now,
      clientResponseNote: cleanNote(args.note),
      clientRespondedAt: now,
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
