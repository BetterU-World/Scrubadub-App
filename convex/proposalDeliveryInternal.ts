import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { resolveOperationalEmailIdentity } from "./lib/operationalEmailIdentity";
import { assertProposalReadyForDelivery, calculateProposalTotals, proposalAddOnLineAmount } from "./lib/proposalAddOnLineItems";
import { proposalIssueContent } from "./lib/proposalIssueContent";

const PROPOSAL_TOKEN_EXPIRY_MS = 60 * 24 * 60 * 60 * 1000;
const PENDING_DELIVERY_RECOVERY_MS = 5 * 60 * 1000;
const PROPOSAL_LINK_UNAVAILABLE_ERROR = "Proposal link unavailable or expired";

function proposalTokenIsExpired(proposal: any, now = Date.now()) {
  return (
    typeof proposal.proposalTokenCreatedAt !== "number" ||
    now - proposal.proposalTokenCreatedAt >= PROPOSAL_TOKEN_EXPIRY_MS
  );
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
  return value ? labels[value] ?? value : null;
}

function formatCents(cents: number | undefined) {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function cleanNote(value: string | undefined, max = 1000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

async function companyBranding(ctx: any, companyId: any) {
  const [company, site, emailIdentity] = await Promise.all([
    ctx.db.get(companyId),
    ctx.db
      .query("companySites")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
      .first(),
    resolveOperationalEmailIdentity(ctx, companyId),
  ]);

  return {
    companyName:
      site?.brandName ??
      company?.companyDisplayName ??
      company?.name ??
      "Your Cleaning Company",
    companyLogoUrl: site?.logoUrl ?? null,
    companyEmail: site?.publicEmail ?? company?.contactEmail ?? null,
    companyPhone: site?.publicPhone ?? company?.contactPhone ?? null,
    replyTo: emailIdentity.replyTo ?? null,
  };
}

export async function safeProposalPayload(ctx: any, proposal: any) {
  const [request, relationship, branding] = await Promise.all([
    ctx.db.get(proposal.clientRequestId),
    proposal.clientRelationshipId ? ctx.db.get(proposal.clientRelationshipId) : null,
    companyBranding(ctx, proposal.companyId),
  ]);

  const totals = calculateProposalTotals(proposal);
  const addOnLineItems = (proposal.addOnLineItems ?? []).map((line: any) => ({
    name: line.name,
    pricingMethod: line.pricingMethod,
    unitPriceCents: line.unitPriceCents,
    unitPriceLabel: formatCents(line.unitPriceCents),
    unitLabel: line.unitLabel ?? null,
    quantity: line.quantity ?? null,
    finalizedPriceCents: line.finalizedPriceCents ?? null,
    finalizedPriceLabel: formatCents(line.finalizedPriceCents),
    billingCadence: line.billingCadence,
    lineTotalCents: proposalAddOnLineAmount(line),
    lineTotalLabel: formatCents(proposalAddOnLineAmount(line) ?? undefined),
  }));
  return {
    company: branding,
    recipientEmail:
      relationship?.companyId === proposal.companyId
        ? relationship.email ?? request?.requesterEmail ?? null
        : request?.requesterEmail ?? null,
    clientName: proposal.clientName,
    proposal: {
      title: proposal.title,
      businessName: proposal.businessName ?? null,
      propertyAddress: proposal.propertyAddress ?? null,
      serviceFrequency: proposal.serviceFrequency ?? null,
      serviceFrequencyLabel: formatFrequency(proposal.serviceFrequency),
      serviceFrequencyNotes: proposal.serviceFrequencyNotes ?? null,
      scopeOfWork: proposal.scopeOfWork ?? null,
      notes: proposal.notes ?? null,
      monthlyPriceCents: proposal.monthlyPriceCents ?? null,
      monthlyPriceLabel: formatCents(proposal.monthlyPriceCents),
      oneTimePriceCents: proposal.oneTimePriceCents ?? null,
      oneTimePriceLabel: formatCents(proposal.oneTimePriceCents),
      addOnLineItems,
      totals: {
        ...totals,
        monthlyTotalLabel: totals.hasMonthlyPricing ? formatCents(totals.monthlyTotalCents) : null,
        oneTimeTotalLabel: totals.hasOneTimePricing ? formatCents(totals.oneTimeTotalCents) : null,
      },
      status: proposal.status,
      sentAt: proposal.sentAt ?? null,
      acceptedAt: proposal.acceptedAt ?? null,
      declinedAt: proposal.declinedAt ?? null,
      proposalResponseNote: proposal.proposalResponseNote ?? null,
    },
  };
}

function issuedPayload(issue: any, proposal: any) {
  return {
    ...issue.content,
    proposal: {
      ...issue.content.proposal,
      status: proposal.status,
      sentAt: proposal.sentAt ?? null,
      acceptedAt: proposal.acceptedAt ?? null,
      declinedAt: proposal.declinedAt ?? null,
      proposalResponseNote: proposal.proposalResponseNote ?? null,
    },
  };
}

async function nextIssueNumber(ctx: any, proposalId: any) {
  const latest = await ctx.db.query("proposalIssues")
    .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
    .order("desc").first();
  return (latest?.issueNumber ?? 0) + 1;
}

function issueTokenExpired(issue: any, now = Date.now()) {
  return !issue.tokenCreatedAt || now - issue.tokenCreatedAt >= PROPOSAL_TOKEN_EXPIRY_MS;
}

/** Prepare and lock in one transaction, before making an external provider call. */
export const prepareProposalEmail = internalMutation({
  args: {
    companyId: v.id("companies"), proposalId: v.id("proposals"),
    tokenNonce: v.string(), tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.companyId !== args.companyId) throw new Error("Access denied");
    if (proposal.status === "accepted" || proposal.status === "declined") throw new Error("Accepted or declined proposals cannot be sent");
    const now = Date.now();
    const previousAttempt = proposal.pendingDeliveryAttemptId
      ? await ctx.db.get(proposal.pendingDeliveryAttemptId) : null;
    const stalePending = previousAttempt?.result === "pending" && now - previousAttempt.attemptedAt >= PENDING_DELIVERY_RECOVERY_MS;
    if (proposal.pendingDeliveryAttemptId && (!previousAttempt ||
      (previousAttempt.result !== "unknown" && !stalePending) ||
      previousAttempt.companyId !== args.companyId || previousAttempt.documentId !== String(proposal._id))) {
      throw new Error("A proposal delivery attempt is still pending");
    }
    if (stalePending && previousAttempt) await ctx.db.patch(previousAttempt._id, { result: "unknown", resultAt: now });
    assertProposalReadyForDelivery(proposal);
    const currentPayload = await safeProposalPayload(ctx, proposal);
    const recipientEmail = currentPayload.recipientEmail?.trim().toLowerCase();
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      throw new Error("Add a valid client email before sending this proposal");
    }
    let issue = previousAttempt
      ? await ctx.db.get(previousAttempt.issueId as any) as any
      : proposal.currentIssueId ? await ctx.db.get(proposal.currentIssueId) : null;
    if (issue && (issue.companyId !== args.companyId || issue.proposalId !== proposal._id || issue.withdrawnAt ||
      (!issue.issuedAt && !previousAttempt))) {
      throw new Error("Active proposal issue is invalid");
    }
    if (proposal.status === "draft" && issue && !previousAttempt) throw new Error("Draft proposal cannot have an active issue");
    if (!issue) {
      const issueId = await ctx.db.insert("proposalIssues", {
        companyId: args.companyId, proposalId: proposal._id,
        issueNumber: await nextIssueNumber(ctx, proposal._id),
        content: proposalIssueContent(currentPayload),
        preparedAt: now, tokenNonce: args.tokenNonce, tokenHash: args.tokenHash,
        tokenCreatedAt: now,
      });
      issue = await ctx.db.get(issueId);
    } else if (!issue.tokenNonce || issueTokenExpired(issue, now)) {
      await ctx.db.patch(issue._id, { tokenNonce: args.tokenNonce, tokenHash: args.tokenHash, tokenCreatedAt: now });
      issue = await ctx.db.get(issue._id);
    }
    if (!issue) throw new Error("Proposal issue could not be prepared");
    const attemptId = await ctx.db.insert("transactionalDocumentDeliveryAttempts", {
      companyId: args.companyId, documentKind: "proposal", documentId: String(proposal._id),
      issueId: String(issue._id), channel: "email", recipientEmail,
      attemptedAt: now, result: "pending",
    });
    await ctx.db.patch(proposal._id, { pendingDeliveryAttemptId: attemptId, updatedAt: now });
    return {
      attemptId, issueId: issue._id, tokenNonce: issue.tokenNonce!,
      recipientEmail, replyTo: currentPayload.company.replyTo,
      content: issue.content,
    };
  },
});

export const finishProposalEmail = internalMutation({
  args: {
    companyId: v.id("companies"), proposalId: v.id("proposals"),
    attemptId: v.id("transactionalDocumentDeliveryAttempts"),
    result: v.union(v.literal("provider_accepted"), v.literal("failed"), v.literal("unknown")),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    const attempt = await ctx.db.get(args.attemptId);
    if (!proposal || proposal.companyId !== args.companyId || !attempt || attempt.companyId !== args.companyId ||
      attempt.documentKind !== "proposal" || attempt.documentId !== String(proposal._id) ||
      proposal.pendingDeliveryAttemptId !== attempt._id || attempt.result !== "pending") throw new Error("Delivery attempt is no longer current");
    const issue = await ctx.db.get(attempt.issueId as any) as any;
    if (!issue || issue.proposalId !== proposal._id || issue.companyId !== args.companyId || issue.withdrawnAt) throw new Error("Proposal issue is no longer current");
    const now = Date.now();
    await ctx.db.patch(attempt._id, { result: args.result, resultAt: now });
    if (args.result === "unknown") return { sentAt: proposal.sentAt ?? null };
    if (args.result === "failed") {
      if (!issue.issuedAt) await ctx.db.patch(issue._id, { withdrawnAt: now });
      await ctx.db.patch(proposal._id, { pendingDeliveryAttemptId: undefined, updatedAt: now });
      return { sentAt: proposal.sentAt ?? null };
    }
    if (!issue.issuedAt) await ctx.db.patch(issue._id, { issuedAt: now });
    const wasDraft = proposal.status === "draft";
    await ctx.db.patch(proposal._id, {
      status: wasDraft ? "sent" : proposal.status,
      sentAt: proposal.sentAt ?? now,
      currentIssueId: issue._id,
      pendingDeliveryAttemptId: undefined,
      proposalTokenHash: undefined,
      proposalTokenCreatedAt: undefined,
      updatedAt: now,
    });
    if (wasDraft) await ctx.db.patch(proposal.clientRequestId, { leadStage: "proposal_sent", lastStageChangedAt: now });
    return { sentAt: proposal.sentAt ?? now };
  },
});

function clientProposalPayload(payload: any) {
  return {
    company: payload.company,
    clientName: payload.clientName,
    proposal: payload.proposal,
  };
}

export const getProposalForOwnerDelivery = internalQuery({
  args: {
    companyId: v.id("companies"),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.companyId !== args.companyId) throw new Error("Access denied");
    if (proposal.status === "accepted" || proposal.status === "declined") {
      throw new Error("Accepted or declined proposals cannot be sent");
    }
    assertProposalReadyForDelivery(proposal);

    return await safeProposalPayload(ctx, proposal);
  },
});

export const getClientProposalByTokenHash = internalQuery({
  args: { proposalTokenHash: v.string() },
  handler: async (ctx, args) => {
    const issue = await ctx.db.query("proposalIssues")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.proposalTokenHash))
      .first();
    if (issue) {
      const proposal = await ctx.db.get(issue.proposalId);
      if (!proposal || proposal.companyId !== issue.companyId || proposal.currentIssueId !== issue._id ||
        issue.withdrawnAt || !issue.issuedAt || issueTokenExpired(issue) || proposal.status === "draft") return null;
      return issuedPayload(issue, proposal);
    }
    const proposal = await ctx.db
      .query("proposals")
      .withIndex("by_proposalTokenHash", (q) =>
        q.eq("proposalTokenHash", args.proposalTokenHash)
      )
      .first();

    if (!proposal || proposal.currentIssueId || proposalTokenIsExpired(proposal) || proposal.status === "draft") return null;
    return clientProposalPayload(await safeProposalPayload(ctx, proposal));
  },
});

export const respondToProposalByTokenHash = internalMutation({
  args: {
    proposalTokenHash: v.string(),
    decision: v.union(v.literal("accepted"), v.literal("declined")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.query("proposalIssues")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.proposalTokenHash))
      .first();
    if (issue) {
      const proposal = await ctx.db.get(issue.proposalId);
      if (!proposal || proposal.companyId !== issue.companyId || proposal.currentIssueId !== issue._id ||
        issue.withdrawnAt || !issue.issuedAt || issueTokenExpired(issue)) throw new Error(PROPOSAL_LINK_UNAVAILABLE_ERROR);
      if (proposal.status === "accepted" || proposal.status === "declined") return issuedPayload(issue, proposal);
      if (proposal.status !== "sent") throw new Error("This proposal is not ready for response");
      const now = Date.now();
      if (args.decision === "accepted") {
        assertProposalReadyForDelivery(proposal);
        await ctx.db.patch(proposal._id, {
          status: "accepted", acceptedAt: now, responseIssueId: issue._id,
          responseSource: "client_token", proposalResponseNote: cleanNote(args.note), updatedAt: now,
        });
        await ctx.db.patch(proposal.clientRequestId, { leadStage: "accepted", lastStageChangedAt: now });
      } else {
        const request = await ctx.db.get(proposal.clientRequestId);
        const requestPatch: Record<string, unknown> = { leadStage: "declined", lastStageChangedAt: now };
        if (request && request.status !== "converted") requestPatch.status = "declined";
        await ctx.db.patch(proposal._id, {
          status: "declined", declinedAt: now, responseIssueId: issue._id,
          responseSource: "client_token", proposalResponseNote: cleanNote(args.note), updatedAt: now,
        });
        await ctx.db.patch(proposal.clientRequestId, requestPatch);
      }
      return issuedPayload(issue, await ctx.db.get(proposal._id));
    }
    const proposal = await ctx.db
      .query("proposals")
      .withIndex("by_proposalTokenHash", (q) =>
        q.eq("proposalTokenHash", args.proposalTokenHash)
      )
      .first();

    if (!proposal || proposal.currentIssueId || proposalTokenIsExpired(proposal)) {
      throw new Error(PROPOSAL_LINK_UNAVAILABLE_ERROR);
    }
    if (proposal.status === "accepted" || proposal.status === "declined") {
      return clientProposalPayload(await safeProposalPayload(ctx, proposal));
    }
    if (proposal.status !== "sent") {
      throw new Error("This proposal is not ready for response");
    }

    const now = Date.now();
    if (args.decision === "accepted") {
      assertProposalReadyForDelivery(proposal);
      await ctx.db.patch(proposal._id, {
        status: "accepted",
        acceptedAt: now,
        proposalResponseNote: cleanNote(args.note),
        responseSource: "client_token",
        updatedAt: now,
      });
      await ctx.db.patch(proposal.clientRequestId, {
        leadStage: "accepted",
        lastStageChangedAt: now,
      });
    } else {
      const request = await ctx.db.get(proposal.clientRequestId);
      const requestPatch: Record<string, unknown> = {
        leadStage: "declined",
        lastStageChangedAt: now,
      };
      if (request && request.status !== "converted") requestPatch.status = "declined";

      await ctx.db.patch(proposal._id, {
        status: "declined",
        declinedAt: now,
        proposalResponseNote: cleanNote(args.note),
        responseSource: "client_token",
        updatedAt: now,
      });
      await ctx.db.patch(proposal.clientRequestId, requestPatch);
    }

    const updated = await ctx.db.get(proposal._id);
    return clientProposalPayload(await safeProposalPayload(ctx, updated));
  },
});
