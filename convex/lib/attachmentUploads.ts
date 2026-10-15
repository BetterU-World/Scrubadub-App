import { v, type Infer } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireAssignedJobExecutor } from "./jobExecutionAuth";
import { requireOwnerManagerSession, requireOwnerOrManagerCapability, requireWorkerSession } from "./sessionAuth";
import { hasManagerPermission } from "./auth";
import { isUserAssignedToJob } from "./teams";

export const attachmentTarget = v.union(
  v.object({ kind: v.literal("formPhoto"), formId: v.id("forms") }),
  v.object({ kind: v.literal("formItemPhoto"), itemId: v.id("formItems") }),
  v.object({ kind: v.literal("inspectionPhoto"), jobId: v.id("jobs") }),
  v.object({ kind: v.literal("redFlagPhoto"), jobId: v.id("jobs") }),
  v.object({ kind: v.literal("onboardingPdf"), documentKey: v.string() }),
);
export type AttachmentTarget = Infer<typeof attachmentTarget>;
type Ctx = QueryCtx | MutationCtx;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export function attachmentTargetKey(target: AttachmentTarget): string {
  if (target.kind === "onboardingPdf") {
    const key = target.documentKey.trim();
    if (!key || key.length > 120) throw new Error("Invalid document key");
    return `${target.kind}:${key}`;
  }
  return `${target.kind}:${"formId" in target ? target.formId : "itemId" in target ? target.itemId : target.jobId}`;
}

/** The same current resource policy is checked at issuance and inside the commit. */
export async function authorizeAttachment(ctx: Ctx, sessionToken: string, target: AttachmentTarget) {
  if (target.kind === "onboardingPdf") {
    attachmentTargetKey(target);
    return requireOwnerOrManagerCapability(ctx, sessionToken, undefined, "canManageDocuments");
  }
  if (target.kind === "formPhoto" || target.kind === "formItemPhoto") {
    const item = target.kind === "formItemPhoto" ? await ctx.db.get(target.itemId) : null;
    const formId = target.kind === "formPhoto" ? target.formId : item?.formId;
    const form = formId ? await ctx.db.get(formId) : null;
    if (!form || form.status === "submitted" || form.status === "approved") throw new Error("Editable form required");
    const { user } = await requireAssignedJobExecutor(ctx, sessionToken, form.jobId);
    if (form.companyId !== user.companyId) throw new Error("Access denied");
    return user;
  }
  const user = target.kind === "inspectionPhoto"
    ? await requireOwnerManagerSession(ctx, sessionToken)
    : await requireWorkerSession(ctx, sessionToken);
  const job = await ctx.db.get(target.jobId);
  if (!job || job.companyId !== user.companyId) throw new Error("Access denied");
  if (target.kind === "inspectionPhoto") {
    if (user.role !== "manager") throw new Error("Manager access required");
    if (!hasManagerPermission(user, "canSeeAllJobs") && job.assignedManagerId !== user._id && !await isUserAssignedToJob(ctx, job, user._id)) throw new Error("Access denied");
    if (job.inspectionCycleOpen === false) throw new Error("Inspection cycle is closed");
  } else if (!await isUserAssignedToJob(ctx, job, user._id)) throw new Error("Not assigned to perform this job");
  return user;
}

/** No fallback adopts old storage IDs. Existing attached references need no rewrite. */
export async function consumeAttachmentUpload(ctx: MutationCtx, sessionToken: string,
  target: AttachmentTarget, storageId: Id<"_storage">, intentId: Id<"attachmentUploadIntents"> | undefined) {
  const user = await authorizeAttachment(ctx, sessionToken, target);
  if (!intentId) throw new Error("A bound attachment upload is required");
  const intent = await ctx.db.get(intentId);
  if (!intent || intent.userId !== user._id || intent.companyId !== user.companyId ||
    intent.targetKey !== attachmentTargetKey(target) || intent.status !== "pending" || intent.expiresAt <= Date.now()) {
    throw new Error("Attachment upload unavailable");
  }
  const stored = await ctx.db.system.get("_storage", storageId);
  if (!stored || stored._creationTime < intent.createdAt || stored.size <= 0 || stored.size > ATTACHMENT_MAX_BYTES ||
    stored.contentType !== `${intent.mimeType}; scrub-attachment=${intent.nonce}`) {
    throw new Error("File is not bound to this attachment upload");
  }
  const prior = await ctx.db.query("attachmentUploadIntents").withIndex("by_storageId", q => q.eq("storageId", storageId)).first();
  if (prior) throw new Error("File is already attached");
  await ctx.db.patch(intent._id, { status: "attached", storageId });
}
