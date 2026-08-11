import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability, requireOwnerManagerSession } from "../lib/sessionAuth";
import { hasOwnerOrManagerPermission } from "../lib/auth";

const RELATIONSHIP_LIST_CAP = 2_000;

async function requireOwnedRelationship(ctx: any, sessionToken: string, userId: any, relationshipId: any) {
  const owner = await requireOwnerOrManagerCapability(ctx, sessionToken, userId, "canManageClients");
  const relationship = await ctx.db.get(relationshipId);
  if (!relationship) return { owner, relationship: null };
  if (relationship.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, relationship };
}

async function countsForRelationship(ctx: any, relationship: any) {
  const [requests, accounts, properties, invoices] = await Promise.all([
    ctx.db
      .query("clientRequests")
      .withIndex("by_companyId_clientRelationshipId_createdAt", (q: any) =>
        q.eq("companyId", relationship.companyId).eq("clientRelationshipId", relationship._id)
      )
      .collect(),
    ctx.db
      .query("commercialAccounts")
      .withIndex("by_companyId_clientRelationshipId_updatedAt", (q: any) =>
        q.eq("companyId", relationship.companyId).eq("clientRelationshipId", relationship._id)
      )
      .collect(),
    ctx.db
      .query("properties")
      .withIndex("by_companyId_clientRelationshipId", (q: any) =>
        q.eq("companyId", relationship.companyId).eq("clientRelationshipId", relationship._id)
      )
      .collect(),
    ctx.db
      .query("invoices")
      .withIndex("by_companyId_clientRelationshipId_updatedAt", (q: any) =>
        q.eq("companyId", relationship.companyId).eq("clientRelationshipId", relationship._id)
      )
      .collect(),
  ]);

  return {
    requestCount: requests.length,
    commercialAccountCount: accounts.length,
    propertyCount: properties.length,
    invoiceCount: invoices.length,
  };
}

export const list = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"), v.literal("archived"))
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageClients");
    const relationships = await ctx.db
      .query("clientRelationships")
      .withIndex("by_companyId", (q) => q.eq("companyId", owner.companyId))
      .take(RELATIONSHIP_LIST_CAP);

    const filtered = args.status
      ? relationships.filter((relationship) => relationship.status === args.status)
      : relationships;

    filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    return filtered;
  },
});

export const listForSelect = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
    if (!hasOwnerOrManagerPermission(owner, "canManageClients") &&
        !hasOwnerOrManagerPermission(owner, "canManageSalesAndCommercial")) {
      throw new Error("Client or sales management permission required");
    }
    const relationships = await ctx.db
      .query("clientRelationships")
      .withIndex("by_companyId_status", (q) =>
        q.eq("companyId", owner.companyId).eq("status", "active")
      )
      .take(RELATIONSHIP_LIST_CAP);

    relationships.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return relationships.map((relationship) => ({
      _id: relationship._id,
      displayName: relationship.displayName,
      businessName: relationship.businessName,
      primaryContactName: relationship.primaryContactName,
      email: relationship.email,
      clientType: relationship.clientType,
      status: relationship.status,
    }));
  },
});

export const getById = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    relationshipId: v.id("clientRelationships"),
  },
  handler: async (ctx, args) => {
    const { relationship } = await requireOwnedRelationship(
      ctx,
      args.sessionToken,
      args.userId,
      args.relationshipId
    );
    if (!relationship) return null;
    return {
      ...relationship,
      counts: await countsForRelationship(ctx, relationship),
    };
  },
});

export const getClientRelationshipDetail = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    relationshipId: v.id("clientRelationships"),
  },
  handler: async (ctx, args) => {
    const { owner, relationship } = await requireOwnedRelationship(
      ctx,
      args.sessionToken,
      args.userId,
      args.relationshipId
    );
    if (!relationship) return null;
    const linkedClientUser: any = relationship.clientUserId
      ? await ctx.db.get(relationship.clientUserId)
      : null;
    const pendingClientUser: any = relationship.pendingInviteClientUserId
      ? await ctx.db.get(relationship.pendingInviteClientUserId)
      : null;
    const inviteStatus =
      linkedClientUser?.status === "active"
        ? "active"
        : relationship.inviteTokenHash || linkedClientUser?.status === "pending" || pendingClientUser
          ? "pending"
          : "not_invited";

    const companyId = relationship.companyId;
    const relationshipId = relationship._id;
    const [
      leads,
      properties,
      commercialAccounts,
      walkthroughs,
      proposals,
      serviceAgreements,
      invoices,
      jobs,
    ] = await Promise.all([
      ctx.db.query("clientRequests")
        .withIndex("by_companyId_clientRelationshipId_createdAt", (q: any) =>
          q.eq("companyId", companyId).eq("clientRelationshipId", relationshipId)
        ).order("desc").collect(),
      ctx.db.query("properties")
        .withIndex("by_companyId_clientRelationshipId", (q: any) =>
          q.eq("companyId", companyId).eq("clientRelationshipId", relationshipId)
        ).collect(),
      ctx.db.query("commercialAccounts")
        .withIndex("by_companyId_clientRelationshipId_updatedAt", (q: any) =>
          q.eq("companyId", companyId).eq("clientRelationshipId", relationshipId)
        ).order("desc").collect(),
      ctx.db.query("walkthroughs")
        .withIndex("by_companyId_clientRelationshipId_updatedAt", (q: any) =>
          q.eq("companyId", companyId).eq("clientRelationshipId", relationshipId)
        ).order("desc").collect(),
      ctx.db.query("proposals")
        .withIndex("by_companyId_clientRelationshipId_updatedAt", (q: any) =>
          q.eq("companyId", companyId).eq("clientRelationshipId", relationshipId)
        ).order("desc").collect(),
      ctx.db.query("serviceAgreements")
        .withIndex("by_companyId_clientRelationshipId_updatedAt", (q: any) =>
          q.eq("companyId", companyId).eq("clientRelationshipId", relationshipId)
        ).order("desc").collect(),
      ctx.db.query("invoices")
        .withIndex("by_companyId_clientRelationshipId_updatedAt", (q: any) =>
          q.eq("companyId", companyId).eq("clientRelationshipId", relationshipId)
        ).order("desc").collect(),
      ctx.db.query("jobs")
        .withIndex("by_companyId_clientRelationshipId_scheduledDate", (q: any) =>
          q.eq("companyId", companyId).eq("clientRelationshipId", relationshipId)
        ).order("desc").collect(),
    ]);

    return {
      relationship: {
        _id: relationship._id,
        companyId: relationship.companyId,
        clientUserId: relationship.clientUserId,
        displayName: relationship.displayName,
        clientType: relationship.clientType,
        businessName: relationship.businessName,
        primaryContactName: relationship.primaryContactName,
        email: relationship.email,
        phone: relationship.phone,
        notes: relationship.notes,
        status: relationship.status,
        sourceClientRequestId: relationship.sourceClientRequestId,
        createdAt: relationship.createdAt,
        updatedAt: relationship.updatedAt,
        inviteSentAt: relationship.inviteSentAt,
        inviteStatus,
        hasClientUser: Boolean(relationship.clientUserId),
      },
      leads: hasOwnerOrManagerPermission(owner, "canManageSalesAndCommercial") ? leads : [],
      properties: properties.sort((a: any, b: any) => a.name.localeCompare(b.name)),
      commercialAccounts: hasOwnerOrManagerPermission(owner, "canManageSalesAndCommercial") ? commercialAccounts : [],
      walkthroughs: hasOwnerOrManagerPermission(owner, "canManageSalesAndCommercial") ? walkthroughs : [],
      proposals: hasOwnerOrManagerPermission(owner, "canManageSalesAndCommercial") ? proposals : [],
      serviceAgreements: hasOwnerOrManagerPermission(owner, "canManageSalesAndCommercial") ? serviceAgreements : [],
      invoices: hasOwnerOrManagerPermission(owner, "canViewFinancials") || hasOwnerOrManagerPermission(owner, "canManageInvoices") ? invoices : [],
      jobs: hasOwnerOrManagerPermission(owner, "canSeeAllJobs") ? jobs : [],
    };
  },
});
