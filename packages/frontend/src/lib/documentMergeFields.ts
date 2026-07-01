export type MergeFieldDefinition = {
  key: string;
  label: string;
  category: "Company" | "Client" | "Property" | "Proposal" | "Agreement" | "System";
};

export const SERVICE_AGREEMENT_FIELDS: MergeFieldDefinition[] = [
  { key: "company_logo", label: "Company Logo", category: "Company" },
  { key: "company_name", label: "Company Name", category: "Company" },
  { key: "company_phone", label: "Company Phone", category: "Company" },
  { key: "company_email", label: "Company Email", category: "Company" },
  { key: "company_website", label: "Company Website", category: "Company" },
  { key: "company_address", label: "Company Address", category: "Company" },
  { key: "company_license_number", label: "License Number", category: "Company" },
  { key: "company_insurance", label: "Insurance Information", category: "Company" },
  { key: "company_primary_color", label: "Primary Color", category: "Company" },
  { key: "company_secondary_color", label: "Secondary Color", category: "Company" },
  { key: "company_accent_color", label: "Accent Color", category: "Company" },
  { key: "company_header", label: "Document Header", category: "Company" },
  { key: "company_footer", label: "Document Footer", category: "Company" },
  { key: "client_name", label: "Client Name", category: "Client" },
  { key: "property_address", label: "Property Address", category: "Property" },
  { key: "proposal_price", label: "Proposal Price", category: "Proposal" },
  { key: "service_frequency", label: "Service Frequency", category: "Agreement" },
  { key: "agreement_start_date", label: "Agreement Start Date", category: "Agreement" },
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
