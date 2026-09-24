export type AgreementForm = {
  title: string;
  clientName: string;
  propertyAddress: string;
  servicesIncluded: string;
  priceSummary: string;
  billingSchedule: string;
  specialInstructions: string;
  exceptions: string;
  body: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  renewalDate: string;
  serviceFrequency: string;
  contractAmount: string;
  paymentTerms: string;
  scopeOfWork: string;
  terms: string;
  notes: string;
};

export const EMPTY_AGREEMENT_FORM: AgreementForm = {
  title: "", clientName: "", propertyAddress: "", servicesIncluded: "",
  priceSummary: "", billingSchedule: "", specialInstructions: "", exceptions: "",
  body: "", effectiveStartDate: "", effectiveEndDate: "", renewalDate: "",
  serviceFrequency: "", contractAmount: "", paymentTerms: "", scopeOfWork: "",
  terms: "", notes: "",
};

export function agreementFormFromRecord(agreement: Record<string, any>): AgreementForm {
  return {
    title: agreement.title ?? "", clientName: agreement.clientName ?? "",
    propertyAddress: agreement.propertyAddress ?? "", servicesIncluded: agreement.servicesIncluded ?? "",
    priceSummary: agreement.priceSummary ?? "", billingSchedule: agreement.billingSchedule ?? "",
    specialInstructions: agreement.specialInstructions ?? "", exceptions: agreement.exceptions ?? "",
    body: agreement.body ?? "", effectiveStartDate: agreement.effectiveStartDate ?? "",
    effectiveEndDate: agreement.effectiveEndDate ?? "", renewalDate: agreement.renewalDate ?? "",
    serviceFrequency: agreement.serviceFrequency ?? "",
    contractAmount: agreement.contractAmountCents != null ? String(agreement.contractAmountCents / 100) : "",
    paymentTerms: agreement.paymentTerms ?? "", scopeOfWork: agreement.scopeOfWork ?? "",
    terms: agreement.terms ?? "", notes: agreement.notes ?? "",
  };
}

export function agreementFormIsDirty(form: AgreementForm, saved: AgreementForm) {
  return (Object.keys(saved) as Array<keyof AgreementForm>).some((key) => form[key] !== saved[key]);
}

export type AgreementSection = "details" | "services" | "billing" | "terms" | "notes";

const sectionByField: Record<string, AgreementSection> = {
  title: "details", clientName: "details", client_name: "details",
  propertyAddress: "details", property_address: "details", serviceFrequency: "details",
  service_frequency: "details", effectiveStartDate: "details", start_date: "details",
  agreement_start_date: "details", effectiveEndDate: "details", agreement_end_date: "details",
  renewalDate: "details", renewal_date: "details",
  servicesIncluded: "services", services_included: "services", scopeOfWork: "services",
  scope_of_work: "services", specialInstructions: "services", special_instructions: "services",
  exceptions: "services", add_on_line_items: "services",
  contractAmountCents: "billing", contractAmount: "billing", priceSummary: "billing",
  contract_price: "billing", proposal_price: "billing", billingSchedule: "billing",
  billing_schedule: "billing", paymentTerms: "billing", payment_terms: "billing",
  terms: "terms", notes: "notes",
};

export function sectionForReviewField(field?: string): AgreementSection | null {
  return field ? sectionByField[field] ?? null : null;
}
