import { v } from "convex/values";
import { buildServiceAgreementMergeValues, renderDocumentTemplate } from "./documentMergeFields";
import { formatAgreementAddOnLines } from "./acceptedProposalAddOnSnapshots";
import { getCompanyIdentity } from "./companyIdentity";

const text = v.union(v.string(), v.null());
const amount = v.union(v.number(), v.null());

/** Exactly the substantive fields shown in the owner preview and client agreement. */
export const serviceAgreementIssueContentValidator = v.object({
  companyName: v.string(), companyLogoUrl: text, companyEmail: text, companyPhone: text,
  title: v.string(), clientName: text, propertyAddress: text,
  servicesIncluded: text, serviceFrequency: text, contractAmountCents: amount,
  priceSummary: text, billingSchedule: text, effectiveStartDate: text,
  effectiveEndDate: text, renewalDate: text, paymentTerms: text,
  scopeOfWork: text, terms: text, specialInstructions: text, exceptions: text,
  body: text,
  committedAddOns: v.array(v.object({
    snapshotId: v.string(), name: v.string(), pricingMethod: v.string(),
    unitPriceCents: v.number(), unitLabel: text, quantity: amount,
    finalizedPriceCents: amount, lineTotalCents: v.number(), billingCadence: v.string(),
  })),
});

function formatFrequency(value: string | undefined) {
  const labels: Record<string, string> = {
    one_time: "One-time", weekly: "Weekly", biweekly: "Biweekly",
    monthly: "Monthly", quarterly: "Quarterly", custom: "Custom",
  };
  return value ? labels[value] ?? value : undefined;
}

/** Reject a visible numeric amount that disagrees with a monetary price summary. */
export function assertAgreementPriceConsistency(agreement: any) {
  if (agreement.contractAmountCents == null || !agreement.priceSummary) return;
  const amounts = [...agreement.priceSummary.matchAll(/\$\s*([\d,]+)(?:\.(\d{1,2}))?/g)]
    .map((match: RegExpMatchArray) => Number(match[1].replace(/,/g, "")) * 100 + Number((match[2] ?? "").padEnd(2, "0")));
  if (amounts.length && !amounts.includes(agreement.contractAmountCents)) {
    throw new Error("Contract amount and price summary disagree. Review both before sending this agreement.");
  }
}

export async function renderStructuredAgreementBody(ctx: any, agreement: any) {
  if (agreement.contentMode !== "structured" || !agreement.templateBody) return agreement.body ?? null;
  const values = await buildServiceAgreementMergeValues(ctx, agreement.companyId, {
    clientName: agreement.clientName,
    propertyAddress: agreement.propertyAddress,
    serviceFrequency: formatFrequency(agreement.serviceFrequency),
    priceSummary: agreement.priceSummary,
    billingSchedule: agreement.billingSchedule,
    effectiveStartDate: agreement.effectiveStartDate,
    effectiveEndDate: agreement.effectiveEndDate,
    renewalDate: agreement.renewalDate,
    servicesIncluded: agreement.servicesIncluded,
    scopeOfWork: agreement.scopeOfWork,
    paymentTerms: agreement.paymentTerms,
    terms: agreement.terms,
    specialInstructions: agreement.specialInstructions,
    exceptions: agreement.exceptions,
    addOnLineItems: formatAgreementAddOnLines(agreement.acceptedProposalAddOnSnapshots ?? []),
  }, new Date(agreement.createdAt));
  return renderDocumentTemplate(agreement.templateBody, values);
}

export async function buildServiceAgreementIssueContent(ctx: any, agreement: any) {
  const [identity, body] = await Promise.all([
    getCompanyIdentity(ctx, agreement.companyId),
    renderStructuredAgreementBody(ctx, agreement),
  ]);
  return {
    companyName: identity.companyName,
    companyLogoUrl: identity.logoUrl,
    companyEmail: identity.email,
    companyPhone: identity.phone,
    title: agreement.title,
    clientName: agreement.clientName ?? null,
    propertyAddress: agreement.propertyAddress ?? null,
    servicesIncluded: agreement.servicesIncluded ?? null,
    serviceFrequency: agreement.serviceFrequency ?? null,
    contractAmountCents: agreement.contractAmountCents ?? null,
    priceSummary: agreement.priceSummary ?? null,
    billingSchedule: agreement.billingSchedule ?? null,
    effectiveStartDate: agreement.effectiveStartDate ?? null,
    effectiveEndDate: agreement.effectiveEndDate ?? null,
    renewalDate: agreement.renewalDate ?? null,
    paymentTerms: agreement.paymentTerms ?? null,
    scopeOfWork: agreement.scopeOfWork ?? null,
    terms: agreement.terms ?? null,
    specialInstructions: agreement.specialInstructions ?? null,
    exceptions: agreement.exceptions ?? null,
    body,
    committedAddOns: (agreement.acceptedProposalAddOnSnapshots ?? []).map((line: any) => ({
      snapshotId: line.snapshotId,
      name: line.name, pricingMethod: line.pricingMethod,
      unitPriceCents: line.unitPriceCents, unitLabel: line.unitLabel ?? null,
      quantity: line.quantity ?? null, finalizedPriceCents: line.finalizedPriceCents ?? null,
      lineTotalCents: line.lineTotalCents, billingCadence: line.billingCadence,
    })),
  };
}

export async function activeServiceAgreementIssue(ctx: any, agreement: any) {
  if (!agreement.currentIssueId) return null;
  const issue = await ctx.db.get(agreement.currentIssueId);
  return issue && issue.agreementId === agreement._id &&
    issue.companyId === agreement.companyId && issue.issuedAt && !issue.withdrawnAt
    ? issue : null;
}
