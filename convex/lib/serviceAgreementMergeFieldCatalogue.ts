/** Shared by the Convex renderer and the template insertion UI. */
export type AgreementMergeField = {
  key: string;
  label: string;
  category: "Company" | "Client" | "Property" | "Proposal" | "Agreement" | "System";
  missingValue: "empty" | "placeholder" | "none";
  expected: boolean;
  aliases?: readonly string[];
  summaryField?: string;
};

export const COMPANY_MERGE_FIELDS: AgreementMergeField[] = [
  { key: "company_logo", label: "Company logo", category: "Company", missingValue: "empty", expected: false },
  { key: "company_name", label: "Company name", category: "Company", missingValue: "placeholder", expected: true },
  { key: "company_phone", label: "Company phone", category: "Company", missingValue: "empty", expected: false },
  { key: "company_email", label: "Company email", category: "Company", missingValue: "empty", expected: false },
  { key: "company_website", label: "Company website", category: "Company", missingValue: "empty", expected: false },
  { key: "company_address", label: "Company address", category: "Company", missingValue: "empty", expected: false },
  { key: "company_license_number", label: "License number", category: "Company", missingValue: "empty", expected: false },
  { key: "company_insurance", label: "Insurance information", category: "Company", missingValue: "empty", expected: false },
  { key: "company_primary_color", label: "Primary color", category: "Company", missingValue: "empty", expected: false },
  { key: "company_secondary_color", label: "Secondary color", category: "Company", missingValue: "empty", expected: false },
  { key: "company_accent_color", label: "Accent color", category: "Company", missingValue: "empty", expected: false },
  { key: "company_header", label: "Document header", category: "Company", missingValue: "empty", expected: false },
  { key: "company_footer", label: "Document footer", category: "Company", missingValue: "empty", expected: false },
];

export const SERVICE_AGREEMENT_MERGE_FIELDS: AgreementMergeField[] = [
  ...COMPANY_MERGE_FIELDS,
  { key: "today", label: "Today", category: "System", missingValue: "empty", expected: false },
  { key: "client_name", label: "Client name", category: "Client", missingValue: "placeholder", expected: true, aliases: ["clientName"], summaryField: "clientName" },
  { key: "property_address", label: "Property address", category: "Property", missingValue: "placeholder", expected: true, summaryField: "propertyAddress" },
  { key: "proposal_price", label: "Proposal price", category: "Proposal", missingValue: "placeholder", expected: true, summaryField: "priceSummary" },
  { key: "service_frequency", label: "Service frequency", category: "Agreement", missingValue: "placeholder", expected: true, summaryField: "serviceFrequency" },
  { key: "agreement_start_date", label: "Agreement start date", category: "Agreement", missingValue: "placeholder", expected: true, summaryField: "effectiveStartDate" },
  { key: "contract_price", label: "Contract price", category: "Agreement", missingValue: "placeholder", expected: true, summaryField: "priceSummary" },
  { key: "billing_schedule", label: "Billing schedule", category: "Agreement", missingValue: "placeholder", expected: true, summaryField: "billingSchedule" },
  { key: "start_date", label: "Start date", category: "Agreement", missingValue: "placeholder", expected: true, summaryField: "effectiveStartDate" },
  { key: "services_included", label: "Services included", category: "Agreement", missingValue: "placeholder", expected: true, summaryField: "servicesIncluded" },
  { key: "add_on_line_items", label: "Committed add-ons", category: "Agreement", missingValue: "none", expected: false, summaryField: "committedAddOns" },
  { key: "special_instructions", label: "Special instructions", category: "Agreement", missingValue: "none", expected: false, summaryField: "specialInstructions" },
  { key: "exceptions", label: "Exceptions", category: "Agreement", missingValue: "none", expected: false, summaryField: "exceptions" },
  { key: "agreement_end_date", label: "Agreement end date", category: "Agreement", missingValue: "empty", expected: false, summaryField: "effectiveEndDate" },
  { key: "renewal_date", label: "Renewal date", category: "Agreement", missingValue: "empty", expected: false, summaryField: "renewalDate" },
  { key: "scope_of_work", label: "Scope of work", category: "Agreement", missingValue: "empty", expected: true, summaryField: "scopeOfWork" },
  { key: "payment_terms", label: "Payment terms", category: "Agreement", missingValue: "empty", expected: false, summaryField: "paymentTerms" },
  { key: "terms", label: "Additional terms", category: "Agreement", missingValue: "empty", expected: false, summaryField: "terms" },
];

export const SERVICE_AGREEMENT_NAMED_SECTIONS = [
  { field: "scopeOfWork", token: "scope_of_work", label: "Scope of work" },
  { field: "paymentTerms", token: "payment_terms", label: "Payment terms" },
  { field: "specialInstructions", token: "special_instructions", label: "Special instructions" },
  { field: "exceptions", token: "exceptions", label: "Exceptions" },
  { field: "terms", token: "terms", label: "Additional terms" },
] as const;

const byToken = new Map(SERVICE_AGREEMENT_MERGE_FIELDS.flatMap((field) =>
  [field.key, ...(field.aliases ?? [])].map((token) => [token, field] as const)
));
export const AGREEMENT_TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function agreementMergeFieldForToken(token: string) {
  return byToken.get(token);
}

export function templateTokens(body: string) {
  return [...body.matchAll(AGREEMENT_TOKEN_PATTERN)].map((match) => match[1]);
}
