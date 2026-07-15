export type CommercialEligibilityReason =
  | "eligible"
  | "non_commercial"
  | "classification_required";

export type CommercialEligibility = {
  eligible: boolean;
  reason: CommercialEligibilityReason;
  source: "property" | "request";
  classification?: string;
  propertyId?: string;
  mappedPropertyType?: "commercial" | "residential" | "vacation_rental";
};

export function propertyTypeFromRequestLeadType(leadType?: string) {
  switch (leadType) {
    case "commercial":
      return "commercial" as const;
    case "residential":
      return "residential" as const;
    case "str_airbnb":
      return "vacation_rental" as const;
    default:
      return null;
  }
}

export async function resolveCommercialEligibility(
  ctx: any,
  request: any,
  companyId: any
): Promise<CommercialEligibility> {
  if (request.companyId !== companyId) throw new Error("Access denied");

  if (request.propertyId) {
    const property = await ctx.db.get(request.propertyId);
    if (!property || property.companyId !== companyId) {
      return {
        eligible: false,
        reason: "classification_required",
        source: "property",
        propertyId: String(request.propertyId),
      };
    }
    return {
      eligible: property.type === "commercial",
      reason: property.type === "commercial" ? "eligible" : "non_commercial",
      source: "property",
      classification: property.type,
      propertyId: String(property._id),
    };
  }

  if (!request.leadType || request.leadType === "booking_request" || request.leadType === "other") {
    return {
      eligible: false,
      reason: "classification_required",
      source: "request",
      classification: request.leadType,
    };
  }

  return {
    eligible: request.leadType === "commercial",
    reason: request.leadType === "commercial" ? "eligible" : "non_commercial",
    source: "request",
    classification: request.leadType,
    mappedPropertyType: propertyTypeFromRequestLeadType(request.leadType) ?? undefined,
  };
}

export function commercialEligibilityError(result: CommercialEligibility) {
  return result.reason === "classification_required"
    ? "Classify the request or linked property before creating a commercial account"
    : "Commercial accounts can only be created for requests classified as commercial";
}
