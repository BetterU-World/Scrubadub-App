import { getCompanyIdentity, type CompanyIdentity } from "./companyIdentity";

export type MergeFieldDefinition = {
  key: string;
  label: string;
  category: "Company" | "Client" | "Property" | "Proposal" | "Agreement" | "System";
  description?: string;
};

export const COMPANY_MERGE_FIELDS: MergeFieldDefinition[] = [
  { key: "company_logo", label: "Company logo", category: "Company" },
  { key: "company_name", label: "Company name", category: "Company" },
  { key: "company_phone", label: "Company phone", category: "Company" },
  { key: "company_email", label: "Company email", category: "Company" },
  { key: "company_website", label: "Company website", category: "Company" },
  { key: "company_address", label: "Company address", category: "Company" },
  { key: "company_license_number", label: "License number", category: "Company" },
  { key: "company_insurance", label: "Insurance information", category: "Company" },
  { key: "company_primary_color", label: "Primary color", category: "Company" },
  { key: "company_secondary_color", label: "Secondary color", category: "Company" },
  { key: "company_accent_color", label: "Accent color", category: "Company" },
  { key: "company_header", label: "Document header", category: "Company" },
  { key: "company_footer", label: "Document footer", category: "Company" },
  { key: "today", label: "Today", category: "System" },
];

export const SERVICE_AGREEMENT_MERGE_FIELDS: MergeFieldDefinition[] = [
  ...COMPANY_MERGE_FIELDS,
  { key: "client_name", label: "Client name", category: "Client" },
  { key: "property_address", label: "Property address", category: "Property" },
  { key: "proposal_price", label: "Proposal price", category: "Proposal" },
  { key: "service_frequency", label: "Service frequency", category: "Agreement" },
  { key: "agreement_start_date", label: "Agreement start date", category: "Agreement" },
  { key: "contract_price", label: "Contract price", category: "Agreement" },
  { key: "billing_schedule", label: "Billing schedule", category: "Agreement" },
  { key: "start_date", label: "Start date", category: "Agreement" },
  { key: "services_included", label: "Services included", category: "Agreement" },
  { key: "add_on_line_items", label: "Committed add-ons", category: "Agreement" },
  { key: "special_instructions", label: "Special instructions", category: "Agreement" },
  { key: "exceptions", label: "Exceptions", category: "Agreement" },
];

export const FALLBACK_SERVICE_AGREEMENT_TEMPLATE = `# Service Agreement

This Service Agreement is between {{company_name}} and {{client_name}} for cleaning services at {{property_address}}.

## Services Included
{{services_included}}

## Committed Add-Ons
{{add_on_line_items}}

## Schedule and Pricing
Service frequency: {{service_frequency}}
Contract price: {{contract_price}}
Billing schedule: {{billing_schedule}}
Start date: {{start_date}}

## Special Instructions
{{special_instructions}}

## Exceptions
{{exceptions}}

The parties agree that this draft reflects the accepted proposal details and may be updated by the service provider before final signature.`;

function value(input: string | null | undefined, fallback = "") {
  return input?.trim() || fallback;
}

export function renderDocumentTemplate(body: string, values: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    return values[key] ?? "";
  });
}

export function buildCompanyMergeValues(identity: CompanyIdentity, now = new Date()) {
  return {
    company_logo: value(identity.logoUrl),
    company_name: value(identity.companyName, "Your Cleaning Company"),
    company_phone: value(identity.phone),
    company_email: value(identity.email),
    company_website: value(identity.website),
    company_address: value(identity.address),
    company_license_number: value(identity.licenseNumber),
    company_insurance: value(identity.insuranceInformation),
    company_primary_color: value(identity.primaryColor),
    company_secondary_color: value(identity.secondaryColor),
    company_accent_color: value(identity.accentColor),
    company_footer: value(identity.documentFooter),
    company_header: value(identity.documentHeader),
    today: now.toLocaleDateString("en-US"),
  };
}

export async function buildServiceAgreementMergeValues(
  ctx: any,
  companyId: any,
  values: {
    clientName?: string;
    propertyAddress?: string;
    serviceFrequency?: string;
    priceSummary?: string;
    billingSchedule?: string;
    effectiveStartDate?: string;
    servicesIncluded?: string;
    specialInstructions?: string;
    exceptions?: string;
    addOnLineItems?: string;
  }
) {
  const identity = await getCompanyIdentity(ctx, companyId);
  const companyValues = buildCompanyMergeValues(identity);
  const price = value(values.priceSummary, "To be confirmed");
  const startDate = value(values.effectiveStartDate, "To be confirmed");

  return {
    ...companyValues,
    client_name: value(values.clientName, "Client"),
    property_address: value(values.propertyAddress, "To be confirmed"),
    service_frequency: value(values.serviceFrequency, "To be confirmed"),
    proposal_price: price,
    contract_price: price,
    billing_schedule: value(values.billingSchedule, "To be confirmed"),
    agreement_start_date: startDate,
    start_date: startDate,
    services_included: value(values.servicesIncluded, "To be confirmed"),
    add_on_line_items: value(values.addOnLineItems, "None"),
    special_instructions: value(values.specialInstructions, "None specified"),
    exceptions: value(values.exceptions, "None specified"),
  };
}
