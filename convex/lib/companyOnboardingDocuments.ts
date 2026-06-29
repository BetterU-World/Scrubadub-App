export const STANDARD_COMPANY_ONBOARDING_DOCUMENTS = [
  {
    documentKey: "company_values",
    title: "Company Values",
    description: "Shared company values and work standards.",
    roleVisibility: "both",
    required: true,
  },
  {
    documentKey: "worker_agreement",
    title: "Worker Agreement",
    description: "General worker agreement for company onboarding.",
    roleVisibility: "both",
    required: true,
  },
  {
    documentKey: "contractor_agreement",
    title: "Contractor Agreement",
    description: "Agreement for contractor workers.",
    roleVisibility: "both",
    required: true,
  },
  {
    documentKey: "employee_handbook",
    title: "Employee Handbook",
    description: "Employee handbook acknowledgement material.",
    roleVisibility: "cleaner",
    required: true,
  },
  {
    documentKey: "safety_policy",
    title: "Safety Policy",
    description: "Safety practices and jobsite expectations.",
    roleVisibility: "both",
    required: true,
  },
  {
    documentKey: "role_expectations",
    title: "Role Expectations",
    description: "Role-specific expectations for assigned work.",
    roleVisibility: "both",
    required: true,
  },
  {
    documentKey: "nda",
    title: "NDA",
    description: "Confidentiality and nondisclosure acknowledgement.",
    roleVisibility: "both",
    required: false,
  },
  {
    documentKey: "additional_documents",
    title: "Additional Documents",
    description: "Other company-provided onboarding documents.",
    roleVisibility: "both",
    required: false,
  },
] as const;

export type CompanyOnboardingRoleVisibility = "cleaner" | "maintenance" | "both";

export function standardCompanyOnboardingDocumentForKey(documentKey: string) {
  return STANDARD_COMPANY_ONBOARDING_DOCUMENTS.find((document) => document.documentKey === documentKey);
}

export function isVisibleToWorkerRole(
  roleVisibility: CompanyOnboardingRoleVisibility,
  role: string
) {
  if (roleVisibility === "both") return true;
  if (roleVisibility === "cleaner") return role === "cleaner";
  return role === "maintenance";
}
