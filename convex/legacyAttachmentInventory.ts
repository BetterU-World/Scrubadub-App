import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Operator-only metadata inventory. Never resolves/downloads a file or assigns ownership. */
export const page = internalQuery({
  args: {
    source: v.union(v.literal("forms"), v.literal("formItems"), v.literal("redFlags"), v.literal("managerInspections"), v.literal("companyOnboardingDocuments"), v.literal("sharedJobs")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(v.object({ resourceId: v.string(), companyId: v.union(v.id("companies"), v.null()), storageId: v.id("_storage"),
      provenance: v.union(v.literal("legacy_unverified"), v.literal("bound"), v.literal("explicit_share"), v.literal("conflict")) })),
    continueCursor: v.string(), isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 25) throw new Error("Inventory page size must be 1–25");
    const result = await ctx.db.query(args.source).withIndex("by_creation_time").paginate(args.paginationOpts);
    const rows: Array<{ resourceId: string; companyId: Id<"companies"> | null; storageId: Id<"_storage">;
      provenance: "legacy_unverified" | "bound" | "explicit_share" | "conflict" }> = [];
    for (const resource of result.page) {
      let companyId: Id<"companies"> | null = "companyId" in resource ? resource.companyId : null;
      if ("formId" in resource) companyId = (await ctx.db.get(resource.formId))?.companyId ?? null;
      if ("fromCompanyId" in resource) companyId = resource.fromCompanyId;
      const ids: Id<"_storage">[] = [];
      if ("photoStorageIds" in resource) ids.push(...resource.photoStorageIds ?? []);
      if ("photoStorageId" in resource && resource.photoStorageId) ids.push(resource.photoStorageId);
      if ("signatureStorageId" in resource && resource.signatureStorageId) ids.push(resource.signatureStorageId);
      if ("storageId" in resource && resource.storageId) ids.push(resource.storageId);
      if (ids.length > 100) throw new Error("Oversized legacy attachment list; operator reconciliation required");
      for (const storageId of new Set(ids)) {
        const intent = await ctx.db.query("attachmentUploadIntents").withIndex("by_storageId", q => q.eq("storageId", storageId)).unique();
        const copiedJob = "copiedJobId" in resource ? await ctx.db.get(resource.copiedJobId) : null;
        const originalJob = "originalJobId" in resource ? await ctx.db.get(resource.originalJobId) : null;
        const explicitlyShared = "sharePackage" in resource && resource.sharePackage === true && resource.status === "completed" &&
          originalJob?.companyId === resource.fromCompanyId && copiedJob?.companyId === resource.toCompanyId && copiedJob?.sharedFromJobId === resource.originalJobId;
        const targetKey = args.source === "forms" ? `formPhoto:${resource._id}` :
          args.source === "formItems" ? `formItemPhoto:${resource._id}` :
          args.source === "companyOnboardingDocuments" && "documentKey" in resource ? `onboardingPdf:${resource.documentKey}` :
          args.source === "managerInspections" && "jobId" in resource ? `inspectionPhoto:${resource.jobId}` :
          args.source === "redFlags" && "jobId" in resource ? `redFlagPhoto:${resource.jobId}` : null;
        rows.push({ resourceId: resource._id, companyId, storageId,
          provenance: explicitlyShared ? "explicit_share" : !intent ? "legacy_unverified" :
            intent.companyId === companyId && intent.targetKey === targetKey && intent.status === "attached" ? "bound" : "conflict" });
      }
    }
    return { page: rows, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});
