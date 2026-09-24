export { SERVICE_AGREEMENT_MERGE_FIELDS as SERVICE_AGREEMENT_FIELDS } from "../../../../convex/lib/serviceAgreementMergeFieldCatalogue";
export type { AgreementMergeField as MergeFieldDefinition } from "../../../../convex/lib/serviceAgreementMergeFieldCatalogue";

export const SAMPLE_SERVICE_AGREEMENT_VALUES: Record<string, string> = {
  company_logo: "",
  company_name: "Sparkle Clean LLC",
  company_phone: "(555) 123-4567",
  company_email: "hello@sparkleclean.example",
  company_website: "https://sparkleclean.example",
  company_address: "100 Main Street, Austin, TX",
  company_license_number: "LIC-12345",
  company_insurance: "General liability policy on file",
  company_primary_color: "#2563eb",
  company_secondary_color: "#0f172a",
  company_accent_color: "#14b8a6",
  company_header: "Sparkle Clean LLC",
  company_footer: "Thank you for trusting our team.",
  client_name: "Acme Offices",
  clientName: "Acme Offices",
  property_address: "500 Market Street",
  proposal_price: "$2,400.00 per month",
  contract_price: "$2,400.00 per month",
  billing_schedule: "Monthly",
  service_frequency: "Weekly",
  agreement_start_date: "07/01/2026",
  start_date: "07/01/2026",
  services_included: "Recurring office cleaning, restroom sanitation, and trash removal.",
  add_on_line_items: "• Interior windows: 3 windows — $24.00 (monthly)",
  special_instructions: "Service after 6 PM on weekdays.",
  exceptions: "Window washing is excluded unless separately approved.",
  agreement_end_date: "06/30/2027",
  renewal_date: "07/01/2027",
  scope_of_work: "Weekly office cleaning and restroom sanitation.",
  payment_terms: "Net 15 after monthly invoice.",
  terms: "Please provide 30 days' notice for cancellation.",
  today: new Date().toLocaleDateString(),
};

export function tokenForField(key: string) {
  return `{{${key}}}`;
}

export function renderTemplatePreview(body: string, values = SAMPLE_SERVICE_AGREEMENT_VALUES) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    return values[key] ?? "";
  });
}
