export type DocumentSection = "client" | "resources" | "team" | "templates";

export function getDocumentSections(user?: {
  role?: string;
  canManageSalesAndCommercial?: boolean;
  canManageDocuments?: boolean;
} | null): DocumentSection[] {
  const sales = user?.role === "owner" || user?.canManageSalesAndCommercial === true;
  const documents = user?.role === "owner" || user?.canManageDocuments === true;
  return [
    ...(sales ? ["client" as const] : []),
    ...(documents ? ["resources" as const, "team" as const, "templates" as const] : []),
  ];
}

export function getActiveDocumentSection(sections: DocumentSection[], requested?: string | null) {
  return sections.find((section) => section === requested) ?? sections[0];
}
