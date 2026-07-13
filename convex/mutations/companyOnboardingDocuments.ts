import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessionAuth";
import { standardCompanyOnboardingDocumentForKey } from "../lib/companyOnboardingDocuments";

const roleVisibilityValidator = v.union(
  v.literal("cleaner"),
  v.literal("maintenance"),
  v.literal("both")
);

const statusValidator = v.union(
  v.literal("active"),
  v.literal("inactive")
);

function cleanString(value: string, max = 200) {
  const trimmed = value.trim().slice(0, max);
  if (!trimmed) throw new Error("Required text is missing");
  return trimmed;
}

function cleanOptionalString(value: string | undefined, max = 1000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

async function getExisting(ctx: any, companyId: any, documentKey: string) {
  return await ctx.db
    .query("companyOnboardingDocuments")
    .withIndex("by_companyId_documentKey", (q: any) =>
      q.eq("companyId", companyId).eq("documentKey", documentKey)
    )
    .first();
}

export const upsertMetadata = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    documentKey: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    required: v.boolean(),
    roleVisibility: roleVisibilityValidator,
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const db: any = ctx.db;
    const now = Date.now();
    const documentKey = cleanString(args.documentKey, 120);
    const title = cleanString(args.title, 200);
    const description = cleanOptionalString(args.description);
    const existing = await getExisting({ ...ctx, db }, owner.companyId, documentKey);

    const patch = {
      title,
      description,
      required: args.required,
      roleVisibility: args.roleVisibility,
      status: args.status,
      updatedAt: now,
    };

    if (existing) {
      await db.patch(existing._id, patch);
      return existing._id;
    }

    return await db.insert("companyOnboardingDocuments", {
      companyId: owner.companyId,
      documentKey,
      ...patch,
      createdAt: now,
    });
  },
});

export const attachPdf = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    documentKey: v.string(),
    storageId: v.id("_storage"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    required: v.optional(v.boolean()),
    roleVisibility: v.optional(roleVisibilityValidator),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const db: any = ctx.db;
    const now = Date.now();
    const documentKey = cleanString(args.documentKey, 120);
    const standard = standardCompanyOnboardingDocumentForKey(documentKey);
    const existing = await getExisting({ ...ctx, db }, owner.companyId, documentKey);

    const patch = {
      title: cleanString(args.title ?? existing?.title ?? standard?.title ?? documentKey, 200),
      description: cleanOptionalString(args.description ?? existing?.description ?? standard?.description),
      storageId: args.storageId,
      required: args.required ?? existing?.required ?? standard?.required ?? true,
      roleVisibility: args.roleVisibility ?? existing?.roleVisibility ?? standard?.roleVisibility ?? "both",
      status: args.status ?? existing?.status ?? "active",
      updatedAt: now,
    };

    if (existing) {
      await db.patch(existing._id, patch);
      return existing._id;
    }

    return await db.insert("companyOnboardingDocuments", {
      companyId: owner.companyId,
      documentKey,
      ...patch,
      createdAt: now,
    });
  },
});

export const removePdf = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    documentKey: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const db: any = ctx.db;
    const existing = await getExisting({ ...ctx, db }, owner.companyId, cleanString(args.documentKey, 120));
    if (!existing) return null;

    await db.patch(existing._id, {
      storageId: undefined,
      updatedAt: Date.now(),
    });
    return existing._id;
  },
});
