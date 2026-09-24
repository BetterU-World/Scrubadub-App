import { buildServiceAgreementMergeValues } from "./documentMergeFields";
import { formatAgreementAddOnLines } from "./acceptedProposalAddOnSnapshots";
import { assertAgreementPriceConsistency, buildServiceAgreementIssueContent } from "./serviceAgreementIssuedContent";
import { agreementMergeFieldForToken, SERVICE_AGREEMENT_NAMED_SECTIONS, templateTokens } from "./serviceAgreementMergeFieldCatalogue";

export type ReviewItem = { code: string; message: string; field?: string };

function present(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function formatFrequency(value: string | undefined) {
  const labels: Record<string, string> = { one_time: "One-time", weekly: "Weekly", biweekly: "Biweekly", monthly: "Monthly", quarterly: "Quarterly", custom: "Custom" };
  return value ? labels[value] ?? value : undefined;
}

/** Uses the same token grammar and merge values as issue rendering. Malformed syntax stays literal. */
export function diagnoseAgreementTemplate(body: string, values: Record<string, string>, missingKeys?: ReadonlySet<string>) {
  const tokens = [...new Set(templateTokens(body))];
  const unknownTokens = tokens.filter((token) => !agreementMergeFieldForToken(token));
  const missingValues = tokens.flatMap((token) => {
    const field = agreementMergeFieldForToken(token);
    if (!field) return [];
    const rendered = values[token] ?? "";
    const missing = !rendered.trim() || Boolean(missingKeys?.has(field.key)) ||
      (!missingKeys && field.missingValue === "placeholder" && ["To be confirmed", "Client", "Your Cleaning Company"].includes(rendered)) ||
      (field.key === "company_name" && rendered === "Your Cleaning Company");
    return missing ? [{ token, key: field.key, label: field.label, expected: field.expected }] : [];
  });
  const duplicatedSummaryFields = [...new Set(tokens.flatMap((token) => {
    const field = agreementMergeFieldForToken(token);
    return field?.summaryField ? [field.summaryField] : [];
  }))];
  return { unknownTokens, missingValues, duplicatedSummaryFields, tokens };
}

export async function buildAgreementAuthoringReview(
  ctx: any, agreement: any, content?: any, portalAccess?: { canEmail: boolean; status: string },
  previewSource: "saved_agreement" | "template_candidate" = "saved_agreement",
) {
  if (agreement.contentMode !== "structured" || !agreement.templateBody || !["draft", "ready"].includes(agreement.status)) return null;
  const preview = content ?? await buildServiceAgreementIssueContent(ctx, agreement);
  const values = await buildServiceAgreementMergeValues(ctx, agreement.companyId, {
    clientName: agreement.clientName, propertyAddress: agreement.propertyAddress,
    serviceFrequency: formatFrequency(agreement.serviceFrequency), priceSummary: agreement.priceSummary,
    billingSchedule: agreement.billingSchedule, effectiveStartDate: agreement.effectiveStartDate,
    effectiveEndDate: agreement.effectiveEndDate, renewalDate: agreement.renewalDate,
    servicesIncluded: agreement.servicesIncluded, scopeOfWork: agreement.scopeOfWork,
    paymentTerms: agreement.paymentTerms, terms: agreement.terms,
    specialInstructions: agreement.specialInstructions, exceptions: agreement.exceptions,
    addOnLineItems: formatAgreementAddOnLines(agreement.acceptedProposalAddOnSnapshots ?? []),
  }, new Date(agreement.createdAt));
  const sourceFields: Record<string, unknown> = {
    client_name: agreement.clientName, property_address: agreement.propertyAddress,
    proposal_price: agreement.priceSummary, contract_price: agreement.priceSummary,
    service_frequency: agreement.serviceFrequency, agreement_start_date: agreement.effectiveStartDate,
    start_date: agreement.effectiveStartDate, billing_schedule: agreement.billingSchedule,
    services_included: agreement.servicesIncluded, agreement_end_date: agreement.effectiveEndDate,
    renewal_date: agreement.renewalDate, scope_of_work: agreement.scopeOfWork,
    payment_terms: agreement.paymentTerms, terms: agreement.terms,
  };
  const missingKeys = new Set(Object.entries(sourceFields).filter(([, source]) => !present(source)).map(([key]) => key));
  const merge = diagnoseAgreementTemplate(agreement.templateBody, values, missingKeys);
  const warnings: ReviewItem[] = [];
  const suggestions: ReviewItem[] = [];
  const technicalBlockers: ReviewItem[] = [];
  if (!present(agreement.clientName)) warnings.push({ code: "client_name_missing", message: "Review the client name.", field: "clientName" });
  if (!present(agreement.propertyAddress)) warnings.push({ code: "property_address_missing", message: "Review the service address.", field: "propertyAddress" });
  if (!present(agreement.scopeOfWork) && !present(agreement.servicesIncluded)) warnings.push({ code: "scope_missing", message: "Review the service scope.", field: "scopeOfWork" });
  for (const token of merge.unknownTokens) warnings.push({ code: "unknown_merge_field", message: `The template contains an unknown merge field: {{${token}}}.`, field: token });
  for (const missing of merge.missingValues) {
    const item = { code: "missing_merge_value", message: `${missing.label} has no saved value for {{${missing.token}}}.`, field: missing.key };
    (missing.expected ? warnings : suggestions).push(item);
  }
  if (/To be confirmed/i.test(preview.body ?? "") || /To be confirmed/i.test(preview.priceSummary ?? "")) {
    warnings.push({ code: "visible_placeholder", message: "The client preview contains 'To be confirmed'." });
  }
  try { assertAgreementPriceConsistency(agreement); }
  catch { technicalBlockers.push({ code: "price_conflict", message: "Contract amount and price summary disagree." }); }
  if (agreement.pendingDeliveryAttemptId) technicalBlockers.push({ code: "delivery_pending", message: "An agreement delivery attempt is pending." });
  if (!present(agreement.effectiveEndDate)) suggestions.push({ code: "end_date_missing", message: "Consider an end date.", field: "effectiveEndDate" });
  if (!present(agreement.renewalDate)) suggestions.push({ code: "renewal_date_missing", message: "Consider a renewal date.", field: "renewalDate" });
  if (!/cancel|notice/i.test([agreement.terms, agreement.templateBody].filter(Boolean).join(" "))) {
    suggestions.push({ code: "notice_terms_missing", message: "Consider cancellation or notice terms.", field: "terms" });
  }
  const namedSectionsOutsideProse = SERVICE_AGREEMENT_NAMED_SECTIONS.filter(({ field, token }) =>
    present(agreement[field]) && !merge.tokens.includes(token)
  ).map(({ field }) => field);
  const emailIssueBlockers = [...technicalBlockers];
  if (portalAccess && !portalAccess.canEmail) emailIssueBlockers.push({
    code: `portal_access_${portalAccess.status}`, message: "Active Client Portal access is required for SCRUB email.",
  });
  return {
    previewSource,
    savedAgreementUpdatedAt: agreement.updatedAt,
    template: { id: agreement.templateId ?? null, name: agreement.templateNameAtGeneration ?? null,
      version: agreement.templateVersionAtGeneration ?? null, fallback: !agreement.templateId },
    merge, namedSections: SERVICE_AGREEMENT_NAMED_SECTIONS, namedSectionsOutsideProse,
    warnings, suggestions, technicalBlockers, emailIssueBlockers,
  };
}
