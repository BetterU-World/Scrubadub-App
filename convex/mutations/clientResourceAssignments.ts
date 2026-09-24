import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";

export const addResourcesToClient = mutation({
  args: {
    sessionToken: v.string(),
    clientRelationshipId: v.id("clientRelationships"),
    resourceIds: v.array(v.id("companyResources")),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageClients");
    const relationship = await ctx.db.get(args.clientRelationshipId);
    if (!relationship || relationship.companyId !== user.companyId) throw new Error("Client relationship unavailable");
    if (relationship.status !== "active") throw new Error("Client relationship must be active");
    const ids = [...new Set(args.resourceIds)];
    if (!ids.length || ids.length > 200) throw new Error("Select 1–200 Resources");
    const resources = await Promise.all(ids.map((id) => ctx.db.get(id)));
    // Check the whole batch before inserting anything. Convex mutation writes are atomic.
    if (resources.some((resource) => !resource || resource.companyId !== user.companyId || resource.status !== "active")) {
      throw new Error("Active company Resource required");
    }
    let added = 0;
    for (const resourceId of ids) {
      const prior = await ctx.db.query("clientResourceAssignments")
        .withIndex("by_company_relationship_resource", (q) => q.eq("companyId", user.companyId).eq("clientRelationshipId", relationship._id).eq("resourceId", resourceId))
        .first();
      if (prior) continue;
      await ctx.db.insert("clientResourceAssignments", {
        companyId: user.companyId, clientRelationshipId: relationship._id, resourceId,
        assignedAt: Date.now(), assignedByUserId: user._id,
      });
      added += 1;
    }
    return { added, alreadyShared: ids.length - added };
  },
});

export const removeAccess = mutation({
  args: {
    sessionToken: v.string(),
    clientRelationshipId: v.id("clientRelationships"),
    resourceId: v.id("companyResources"),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageClients");
    const relationship = await ctx.db.get(args.clientRelationshipId);
    if (!relationship || relationship.companyId !== user.companyId) throw new Error("Client relationship unavailable");
    const assignment = await ctx.db.query("clientResourceAssignments")
      .withIndex("by_company_relationship_resource", (q) => q.eq("companyId", user.companyId).eq("clientRelationshipId", relationship._id).eq("resourceId", args.resourceId))
      .first();
    if (!assignment) return { removed: false };
    await ctx.db.delete(assignment._id);
    return { removed: true };
  },
});
