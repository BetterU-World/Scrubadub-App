import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { resolveOperationalEmailIdentity } from "./lib/operationalEmailIdentity";
import { activeServiceAgreementIssue, assertAgreementPriceConsistency, buildServiceAgreementIssueContent } from "./lib/serviceAgreementIssuedContent";
import { requireAgreementEmailAccess, serviceAgreementPortalAccess } from "./lib/serviceAgreementPortalAccess";

const RESEND_COOLDOWN_MS = 60_000;
const PENDING_RECOVERY_MS = 5 * 60_000;

function formatFrequency(value: string | null | undefined) {
  const labels: Record<string, string> = {
    one_time: "One-time", weekly: "Weekly", biweekly: "Biweekly",
    monthly: "Monthly", quarterly: "Quarterly", custom: "Custom",
  };
  return value ? labels[value] ?? value : null;
}

async function deliveryContext(ctx: any, agreement: any) {
  const [access, emailIdentity] = await Promise.all([
    serviceAgreementPortalAccess(ctx, agreement),
    resolveOperationalEmailIdentity(ctx, agreement.companyId),
  ]);
  requireAgreementEmailAccess(access);
  const relationship = await ctx.db.get(agreement.clientRelationshipId);
  const clientUser = await ctx.db.get(relationship.clientUserId);
  return {
    recipientEmail: access.recipientEmail!,
    clientName: agreement.clientName ?? relationship.displayName,
    language: clientUser?.language === "es" ? "es" : "en",
    replyTo: emailIdentity.replyTo ?? null,
  };
}

async function latestAttempt(ctx: any, agreement: any) {
  return await ctx.db.query("transactionalDocumentDeliveryAttempts")
    .withIndex("by_document", (q: any) => q.eq("documentKind", "service_agreement").eq("documentId", String(agreement._id)))
    .order("desc").first();
}

async function assertCooldown(ctx: any, agreement: any, now: number) {
  const latest = await latestAttempt(ctx, agreement);
  if (latest?.result === "provider_accepted" && now - latest.attemptedAt < RESEND_COOLDOWN_MS) {
    throw new Error("This agreement was just sent. Please wait before sending again.");
  }
  // Older sent agreements have no attempt history. Keep their first-minute guard.
  if (!latest && agreement.sentAt && now - agreement.sentAt < RESEND_COOLDOWN_MS) {
    throw new Error("This agreement was just sent. Please wait before sending again.");
  }
}

function emailSummary(content: any) {
  return {
    title: content.title,
    propertyAddress: content.propertyAddress,
    serviceFrequencyLabel: formatFrequency(content.serviceFrequency),
    priceSummary: content.priceSummary,
    billingSchedule: content.billingSchedule ?? content.paymentTerms,
    effectiveStartDate: content.effectiveStartDate,
    committedAddOns: content.committedAddOns,
  };
}

export const getAgreementForOwnerDelivery = internalQuery({
  args: { companyId: v.id("companies"), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement) throw new Error("Service agreement not found");
    if (agreement.companyId !== args.companyId) throw new Error("Access denied");
    if (agreement.status === "signed" || agreement.status === "cancelled") throw new Error("Signed or cancelled agreements cannot be sent");
    await assertCooldown(ctx, agreement, Date.now());
    const recipient = await deliveryContext(ctx, agreement);
    const content = agreement.currentIssueId
      ? (await activeServiceAgreementIssue(ctx, agreement))?.content
      : await buildServiceAgreementIssueContent(ctx, agreement);
    if (!content) throw new Error("Active agreement issue is unavailable");
    return {
      recipientEmail: recipient.recipientEmail,
      clientName: recipient.clientName,
      language: recipient.language,
      company: { companyName: content.companyName, companyLogoUrl: content.companyLogoUrl,
        companyEmail: content.companyEmail, companyPhone: content.companyPhone, replyTo: recipient.replyTo },
      agreement: emailSummary(content),
    };
  },
});

export const prepareAgreementEmail = internalMutation({
  args: { companyId: v.id("companies"), agreementId: v.id("serviceAgreements") },
  handler: async (ctx, args) => {
    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement || agreement.companyId !== args.companyId) throw new Error("Access denied");
    if (agreement.status === "signed" || agreement.status === "cancelled") throw new Error("Signed or cancelled agreements cannot be sent");
    const now = Date.now();
    const previous = agreement.pendingDeliveryAttemptId ? await ctx.db.get(agreement.pendingDeliveryAttemptId) : null;
    const stale = previous?.result === "pending" && now - previous.attemptedAt >= PENDING_RECOVERY_MS;
    if (agreement.pendingDeliveryAttemptId && (!previous || (previous.result !== "unknown" && !stale) ||
      previous.companyId !== args.companyId || previous.documentKind !== "service_agreement" || previous.documentId !== String(agreement._id))) {
      throw new Error("An agreement delivery attempt is still pending");
    }
    if (stale && previous) await ctx.db.patch(previous._id, { result: "unknown", resultAt: now });
    if (!previous) await assertCooldown(ctx, agreement, now);
    const recipient = await deliveryContext(ctx, agreement);
    let issue = previous
      ? await ctx.db.get(previous.issueId as any) as any
      : agreement.currentIssueId ? await ctx.db.get(agreement.currentIssueId) : null;
    if ((previous || agreement.currentIssueId) && !issue) throw new Error("Active agreement issue is unavailable");
    if (issue && (issue.agreementId !== agreement._id || issue.companyId !== args.companyId ||
      issue.withdrawnAt || (!issue.issuedAt && !previous))) throw new Error("Active agreement issue is invalid");
    if (["draft", "ready"].includes(agreement.status) && issue && !previous) throw new Error("Draft agreement cannot have an active issue");
    if (!issue) {
      assertAgreementPriceConsistency(agreement);
      const latest = await ctx.db.query("serviceAgreementIssues")
        .withIndex("by_agreement", (q) => q.eq("agreementId", agreement._id)).order("desc").first();
      const issueId = await ctx.db.insert("serviceAgreementIssues", {
        companyId: args.companyId, agreementId: agreement._id,
        issueNumber: (latest?.issueNumber ?? 0) + 1,
        content: await buildServiceAgreementIssueContent(ctx, agreement),
        templateId: agreement.templateId,
        templateName: agreement.templateNameAtGeneration,
        templateVersion: agreement.templateVersionAtGeneration,
        preparedAt: now,
      });
      issue = await ctx.db.get(issueId);
    }
    if (!issue) throw new Error("Agreement issue could not be prepared");
    const attemptId = await ctx.db.insert("transactionalDocumentDeliveryAttempts", {
      companyId: args.companyId, documentKind: "service_agreement",
      documentId: String(agreement._id), issueId: String(issue._id),
      channel: "email", recipientEmail: recipient.recipientEmail,
      attemptedAt: now, result: "pending",
    });
    await ctx.db.patch(agreement._id, { pendingDeliveryAttemptId: attemptId, updatedAt: now });
    return {
      attemptId, issueId: issue._id, recipientEmail: recipient.recipientEmail,
      clientName: recipient.clientName,
      language: recipient.language, replyTo: recipient.replyTo,
      content: issue.content,
      agreementEmailSummary: emailSummary(issue.content),
    };
  },
});

export const finishAgreementEmail = internalMutation({
  args: {
    companyId: v.id("companies"), agreementId: v.id("serviceAgreements"),
    attemptId: v.id("transactionalDocumentDeliveryAttempts"),
    result: v.union(v.literal("provider_accepted"), v.literal("failed"), v.literal("unknown")),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agreement = await ctx.db.get(args.agreementId);
    const attempt = await ctx.db.get(args.attemptId);
    if (!agreement || agreement.companyId !== args.companyId || !attempt || attempt.companyId !== args.companyId ||
      attempt.documentKind !== "service_agreement" || attempt.documentId !== String(agreement._id) ||
      agreement.pendingDeliveryAttemptId !== attempt._id || attempt.result !== "pending") throw new Error("Delivery attempt is no longer current");
    const issue = await ctx.db.get(attempt.issueId as any) as any;
    if (!issue || issue.agreementId !== agreement._id || issue.companyId !== args.companyId || issue.withdrawnAt) throw new Error("Agreement issue is no longer current");
    const now = Date.now();
    await ctx.db.patch(attempt._id, {
      result: args.result, resultAt: now,
      providerMessageId: args.result === "provider_accepted" ? args.providerMessageId : undefined,
      errorCategory: args.result === "failed" ? "email_send_failed" :
        args.result === "unknown" ? "finalization_uncertain" : undefined,
    });
    if (args.result === "unknown") return { sentAt: agreement.sentAt ?? null };
    if (args.result === "failed") {
      if (!issue.issuedAt) await ctx.db.patch(issue._id, { withdrawnAt: now });
      await ctx.db.patch(agreement._id, { pendingDeliveryAttemptId: undefined, updatedAt: now });
      return { sentAt: agreement.sentAt ?? null };
    }
    if (!issue.issuedAt) await ctx.db.patch(issue._id, { issuedAt: now });
    await ctx.db.patch(agreement._id, {
      status: ["draft", "ready"].includes(agreement.status) ? "sent" : agreement.status,
      sentAt: agreement.sentAt ?? now,
      currentIssueId: issue._id,
      pendingDeliveryAttemptId: undefined,
      updatedAt: now,
    });
    return { sentAt: agreement.sentAt ?? now };
  },
});
