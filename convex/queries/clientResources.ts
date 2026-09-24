import { internalQuery, query } from "../_generated/server";
import { v } from "convex/values";
import { requireVerifiedClientSession } from "../lib/sessionAuth";

async function activeRelationships(ctx: any, sessionToken: string) {
  const clientUser = await requireVerifiedClientSession(ctx, sessionToken);
  const relationships = await ctx.db.query("clientRelationships")
    .withIndex("by_clientUserId", (q: any) => q.eq("clientUserId", clientUser._id)).take(500);
  return { clientUser, relationships: relationships.filter((relationship: any) => relationship.status === "active") };
}

export const listVisible = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { clientUser, relationships } = await activeRelationships(ctx, args.sessionToken);
    const byResource = new Map<string, any>();
    let limited = false;
    for (const relationship of relationships) {
      const assignments = await ctx.db.query("clientResourceAssignments")
        .withIndex("by_company_relationship_resource", (q) => q.eq("companyId", relationship.companyId).eq("clientRelationshipId", relationship._id))
        .take(201);
      if (assignments.length > 200) limited = true;
      const company: any = await ctx.db.get(relationship.companyId);
      for (const assignment of assignments.slice(0, 200)) {
        const resource = await ctx.db.get(assignment.resourceId);
        if (!resource || resource.companyId !== relationship.companyId || resource.status !== "active") continue;
        if (!byResource.has(resource._id)) byResource.set(resource._id, {
          resourceId: resource._id, title: resource.title, description: resource.description,
          mimeType: resource.mimeType, originalFileName: resource.originalFileName,
          updatedAt: resource.updatedAt, providerName: company?.name ?? "Provider",
        });
      }
    }
    return { clientName: clientUser.displayName, rows: [...byResource.values()].sort((a, b) => a.title.localeCompare(b.title)), limited };
  },
});

export const getForRead = internalQuery({
  args: { sessionToken: v.string(), resourceId: v.id("companyResources") },
  handler: async (ctx, args) => {
    const { relationships } = await activeRelationships(ctx, args.sessionToken);
    const resource = await ctx.db.get(args.resourceId);
    if (!resource || resource.status !== "active") throw new Error("Resource unavailable");
    for (const relationship of relationships) {
      if (relationship.companyId !== resource.companyId) continue;
      const assignment = await ctx.db.query("clientResourceAssignments")
        .withIndex("by_company_relationship_resource", (q) => q.eq("companyId", resource.companyId).eq("clientRelationshipId", relationship._id).eq("resourceId", resource._id))
        .first();
      if (assignment) return {
        storageId: resource.storageId, originalFileName: resource.originalFileName, mimeType: resource.mimeType, sizeBytes: resource.sizeBytes,
      };
    }
    throw new Error("Resource unavailable");
  },
});
