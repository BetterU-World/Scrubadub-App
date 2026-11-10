import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { operationalWorkerAvailable } from "./operationalWorkerEligibility";
import { isRoleCompatibleWithJobExecution } from "./jobExecutionAuth";
import { isUserAssignedToJob } from "./teams";
import { requireOwnerManagerSession } from "./sessionAuth";
import { requireSharedJobAccepted } from "./sharedJobAuthorization";
import { createNotification, logAudit } from "./helpers";

type Ctx = MutationCtx | QueryCtx;
const MAX_ROSTER = 1000;
const MAX_REVIEWERS_PER_ROLE = 1000;

/** Same effective access sources as execution, restricted to eligible active users.
 * Archived teams retain existing member access today; archiving is not revocation.
 */
export async function effectiveDeclineWorkers(ctx: Ctx, job: Doc<"jobs">) {
  const ids = new Set(job.cleanerIds);
  if (job.assignedTeamId) {
    const team = await ctx.db.get(job.assignedTeamId);
    if (team?.companyId === job.companyId) {
      const members = await ctx.db.query("teamMembers")
        .withIndex("by_teamId_active", q => q.eq("teamId", team._id).eq("active", true))
        .take(MAX_ROSTER + 1);
      if (members.length > MAX_ROSTER) throw new Error("Team is too large for worker review; contact the owner");
      for (const member of members) if (member.companyId === job.companyId) ids.add(member.userId);
    }
  }
  if (ids.size > MAX_ROSTER) throw new Error("Assignment is too large for worker review; contact the owner");
  const users = await Promise.all([...ids].map(id => ctx.db.get(id)));
  return users.filter((user): user is Doc<"users"> => !!user && user.companyId === job.companyId &&
    user.status === "active" && isRoleCompatibleWithJobExecution(user.role, job.type));
}

export async function canReviewWorkerDecline(ctx: Ctx, user: Doc<"users">, job: Doc<"jobs">) {
  if (user.status !== "active" || user.companyId !== job.companyId) return false;
  if (user.role === "owner") return true;
  if (user.role !== "manager" || !(user.canAssignCleaners || user.canManageSchedule)) return false;
  return user.canSeeAllJobs === true || job.assignedManagerId === user._id ||
    await isUserAssignedToJob(ctx, job, user._id);
}

export async function requireDeclineReviewer(ctx: Ctx, sessionToken: string, userId: Doc<"users">["_id"], jobId: Doc<"jobs">["_id"]) {
  const user = await requireOwnerManagerSession(ctx, sessionToken, userId);
  const job = await ctx.db.get(jobId);
  if (!job || !await canReviewWorkerDecline(ctx, user, job)) throw new Error("Worker review access denied");
  await requireSharedJobAccepted(ctx, job);
  return { user, job };
}

/** Called only AFTER the original execution and lifecycle guards. Pending identity
 * is (job, worker), across both request kinds and assignment/membership edits.
 */
export async function requestWorkerDeclineReview(ctx: MutationCtx, job: Doc<"jobs">, worker: Doc<"users">,
  kind: "decline" | "cancellation", reason?: string) {
  const pending = await ctx.db.query("workerDeclineReviews")
    .withIndex("by_job_worker_status", q => q.eq("jobId", job._id).eq("workerId", worker._id).eq("status", "pending"))
    .unique();
  if (pending && pending.companyId !== job.companyId) throw new Error("Worker review access denied");
  const workers = await effectiveDeclineWorkers(ctx, job);
  if (!workers.some(user => user._id === worker._id)) throw new Error("Worker is not an eligible current assignee");
  if (!pending && workers.length <= 1) return null; // Preserve legacy single-worker behavior.
  // Never introduce a multi-worker cancellation path for work that has started.
  if (job.startedAt !== undefined || !["scheduled", "confirmed"].includes(job.status)) {
    throw new Error("Cannot request worker review after work has started");
  }
  if (pending) return { reviewRequested: true as const, reviewId: pending._id, replayed: true };
  if (reason && reason.length > 2000) throw new Error("Review reason must be 2000 characters or fewer");
  const reviewId = await ctx.db.insert("workerDeclineReviews", {
    companyId: job.companyId, jobId: job._id, workerId: worker._id, workerName: worker.name,
    kind, reason: reason?.trim() || undefined, requestedAt: Date.now(), status: "pending",
  });
  for (const role of ["owner", "manager"] as const) {
    const candidates = await ctx.db.query("users")
      .withIndex("by_companyId_role", q => q.eq("companyId", job.companyId).eq("role", role))
      .take(MAX_REVIEWERS_PER_ROLE + 1);
    if (candidates.length > MAX_REVIEWERS_PER_ROLE) throw new Error("Too many review recipients; contact support");
    for (const recipient of candidates) {
      if (await canReviewWorkerDecline(ctx, recipient, job) && await operationalWorkerAvailable(ctx, recipient)) {
        await createNotification(ctx, {
          companyId: job.companyId, userId: recipient._id, type: "worker_decline_review",
          title: "Worker availability needs review",
          message: `${worker.name} requested ${kind === "decline" ? "decline" : "cancellation"} review for ${job.scheduledDate}. The job and assignments are unchanged.`,
          relatedJobId: job._id,
        });
      }
    }
  }
  await logAudit(ctx, { companyId: job.companyId, userId: worker._id, action: "request_worker_decline_review",
    entityType: "job", entityId: job._id, details: JSON.stringify({ reviewId, kind }) });
  return { reviewRequested: true as const, reviewId, replayed: false };
}
