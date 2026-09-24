import { internalMutation, internalQuery, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { cleanResourceDescription, cleanResourceFilename, cleanResourceTitle, cleanUploadRequestId, RESOURCE_MIME_TYPES } from "../lib/companyResources";

const HOUR = 60 * 60 * 1000;

export const begin = mutation({
  args: {
    sessionToken: v.string(), requestId: v.string(), title: v.string(), description: v.optional(v.string()),
    originalFileName: v.string(), declaredMimeType: v.string(),
    resourceId: v.optional(v.id("companyResources")), expectedStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageDocuments");
    const requestId = cleanUploadRequestId(args.requestId);
    const title = cleanResourceTitle(args.title);
    const description = cleanResourceDescription(args.description);
    const originalFileName = cleanResourceFilename(args.originalFileName);
    if (!RESOURCE_MIME_TYPES.includes(args.declaredMimeType as any)) throw new Error("Unsupported Resource file type");
    const prior = await ctx.db.query("resourceUploadIntents").withIndex("by_user_request", q => q.eq("userId", user._id).eq("requestId", requestId)).first();
    if (prior) {
      if (prior.companyId !== user.companyId || prior.resourceId !== args.resourceId || prior.expectedStorageId !== args.expectedStorageId || prior.title !== title || prior.description !== description || prior.originalFileName !== originalFileName || prior.declaredMimeType !== args.declaredMimeType) throw new Error("Upload request ID already used");
      if (prior.status === "completed") return { intentId: prior._id, nonce: prior.nonce, candidateStorageId: null, resourceId: prior.completedResourceId, uploadUrl: null };
      if (prior.status !== "pending" || prior.expiresAt < Date.now()) throw new Error("Upload intent expired. Start a new upload");
      return { intentId: prior._id, nonce: prior.nonce, candidateStorageId: prior.candidateStorageId ?? null, resourceId: null, uploadUrl: prior.candidateStorageId ? null : await ctx.storage.generateUploadUrl() };
    }
    if (args.resourceId) {
      const current = await ctx.db.get(args.resourceId);
      if (!current || current.companyId !== user.companyId) throw new Error("Resource unavailable");
      if (current.status !== "active" || current.storageId !== args.expectedStorageId) throw new Error("Resource file changed. Refresh and try again");
    } else if (args.expectedStorageId) throw new Error("Unexpected replacement file state");
    const nonce = crypto.randomUUID();
    const createdAt = Date.now();
    const intentId = await ctx.db.insert("resourceUploadIntents", {
      companyId: user.companyId, userId: user._id, requestId, resourceId: args.resourceId,
      expectedStorageId: args.expectedStorageId, title, description, originalFileName,
      declaredMimeType: args.declaredMimeType, nonce, status: "pending", createdAt, expiresAt: createdAt + HOUR,
    });
    return { intentId, nonce, candidateStorageId: null, resourceId: null, uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const inspect = internalQuery({
  args: { sessionToken: v.string(), intentId: v.id("resourceUploadIntents"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageDocuments");
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.companyId !== user.companyId || intent.userId !== user._id) throw new Error("Upload intent unavailable");
    if (intent.status === "completed") return { intent, stored: null };
    if (intent.status !== "pending" || intent.expiresAt < Date.now()) throw new Error("Upload intent expired");
    const stored = await ctx.db.system.get("_storage", args.storageId);
    if (!stored || stored._creationTime < intent.createdAt || stored.contentType !== `${intent.declaredMimeType}; scrub-intent=${intent.nonce}`) throw new Error("Uploaded file is not bound to this Resource intent");
    if (intent.candidateStorageId && intent.candidateStorageId !== args.storageId) throw new Error("A different candidate is already registered");
    return { intent, stored };
  },
});

export const registerCandidate = mutation({
  args: { sessionToken: v.string(), intentId: v.id("resourceUploadIntents"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageDocuments");
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.companyId !== user.companyId || intent.userId !== user._id || intent.status !== "pending" || intent.expiresAt < Date.now()) throw new Error("Upload intent unavailable");
    const stored = await ctx.db.system.get("_storage", args.storageId);
    if (!stored || stored._creationTime < intent.createdAt || stored.contentType !== `${intent.declaredMimeType}; scrub-intent=${intent.nonce}`) throw new Error("Uploaded file is not bound to this Resource intent");
    if (intent.candidateStorageId && intent.candidateStorageId !== args.storageId) throw new Error("A different candidate is already registered");
    await ctx.db.patch(intent._id, { candidateStorageId: args.storageId });
    return true;
  },
});

export const cancel = mutation({
  args: { sessionToken: v.string(), intentId: v.id("resourceUploadIntents"), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, undefined, "canManageDocuments");
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.companyId !== user.companyId || intent.userId !== user._id) throw new Error("Upload intent unavailable");
    if (intent.status !== "pending") return false;
    if (args.storageId && intent.candidateStorageId && args.storageId !== intent.candidateStorageId) throw new Error("Different candidate is registered");
    const storageId = args.storageId ?? intent.candidateStorageId;
    if (storageId) {
      const stored = await ctx.db.system.get("_storage", storageId);
      if (!stored || stored._creationTime < intent.createdAt || stored.contentType !== `${intent.declaredMimeType}; scrub-intent=${intent.nonce}`) throw new Error("Candidate is not bound to this intent");
      await ctx.storage.delete(storageId);
    }
    await ctx.db.patch(intent._id, { status: "cancelled", candidateStorageId: undefined });
    return true;
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db.query("resourceUploadIntents").withIndex("by_status_expiry", q => q.eq("status", "pending").lt("expiresAt", Date.now())).take(25);
    for (const intent of expired) {
      if (intent.candidateStorageId) await ctx.storage.delete(intent.candidateStorageId);
      await ctx.db.patch(intent._id, { status: "cancelled", candidateStorageId: undefined });
    }
    return expired.length;
  },
});

/** Operator-only reconciliation for an upload that finished before the browser registered its storage ID. */
export const reconcileOrphan = internalMutation({
  args: { intentId: v.id("resourceUploadIntents"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.status === "completed" || intent.status === "pending" && intent.expiresAt >= Date.now()) throw new Error("Intent is not eligible for orphan reconciliation");
    if (intent.candidateStorageId && intent.candidateStorageId !== args.storageId) throw new Error("Different candidate is registered");
    const stored = await ctx.db.system.get("_storage", args.storageId);
    if (!stored || stored._creationTime < intent.createdAt || stored.contentType !== `${intent.declaredMimeType}; scrub-intent=${intent.nonce}`) throw new Error("Storage object is not bound to the expired Resource intent");
    const resource = await ctx.db.query("companyResources").withIndex("by_storageId", q => q.eq("storageId", args.storageId)).first();
    if (resource) throw new Error("Storage object belongs to an active Resource record");
    await ctx.storage.delete(args.storageId);
    await ctx.db.patch(intent._id, { status: "cancelled", candidateStorageId: undefined });
    return { deleted: true, storageId: args.storageId };
  },
});
