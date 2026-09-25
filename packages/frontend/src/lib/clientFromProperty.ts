export function clientPrefillFromProperty(property: { contactName?: string; contactPhone?: string; contactEmail?: string }) {
  return {
    displayName: property.contactName ?? "",
    primaryContactName: property.contactName ?? "",
    email: property.contactEmail ?? "",
    phone: property.contactPhone ?? "",
  };
}
