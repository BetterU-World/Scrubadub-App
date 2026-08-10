import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireVerifiedStaffSession } from "./sessionAuth";
import { isUserAssignedToJob } from "./teams";

type Ctx = QueryCtx | MutationCtx;
type AssignedJobExecutorRole = "cleaner" | "manager" | "owner" | "maintenance";

function isSupportedExecutorRole(role: string): role is AssignedJobExecutorRole {
  return role === "cleaner" || role === "manager" || role === "owner" || role === "maintenance";
}

export function isRoleCompatibleWithJobExecution(role: string, jobType: string): boolean {
  if (!isSupportedExecutorRole(role)) return false;
  return jobType === "maintenance" ? role === "maintenance" : role !== "maintenance";
}

export async function requireAssignedJobExecutor(
  ctx: Ctx,
  sessionToken: string,
  jobId: Id<"jobs">,
  claimedUserId?: Id<"users">,
): Promise<{ user: Doc<"users">; job: Doc<"jobs"> }> {
  const user = await requireVerifiedStaffSession(ctx, sessionToken, claimedUserId);
  const job = await ctx.db.get(jobId);
  if (!job) throw new Error("Job not found");
  if (!user.companyId || user.companyId !== job.companyId) throw new Error("Access denied");
  if (job.timerStoppedAt !== undefined) throw new Error("Job execution is unavailable");
  if (!isRoleCompatibleWithJobExecution(user.role, job.type)) {
    throw new Error("Job execution is unavailable");
  }
  if (!(await isUserAssignedToJob(ctx, job, user._id))) {
    throw new Error("Not assigned to perform this job");
  }
  return { user, job };
}

export async function assertValidJobExecutionAssignees(
  ctx: Ctx,
  companyId: Id<"companies">,
  jobType: string,
  userIds: Id<"users">[],
): Promise<void> {
  const uniqueIds = new Set(userIds);
  if (uniqueIds.size !== userIds.length) throw new Error("Duplicate job assignee");
  const users = await Promise.all(userIds.map((userId) => ctx.db.get(userId)));
  for (const user of users) {
    if (!user || user.companyId !== companyId || user.status !== "active") {
      throw new Error("Job assignee is unavailable");
    }
    if (!isRoleCompatibleWithJobExecution(user.role, jobType)) {
      throw new Error("Staff member cannot execute this job type");
    }
  }
}
