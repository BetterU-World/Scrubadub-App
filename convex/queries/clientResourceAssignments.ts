import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";

export const listForRelationship = query({
  args: { sessionToken: v.string(), clientRelationshipId: v.id("clientRelationships") },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageClients");
    const relationship = await ctx.db.get(args.clientRelationshipId);
    if (!relationship || relationship.companyId !== user.companyId) throw new Error("Client relationship unavailable");
    const assignments = await ctx.db.query("clientResourceAssignments")
      .withIndex("by_company_relationship_resource", (q) => q.eq("companyId", user.companyId).eq("clientRelationshipId", relationship._id))
      .take(201);
    const rows = await Promise.all(assignments.slice(0, 200).map(async (assignment) => {
      const resource = await ctx.db.get(assignment.resourceId);
      if (!resource || resource.companyId !== user.companyId) return null;
      return {
        resourceId: resource._id, title: resource.title, description: resource.description,
        originalFileName: resource.originalFileName, mimeType: resource.mimeType,
        updatedAt: resource.updatedAt, status: resource.status,
      };
    }));
    return { rows: rows.filter((row) => row !== null), limited: assignments.length > 200 };
  },
});

export const listActiveForPicker = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageClients");
    const resources = await ctx.db.query("companyResources")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", user.companyId).eq("status", "active"))
      .order("desc").take(201);
    return {
      rows: resources.slice(0, 200).map((resource) => ({
        resourceId: resource._id, title: resource.title, description: resource.description,
        originalFileName: resource.originalFileName, mimeType: resource.mimeType,
        updatedAt: resource.updatedAt,
      })),
      limited: resources.length > 200,
    };
  },
});

export const countsForResources = query({
  args: { sessionToken: v.string(), resourceIds: v.array(v.id("companyResources")) },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageDocuments");
    const ids = [...new Set(args.resourceIds)];
    if (ids.length > 200) throw new Error("Too many Resources");
    const resources = await Promise.all(ids.map((id) => ctx.db.get(id)));
    if (resources.some((resource) => !resource || resource.companyId !== user.companyId)) throw new Error("Resource unavailable");
    const counts = await Promise.all(ids.map(async (resourceId) => {
      const rows = await ctx.db.query("clientResourceAssignments")
        .withIndex("by_company_resource_relationship", (q) => q.eq("companyId", user.companyId).eq("resourceId", resourceId))
        .take(1001);
      return [resourceId, { count: Math.min(rows.length, 1000), limited: rows.length > 1000 }] as const;
    }));
    return Object.fromEntries(counts);
  },
});
