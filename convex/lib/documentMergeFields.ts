import { getCompanyIdentity, type CompanyIdentity } from "./companyIdentity";
export { COMPANY_MERGE_FIELDS, SERVICE_AGREEMENT_MERGE_FIELDS } from "./serviceAgreementMergeFieldCatalogue";
export type { AgreementMergeField as MergeFieldDefinition } from "./serviceAgreementMergeFieldCatalogue";

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
    effectiveEndDate?: string;
    renewalDate?: string;
    servicesIncluded?: string;
    scopeOfWork?: string;
    paymentTerms?: string;
    terms?: string;
    specialInstructions?: string;
    exceptions?: string;
    addOnLineItems?: string;
  },
  now?: Date,
) {
  const identity = await getCompanyIdentity(ctx, companyId);
  const companyValues = buildCompanyMergeValues(identity, now);
  const price = value(values.priceSummary, "To be confirmed");
  const startDate = value(values.effectiveStartDate, "To be confirmed");

  return {
    ...companyValues,
    client_name: value(values.clientName, "Client"),
    // Existing QA templates may persist this spelling; keep their generated agreements renderable.
    clientName: value(values.clientName, "Client"),
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
    agreement_end_date: value(values.effectiveEndDate),
    renewal_date: value(values.renewalDate),
    scope_of_work: value(values.scopeOfWork),
    payment_terms: value(values.paymentTerms),
    terms: value(values.terms),
  };
}
