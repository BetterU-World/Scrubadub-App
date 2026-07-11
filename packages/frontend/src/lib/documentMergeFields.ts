export type MergeFieldDefinition = {
  key: string;
  label: string;
  category: "Company" | "Client" | "Property" | "Proposal" | "Agreement" | "System";
};

export const SERVICE_AGREEMENT_FIELDS: MergeFieldDefinition[] = [
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
  { key: "client_name", label: "Client name", category: "Client" },
  { key: "property_address", label: "Property address", category: "Property" },
  { key: "proposal_price", label: "Proposal price", category: "Proposal" },
  { key: "contract_price", label: "Contract price", category: "Agreement" },
  { key: "billing_schedule", label: "Billing schedule", category: "Agreement" },
  { key: "service_frequency", label: "Service frequency", category: "Agreement" },
  { key: "agreement_start_date", label: "Agreement start date", category: "Agreement" },
  { key: "start_date", label: "Start date", category: "Agreement" },
  { key: "services_included", label: "Services included", category: "Agreement" },
  { key: "special_instructions", label: "Special instructions", category: "Agreement" },
  { key: "exceptions", label: "Exceptions", category: "Agreement" },
  { key: "today", label: "Today", category: "System" },
];

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
  property_address: "500 Market Street",
  proposal_price: "$2,400.00 per month",
  contract_price: "$2,400.00 per month",
  billing_schedule: "Monthly",
  service_frequency: "Weekly",
  agreement_start_date: "07/01/2026",
  start_date: "07/01/2026",
  services_included: "Recurring office cleaning, restroom sanitation, and trash removal.",
  special_instructions: "Service after 6 PM on weekdays.",
  exceptions: "Window washing is excluded unless separately approved.",
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
