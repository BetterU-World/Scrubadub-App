export type RequestContext = "existing_client_service_request" | "prospect_request";

export async function classifyRequestContext(ctx: any, request: any): Promise<RequestContext> {
  if (
    request.source !== "authenticated_client" ||
    !request.originClientUserId ||
    !request.clientRelationshipId ||
    (!request.propertyId && !request.commercialAccountId)
  ) return "prospect_request";

  const relationship = await ctx.db.get(request.clientRelationshipId);
  if (
    !relationship ||
    relationship.companyId !== request.companyId ||
    relationship.status !== "active" ||
    relationship.clientUserId !== request.originClientUserId
  ) return "prospect_request";

  if (request.propertyId) {
    const property = await ctx.db.get(request.propertyId);
    return property &&
      property.companyId === request.companyId &&
      property.clientRelationshipId === relationship._id &&
      property.active
      ? "existing_client_service_request"
      : "prospect_request";
  }

  const account = await ctx.db.get(request.commercialAccountId);
  return account &&
    account.companyId === request.companyId &&
    account.clientRelationshipId === relationship._id &&
    account.status === "active"
    ? "existing_client_service_request"
    : "prospect_request";
}

export async function isExistingClientServiceRequest(ctx: any, request: any) {
  return (await classifyRequestContext(ctx, request)) === "existing_client_service_request";
}
