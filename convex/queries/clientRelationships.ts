import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner } from "../lib/helpers";

const RELATIONSHIP_LIST_CAP = 2_000;
const DETAIL_LIST_CAP = 500;

async function requireOwnedRelationship(ctx: any, userId: any, relationshipId: any) {
  const owner = await requireOwner(ctx, userId);
  const relationship = await ctx.db.get(relationshipId);
  if (!relationship) return { owner, relationship: null };
  if (relationship.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, relationship };
}

async function countsForRelationship(ctx: any, relationship: any) {
  const [requests, accounts, properties, invoices] = await Promise.all([
    ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", relationship.companyId))
      .collect(),
    ctx.db
      .query("commercialAccounts")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", relationship.companyId))
      .collect(),
    ctx.db
      .query("properties")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", relationship.companyId))
      .collect(),
    ctx.db
      .query("invoices")
      .withIndex("by_company", (q: any) => q.eq("companyId", relationship.companyId))
      .collect(),
  ]);

  return {
    requestCount: requests.filter((item: any) => item.clientRelationshipId === relationship._id).length,
    commercialAccountCount: accounts.filter((item: any) => item.clientRelationshipId === relationship._id).length,
    propertyCount: properties.filter((item: any) => item.clientRelationshipId === relationship._id).length,
    invoiceCount: invoices.filter((item: any) => item.clientRelationshipId === relationship._id).length,
  };
}

export const list = query({
  args: {
    userId: v.id("users"),
    status: v.optional(
      v.union(v.literal("active"), v.literal("inactive"), v.literal("archived"))
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
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
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
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
    relationshipId: v.id("clientRelationships"),
  },
  handler: async (ctx, args) => {
    const { relationship } = await requireOwnedRelationship(
      ctx,
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

async function relatedByRelationship(ctx: any, table: any, index: string, companyId: any, relationshipId: any) {
  const records = await ctx.db
    .query(table)
    .withIndex(index, (q: any) => q.eq("companyId", companyId))
    .take(DETAIL_LIST_CAP);

  return records.filter((record: any) => record.clientRelationshipId === relationshipId);
}

export const getClientRelationshipDetail = query({
  args: {
    userId: v.id("users"),
    relationshipId: v.id("clientRelationships"),
  },
  handler: async (ctx, args) => {
    const { relationship } = await requireOwnedRelationship(
      ctx,
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
      relatedByRelationship(ctx, "clientRequests", "by_companyId", companyId, relationshipId),
      relatedByRelationship(ctx, "properties", "by_companyId", companyId, relationshipId),
      relatedByRelationship(ctx, "commercialAccounts", "by_companyId", companyId, relationshipId),
      relatedByRelationship(ctx, "walkthroughs", "by_company", companyId, relationshipId),
      relatedByRelationship(ctx, "proposals", "by_companyId", companyId, relationshipId),
      relatedByRelationship(ctx, "serviceAgreements", "by_company", companyId, relationshipId),
      relatedByRelationship(ctx, "invoices", "by_company", companyId, relationshipId),
      relatedByRelationship(ctx, "jobs", "by_companyId_scheduledDate", companyId, relationshipId),
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
      leads: leads.sort((a: any, b: any) => b.createdAt - a.createdAt),
      properties: properties.sort((a: any, b: any) => a.name.localeCompare(b.name)),
      commercialAccounts: commercialAccounts.sort((a: any, b: any) => b.updatedAt - a.updatedAt),
      walkthroughs: walkthroughs.sort((a: any, b: any) => b.updatedAt - a.updatedAt),
      proposals: proposals.sort((a: any, b: any) => b.updatedAt - a.updatedAt),
      serviceAgreements: serviceAgreements.sort((a: any, b: any) => b.updatedAt - a.updatedAt),
      invoices: invoices.sort((a: any, b: any) => b.updatedAt - a.updatedAt),
      jobs: jobs.sort((a: any, b: any) => b.scheduledDate.localeCompare(a.scheduledDate)),
    };
  },
});
