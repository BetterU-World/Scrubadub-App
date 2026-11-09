import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { assertValidJobExecutionAssignees } from "./jobExecutionAuth";
import { assertTeamInCompany } from "./teams";
import { effectiveDeclineWorkers } from "./workerDeclineReviews";
import { createNotification, logAudit } from "./helpers";
import { resolveOperationalEmailIdentity } from "./operationalEmailIdentity";
import { ensureOperationalEmail } from "./operationalEmailQueue";

export function normalizeWorkerIds(ids: Id<"users">[]) {
  if (ids.length > 1000) throw new Error("Too many job assignees");
  return [...new Set(ids)];
}

async function notifyAdded(ctx: MutationCtx, job: Doc<"jobs">, workers: Doc<"users">[], initial: boolean) {
  const planned = (job.status === "scheduled" || job.status === "confirmed") && job.startedAt === undefined;
  const property = planned && workers.some(worker => worker.email) && job.propertyId ? await ctx.db.get(job.propertyId) : null;
  const identity = planned && workers.some(worker => worker.email) ? await resolveOperationalEmailIdentity(ctx, job.companyId) : null;
  for (const worker of workers) {
    await createNotification(ctx, {
      companyId: job.companyId, userId: worker._id, type: initial ? "job_assigned" : "job_reassigned",
      title: initial ? "New Job Assigned" : "Job Assignment Updated",
      message: "Your company added you to a job assignment. Open the job for current details.", relatedJobId: job._id,
    });
    // Only send invitations for planned work, never suggest restarting historical work.
    if (worker.email && identity) {
      await ensureOperationalEmail(ctx, { kind: "assignment", companyId: job.companyId, jobId: job._id,
        recipientId: worker._id, revision: job.assignmentRevision ?? 0 }, deliveryId =>
        ctx.scheduler.runAfter(0, internal.actions.emailNotifications.sendJobAssigned, {
        deliveryId,
        email: worker.email, propertyName: property?.name ?? job.propertySnapshot?.name ?? "a property",
        scheduledDate: job.scheduledDate, startTime: job.startTime, ...identity,
        assignmentContext: { jobId: job._id, workerId: worker._id, revision: job.assignmentRevision ?? 0 },
      }));
    }
  }
}

export async function notifyInitialJobAssignment(ctx: MutationCtx, job: Doc<"jobs">) {
  await notifyAdded(ctx, job, await effectiveDeclineWorkers(ctx, job), true);
}

type AssignmentEdit = {
  cleanerIds?: Id<"users">[];
  assignedTeamId?: Id<"teams">;
  clearAssignedTeam?: boolean;
  type?: Doc<"jobs">["type"];
};

/** Call only after the entry point's session, capability, company and shared-work guards.
 * Assignment source changes are independent from job-wide acceptance and execution.
 */
export async function applyJobAssignmentChange(ctx: MutationCtx, before: Doc<"jobs">, actor: Doc<"users">,
  edit: AssignmentEdit, action = "update_job_assignment") {
  if (edit.assignedTeamId && edit.clearAssignedTeam) throw new Error("Cannot set and clear the team together");
  const cleanerIds = edit.cleanerIds === undefined ? before.cleanerIds : normalizeWorkerIds(edit.cleanerIds);
  const assignedTeamId = edit.clearAssignedTeam ? undefined : edit.assignedTeamId ?? before.assignedTeamId;
  const sourcesSupplied = edit.cleanerIds !== undefined || edit.assignedTeamId !== undefined || edit.clearAssignedTeam === true;
  if (assignedTeamId && sourcesSupplied) await assertTeamInCompany(ctx, assignedTeamId, before.companyId, { requireActive: edit.assignedTeamId !== undefined });
  if (sourcesSupplied || (edit.type !== undefined && edit.type !== before.type)) {
    await assertValidJobExecutionAssignees(ctx, before.companyId, edit.type ?? before.type, normalizeWorkerIds(cleanerIds));
  }
  const currentIds = new Set(before.cleanerIds);
  const directChanged = edit.cleanerIds !== undefined && (cleanerIds.length !== currentIds.size || cleanerIds.some(id => !currentIds.has(id)));
  if (!directChanged && assignedTeamId === before.assignedTeamId) return false;
  const after = { ...before, cleanerIds, assignedTeamId, type: edit.type ?? before.type,
    assignmentRevision: (before.assignmentRevision ?? 0) + 1 };
  const previousWorkers = await effectiveDeclineWorkers(ctx, before);
  const nextWorkers = await effectiveDeclineWorkers(ctx, after);
  const previousIds = new Set(previousWorkers.map(worker => worker._id));
  const nextIds = new Set(nextWorkers.map(worker => worker._id));
  await ctx.db.patch(before._id, { cleanerIds, assignedTeamId, assignmentRevision: after.assignmentRevision });

  // Acknowledgement is durable and explicit: losing one overlapping path is not removal.
  const pending = await ctx.db.query("workerDeclineReviews")
    .withIndex("by_company_job_status", q => q.eq("companyId", before.companyId).eq("jobId", before._id).eq("status", "pending"))
    .take(1001);
  if (pending.length > 1000) throw new Error("Too many pending worker reviews");
  const resolvedReviewIds: Id<"workerDeclineReviews">[] = [];
  for (const review of pending) if (!nextIds.has(review.workerId)) {
    await ctx.db.patch(review._id, { status: "resolved", resolutionReason: "assignment_removed",
      resolvedAt: Date.now(), resolvedBy: actor._id, resolvedByName: actor.name });
    resolvedReviewIds.push(review._id);
  }
  const added = nextWorkers.filter(worker => !previousIds.has(worker._id));
  const removed = previousWorkers.filter(worker => !nextIds.has(worker._id));
  await notifyAdded(ctx, after, added, false);
  for (const worker of removed) await createNotification(ctx, {
    companyId: before.companyId, userId: worker._id, type: "job_reassigned", title: "Job Assignment Removed",
    // No job link or current property details after access revocation.
    message: `Your assignment to the job scheduled for ${before.scheduledDate} was removed. Contact your company for details.`,
  });
  await logAudit(ctx, { companyId: before.companyId, userId: actor._id, action, entityType: "job", entityId: before._id,
    details: JSON.stringify({ before: { cleanerIds: before.cleanerIds, assignedTeamId: before.assignedTeamId ?? null },
      after: { cleanerIds, assignedTeamId: assignedTeamId ?? null }, assignmentRevision: after.assignmentRevision,
      addedWorkerIds: added.map(worker => worker._id), removedWorkerIds: removed.map(worker => worker._id), resolvedReviewIds }) });
  return true;
}
