import { internalQuery, query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { resourceUploadKey } from "../lib/companyResources";

const status = v.union(v.literal("active"), v.literal("archived"));

export const list = query({
  args: { sessionToken: v.string(), status },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageDocuments");
    const resources = await ctx.db.query("companyResources")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", user.companyId).eq("status", args.status))
      .order("desc").take(201);
    return { rows: resources.slice(0, 200), limited: resources.length > 200 };
  },
});

export const prepareUpload = internalQuery({
  args: {
    sessionToken: v.string(), requestId: v.string(),
    resourceId: v.optional(v.id("companyResources")),
    expectedStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageDocuments");
    const uploadKey = resourceUploadKey(user._id, args.requestId, args.resourceId);
    const prior = await ctx.db.query("companyResources")
      .withIndex("by_company_upload_request", (q) => q.eq("companyId", user.companyId).eq("lastUploadRequestId", uploadKey)).first();
    if (prior) {
      return { resourceId: prior._id, reused: true };
    }
    if (args.resourceId) {
      const resource = await ctx.db.get(args.resourceId);
      if (!resource || resource.companyId !== user.companyId) throw new Error("Resource unavailable");
      if (resource.status !== "active") throw new Error("Restore this resource before replacing its file");
      if (resource.storageId !== args.expectedStorageId) throw new Error("Resource file changed. Refresh and try again");
    } else if (args.expectedStorageId) throw new Error("Unexpected replacement file state");
    return { resourceId: null, reused: false };
  },
});

export const getForRead = internalQuery({
  args: { sessionToken: v.string(), resourceId: v.id("companyResources") },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageDocuments");
    const resource = await ctx.db.get(args.resourceId);
    if (!resource || resource.companyId !== user.companyId) throw new Error("Resource unavailable");
    return { storageId: resource.storageId, originalFileName: resource.originalFileName, mimeType: resource.mimeType, sizeBytes: resource.sizeBytes };
  },
});
