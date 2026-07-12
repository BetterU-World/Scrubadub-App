import { Id } from "../_generated/dataModel";

function cleanOptional(value: string | undefined, max = 500) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanEmail(value: string | undefined) {
  return cleanOptional(value, 200)?.toLowerCase();
}

function cleanRequired(value: string | undefined, fallback: string, max = 200) {
  return value?.trim().slice(0, max) || fallback;
}

function normalizeName(value: string | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
}

function clientTypeFromLead(leadType: string | undefined) {
  if (leadType === "commercial") return "commercial";
  if (leadType === "str_airbnb") return "str";
  return "residential";
}

async function findExistingRelationship(
  ctx: { db: any },
  companyId: Id<"companies">,
  email: string | undefined,
  businessName: string | undefined
) {
  const normalizedBusinessName = normalizeName(businessName);

  if (email) {
    const byEmail = await ctx.db
      .query("clientRelationships")
      .withIndex("by_companyId_email", (q: any) =>
        q.eq("companyId", companyId).eq("email", email)
      )
      .first();
    if (byEmail) return byEmail;
  }

  if (!normalizedBusinessName) return null;

  const companyRelationships = await ctx.db
    .query("clientRelationships")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
    .collect();

  return (
    companyRelationships.find(
      (relationship: any) =>
        normalizeName(relationship.businessName) === normalizedBusinessName ||
        normalizeName(relationship.displayName) === normalizedBusinessName
    ) ?? null
  );
}

export async function ensureClientRelationshipForLead(
  ctx: { db: any },
  request: any
) {
  const backfillLinkedProperty = async (clientRelationshipId: Id<"clientRelationships">) => {
    if (!request.propertyId) return;
    const property = await ctx.db.get(request.propertyId);
    if (
      property?.companyId === request.companyId &&
      !property.clientRelationshipId
    ) {
      await ctx.db.patch(property._id, { clientRelationshipId });
    }
  };

  if (request.clientRelationshipId) {
    const relationship = await ctx.db.get(request.clientRelationshipId);
    if (!relationship || relationship.companyId !== request.companyId) {
      throw new Error("Client relationship must belong to the lead's company");
    }
    await backfillLinkedProperty(relationship._id);
    return relationship._id;
  }

  const email = cleanEmail(request.requesterEmail);
  const businessName = cleanOptional(request.businessName, 200);
  const existing = await findExistingRelationship(
    ctx,
    request.companyId,
    email,
    businessName
  );

  if (existing) {
    await ctx.db.patch(request._id, {
      clientRelationshipId: existing._id,
    });
    await backfillLinkedProperty(existing._id);
    return existing._id;
  }

  const now = Date.now();
  const relationshipId = await ctx.db.insert("clientRelationships", {
    companyId: request.companyId,
    displayName: businessName || cleanRequired(request.requesterName, "Client", 200),
    clientType: clientTypeFromLead(request.leadType),
    businessName,
    primaryContactName: cleanOptional(request.requesterName, 200),
    email,
    phone: cleanOptional(request.requesterPhone, 50),
    status: "active",
    sourceClientRequestId: request._id,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.patch(request._id, {
    clientRelationshipId: relationshipId,
  });
  await backfillLinkedProperty(relationshipId);

  return relationshipId;
}
