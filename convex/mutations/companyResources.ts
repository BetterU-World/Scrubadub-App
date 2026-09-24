import { internalMutation, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { cleanResourceDescription, cleanResourceTitle, resourceUploadKey } from "../lib/companyResources";

const mime = v.union(v.literal("application/pdf"), v.literal("image/jpeg"), v.literal("image/png"), v.literal("image/webp"));

async function ownedResource(ctx: any, sessionToken: string, resourceId: any) {
  const user = await requireOwnerOrManagerCapability(ctx, sessionToken, undefined, "canManageDocuments");
  const resource = await ctx.db.get(resourceId);
  if (!resource || resource.companyId !== user.companyId) throw new Error("Resource unavailable");
  return { user, resource };
}

/** Called only after the HTTP action has inspected the uploaded bytes. */
export const finalizeUpload = internalMutation({
  args: {
    sessionToken: v.string(), requestId: v.string(),
    resourceId: v.optional(v.id("companyResources")),
    expectedStorageId: v.optional(v.id("_storage")),
    storageId: v.id("_storage"), title: v.string(), description: v.optional(v.string()),
    originalFileName: v.string(), mimeType: mime, sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageDocuments");
    const uploadKey = resourceUploadKey(user._id, args.requestId, args.resourceId);
    const prior = await ctx.db.query("companyResources")
      .withIndex("by_company_upload_request", (q) => q.eq("companyId", user.companyId).eq("lastUploadRequestId", uploadKey)).first();
    if (prior) return { resourceId: prior._id, reused: true };
    const stored = await ctx.db.system.get("_storage", args.storageId);
    if (!stored || stored.size !== args.sizeBytes) throw new Error("Uploaded file metadata is invalid");
    const title = cleanResourceTitle(args.title);
    const description = cleanResourceDescription(args.description);
    const now = Date.now();
    if (args.resourceId) {
      const resource = await ctx.db.get(args.resourceId);
      if (!resource || resource.companyId !== user.companyId) throw new Error("Resource unavailable");
      if (resource.status !== "active") throw new Error("Restore this resource before replacing its file");
      if (resource.storageId !== args.expectedStorageId) throw new Error("Resource file changed. Refresh and try again");
      await ctx.db.patch(resource._id, {
        title, description, storageId: args.storageId, originalFileName: args.originalFileName,
        mimeType: args.mimeType, sizeBytes: args.sizeBytes, updatedAt: now,
        updatedByUserId: user._id, lastUploadRequestId: uploadKey,
      });
      await ctx.storage.delete(resource.storageId);
      return { resourceId: resource._id, reused: false };
    }
    if (args.expectedStorageId) throw new Error("Unexpected replacement file state");
    const resourceId = await ctx.db.insert("companyResources", {
      companyId: user.companyId, title, description, storageId: args.storageId,
      originalFileName: args.originalFileName, mimeType: args.mimeType, sizeBytes: args.sizeBytes,
      status: "active", createdAt: now, updatedAt: now,
      createdByUserId: user._id, updatedByUserId: user._id, lastUploadRequestId: uploadKey,
    });
    return { resourceId, reused: false };
  },
});

export const updateDetails = mutation({
  args: { sessionToken: v.string(), resourceId: v.id("companyResources"), title: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user, resource } = await ownedResource(ctx, args.sessionToken, args.resourceId);
    await ctx.db.patch(resource._id, {
      title: cleanResourceTitle(args.title), description: cleanResourceDescription(args.description),
      updatedAt: Date.now(), updatedByUserId: user._id,
    });
    return resource._id;
  },
});

export const archive = mutation({
  args: { sessionToken: v.string(), resourceId: v.id("companyResources") },
  handler: async (ctx, args) => {
    const { user, resource } = await ownedResource(ctx, args.sessionToken, args.resourceId);
    if (resource.status !== "active") throw new Error("Resource is already archived");
    await ctx.db.patch(resource._id, { status: "archived", updatedAt: Date.now(), updatedByUserId: user._id });
    return resource._id;
  },
});

export const restore = mutation({
  args: { sessionToken: v.string(), resourceId: v.id("companyResources") },
  handler: async (ctx, args) => {
    const { user, resource } = await ownedResource(ctx, args.sessionToken, args.resourceId);
    if (resource.status !== "archived") throw new Error("Resource is already active");
    await ctx.db.patch(resource._id, { status: "active", updatedAt: Date.now(), updatedByUserId: user._id });
    return resource._id;
  },
});

export const deleteArchived = mutation({
  args: { sessionToken: v.string(), resourceId: v.id("companyResources") },
  handler: async (ctx, args) => {
    const { resource } = await ownedResource(ctx, args.sessionToken, args.resourceId);
    if (resource.status !== "archived") throw new Error("Archive this resource before deleting it permanently");
    const assignment = await ctx.db.query("clientResourceAssignments")
      .withIndex("by_company_resource_relationship", (q) => q.eq("companyId", resource.companyId).eq("resourceId", resource._id))
      .first();
    if (assignment) throw new Error("Remove client access before deleting this resource permanently");
    await ctx.storage.delete(resource.storageId);
    await ctx.db.delete(resource._id);
    return resource._id;
  },
});
