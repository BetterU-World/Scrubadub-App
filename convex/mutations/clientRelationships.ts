import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { logAudit } from "../lib/helpers";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { ensureClientRelationshipForLead } from "../lib/clientRelationships";

const clientTypeValidator = v.union(
  v.literal("residential"),
  v.literal("commercial"),
  v.literal("str"),
  v.literal("property_manager"),
  v.literal("marketplace")
);

const statusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("archived")
);

const relationshipFields = {
  displayName: v.string(),
  clientType: clientTypeValidator,
  businessName: v.optional(v.string()),
  primaryContactName: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  notes: v.optional(v.string()),
  status: statusValidator,
};

function cleanOptional(value: string | undefined, max = 500) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanEmail(value: string | undefined) {
  return cleanOptional(value, 200)?.toLowerCase();
}

function cleanRequired(value: string, fallback: string, max = 200) {
  return value.trim().slice(0, max) || fallback;
}

function patchFromArgs(args: any) {
  return {
    displayName: cleanRequired(args.displayName, "Client", 200),
    clientType: args.clientType,
    businessName: cleanOptional(args.businessName, 200),
    primaryContactName: cleanOptional(args.primaryContactName, 200),
    email: cleanEmail(args.email),
    phone: cleanOptional(args.phone, 50),
    notes: cleanOptional(args.notes, 4000),
    status: args.status,
  };
}

async function requireOwnedRelationship(ctx: any, sessionToken: string, userId: any, relationshipId: any) {
  const owner = await requireOwnerOrManagerCapability(ctx, sessionToken, userId, "canManageClients");
  const relationship = await ctx.db.get(relationshipId);
  if (!relationship) throw new Error("Client relationship not found");
  if (relationship.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, relationship };
}

async function getOwnedRelationshipOrUndefined(
  ctx: any,
  sessionToken: string,
  userId: any,
  relationshipId: any
) {
  if (!relationshipId) return undefined;
  const { relationship } = await requireOwnedRelationship(ctx, sessionToken, userId, relationshipId);
  return relationship._id;
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    ...relationshipFields,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageClients");
    const now = Date.now();
    const relationshipId = await ctx.db.insert("clientRelationships", {
      companyId: owner.companyId!,
      ...patchFromArgs(args),
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(ctx, {
      companyId: owner.companyId!,
      userId: owner._id,
      action: "create_client_relationship",
      entityType: "clientRelationship",
      entityId: relationshipId,
    });

    return relationshipId;
  },
});

export const update = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    relationshipId: v.id("clientRelationships"),
    ...relationshipFields,
  },
  handler: async (ctx, args) => {
    const { owner } = await requireOwnedRelationship(ctx, args.sessionToken, args.userId, args.relationshipId);
    await ctx.db.patch(args.relationshipId, {
      ...patchFromArgs(args),
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      companyId: owner.companyId!,
      userId: owner._id,
      action: "update_client_relationship",
      entityType: "clientRelationship",
      entityId: args.relationshipId,
    });
  },
});

export const createFromClientRequest = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageSalesAndCommercial");
    const request = await ctx.db.get(args.clientRequestId);
    if (!request) throw new Error("Lead not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    const relationshipId = await ensureClientRelationshipForLead(ctx, request);

    await logAudit(ctx, {
      companyId: owner.companyId!,
      userId: owner._id,
      action: "create_client_relationship_from_lead",
      entityType: "clientRelationship",
      entityId: relationshipId,
      details: String(request._id),
    });

    return relationshipId;
  },
});

export const linkClientRequest = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    clientRequestId: v.id("clientRequests"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageSalesAndCommercial");
    const request = await ctx.db.get(args.clientRequestId);
    if (!request) throw new Error("Lead not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.clientRequestId, {
      clientRelationshipId: await getOwnedRelationshipOrUndefined(
        ctx,
        args.sessionToken,
        args.userId,
        args.clientRelationshipId
      ),
    });
  },
});

export const linkCommercialAccount = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    commercialAccountId: v.id("commercialAccounts"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageSalesAndCommercial");
    const account = await ctx.db.get(args.commercialAccountId);
    if (!account) throw new Error("Commercial account not found");
    if (account.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.commercialAccountId, {
      clientRelationshipId: await getOwnedRelationshipOrUndefined(
        ctx,
        args.sessionToken,
        args.userId,
        args.clientRelationshipId
      ),
      updatedAt: Date.now(),
    });
  },
});

export const linkProperty = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    propertyId: v.id("properties"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageClients");
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.propertyId, {
      clientRelationshipId: await getOwnedRelationshipOrUndefined(
        ctx,
        args.sessionToken,
        args.userId,
        args.clientRelationshipId
      ),
    });
  },
});
