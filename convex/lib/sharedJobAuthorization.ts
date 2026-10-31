import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = MutationCtx | QueryCtx;
export const SHARED_JOB_REVIEW = "Shared work needs manual review. Contact your company Owner; existing work and financial evidence have been preserved.";
export const SHARED_JOB_PENDING = "Your company Owner must accept this shared-work request before assignment or execution.";
export const SHARED_JOB_REJECTED = "This shared-work request was rejected. Operational changes are unavailable.";

/** Inspect both the marker and indexed reverse link; neither alone is trusted. */
export async function recipientSharedJob(ctx: Ctx, job: Doc<"jobs">) {
  const rows = await ctx.db.query("sharedJobs")
    .withIndex("by_copiedJobId", q => q.eq("copiedJobId", job._id)).take(2);
  if (!job.sharedFromJobId && !job.sharedFromCompanyName && rows.length === 0) return null;
  if (rows.length !== 1) throw new Error(SHARED_JOB_REVIEW);
  const share = rows[0];
  const original = await ctx.db.get(share.originalJobId);
  if (!original || !job.sharedFromJobId || job.sharedFromJobId !== original._id ||
      original._id === job._id || share.fromCompanyId === share.toCompanyId ||
      share.toCompanyId !== job.companyId || original.companyId !== share.fromCompanyId) {
    throw new Error(SHARED_JOB_REVIEW);
  }
  return share;
}

export async function requireSharedJobAccepted(ctx: Ctx, job: Doc<"jobs">) {
  const share = await recipientSharedJob(ctx, job);
  if (!share) return;
  if (share.status === "pending") {
    if (!await pendingCopyIsUntouched(ctx, job) || !await hasActivePartnerConnection(ctx, share)) {
      throw new Error(SHARED_JOB_REVIEW);
    }
    throw new Error(SHARED_JOB_PENDING);
  }
  if (share.status === "rejected") throw new Error(SHARED_JOB_REJECTED);
  // Accepted shared state never replaces the caller's ordinary job-state checks.
}

/** Read-only UI projection. Viewing and recipient responses must remain available. */
export async function sharedJobAccess(ctx: Ctx, job: Doc<"jobs">) {
  try {
    const share = await recipientSharedJob(ctx, job);
    if (share?.status === "pending" && (!await pendingCopyIsUntouched(ctx, job) ||
        !await hasActivePartnerConnection(ctx, share))) {
      return { allowed: false, status: "manual_review" as const };
    }
    return { allowed: !share || !["pending", "rejected"].includes(share.status),
      status: share?.status ?? null };
  } catch {
    return { allowed: false, status: "manual_review" as const };
  }
}

export async function hasActivePartnerConnection(ctx: Ctx, share: Doc<"sharedJobs">) {
  for (const companyAId of [share.fromCompanyId, share.toCompanyId]) {
    const rows = await ctx.db.query("ownerConnections")
      .withIndex("by_companyAId", q => q.eq("companyAId", companyAId)).take(501);
    if (rows.length > 500) throw new Error(SHARED_JOB_REVIEW);
    const other = companyAId === share.fromCompanyId ? share.toCompanyId : share.fromCompanyId;
    if (rows.some(row => row.companyBId === other && (row.status ?? "active") === "active")) return true;
  }
  return false;
}

/** A Pending response may not rewrite any already assigned or executed copy. */
export async function pendingCopyIsUntouched(ctx: Ctx, job: Doc<"jobs">) {
  if (job.status !== "scheduled" || job.cleanerIds.length || job.assignedTeamId || job.assignedManagerId ||
      job.startedAt !== undefined || job.arrivedAt !== undefined || job.acceptedAt !== undefined ||
      job.deniedAt !== undefined || job.completedAt !== undefined || job.approvedAt !== undefined ||
      job.cancelledAt !== undefined || job.timerStoppedAt !== undefined || job.currentPauseStartedAt !== undefined ||
      job.pauseHistory?.length || job.executionHistory?.length || job.inventoryChecklist?.length || job.reworkCount ||
      (job.acceptanceStatus !== undefined && job.acceptanceStatus !== "pending")) return false;
  const sourceKey = `worker_job:${job._id}`;
  const [form, inspection, flag, obligation, terms] = await Promise.all([
    ctx.db.query("forms").withIndex("by_jobId", q => q.eq("jobId", job._id)).first(),
    ctx.db.query("managerInspections").withIndex("by_jobId", q => q.eq("jobId", job._id)).first(),
    ctx.db.query("redFlags").withIndex("by_jobId", q => q.eq("jobId", job._id)).first(),
    ctx.db.query("outgoingObligations").withIndex("by_source", q => q.eq("payerCompanyId", job.companyId).eq("sourceKey", sourceKey)).first(),
    ctx.db.query("outgoingTerms").withIndex("by_source_version", q => q.eq("payerCompanyId", job.companyId).eq("sourceKey", sourceKey)).first(),
  ]);
  return !form && !inspection && !flag && !obligation && !terms;
}

export async function requirePendingCopyResponse(ctx: Ctx, share: Doc<"sharedJobs">) {
  const copy = await ctx.db.get(share.copiedJobId);
  if (!copy || (await recipientSharedJob(ctx, copy))?._id !== share._id ||
      !await pendingCopyIsUntouched(ctx, copy)) throw new Error(SHARED_JOB_REVIEW);
  if (!await hasActivePartnerConnection(ctx, share)) {
    throw new Error("This partner connection is disconnected. This pending request cannot be accepted or executed; contact your company Owner for review.");
  }
  return copy;
}

/** Only called after proving there is no assignment, timer, form or inspection. */
export async function rejectUntouchedCopy(ctx: MutationCtx, share: Doc<"sharedJobs">, actor: Doc<"users">) {
  const now = Date.now();
  await ctx.db.patch(share._id, { status: "rejected", respondedAt: now });
  await ctx.db.patch(share.copiedJobId, { status: "cancelled", cancelledAt: now,
    cancelledBy: actor._id, cancelledByName: actor.name, cancelReason: "other",
    cancelNotes: "Partner shared-work request rejected or invalidated by disconnection." });
}
