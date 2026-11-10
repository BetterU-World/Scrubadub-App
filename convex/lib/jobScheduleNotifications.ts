import { operationalWorkerAvailable } from "./operationalWorkerEligibility";
import { createNotification } from "./helpers";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { effectiveDeclineWorkers } from "./workerDeclineReviews";
import { sharedJobAccess } from "./sharedJobAuthorization";
import { scheduleWindow, sameSchedule } from "./jobScheduleModel";

type Ctx = MutationCtx | QueryCtx;
const actionable = (job: Doc<"jobs">) => ["scheduled", "confirmed", "in_progress", "rework_requested"].includes(job.status);
// V1 is cleaner awareness; executor/manager/owner audiences are not expanded.
async function workers(ctx: Ctx, job: Doc<"jobs">) {
  return (await effectiveDeclineWorkers(ctx, job)).filter(user => user.role === "cleaner");
}

/** Called once inside the successful schedule update transaction, after assignment changes. */
export async function notifyJobScheduleChange(ctx: MutationCtx, before: Doc<"jobs">, after: Doc<"jobs">) {
  if (sameSchedule(before, after)) return;
  const revision = (before.scheduleRevision ?? 0) + 1;
  await ctx.db.patch(after._id, { scheduleRevision: revision });
  if (!actionable(after)) return;
  const previousIds = new Set((await workers(ctx, before)).map(user => user._id));
  const recipients = (await workers(ctx, after)).filter(user => previousIds.has(user._id));
  if (!recipients.length) return;
  const company = await ctx.db.get(after.companyId);
  if (!company) throw new Error("Schedule company unavailable");
  for (const worker of recipients) await createNotification(ctx, {
    companyId: after.companyId, userId: worker._id, type: "job_schedule_changed",
    title: "Job schedule changed", message: "Open your assigned job for the current schedule.", relatedJobId: after._id,
    scheduleChange: { revision, before: scheduleWindow(before), after: scheduleWindow(after), timezone: company.timezone },
  });
}

/** Fail closed before returning any schedule snapshot or property label to the caller. */
export async function visibleScheduleNotification(ctx: Ctx, notification: Doc<"notifications">, user: Doc<"users">) {
  if (notification.type !== "job_schedule_changed") return true;
  if (!await operationalWorkerAvailable(ctx, user) || user.role !== "cleaner" || user.status !== "active" || user.companyId !== notification.companyId ||
      notification.userId !== user._id || !notification.relatedJobId || !notification.scheduleChange) return false;
  const job = await ctx.db.get(notification.relatedJobId);
  if (!job || job.companyId !== user.companyId || job.type === "maintenance" || !actionable(job) ||
      job.scheduleRevision !== notification.scheduleChange.revision || !sameSchedule(job, notification.scheduleChange.after)) return false;
  if (!(await sharedJobAccess(ctx, job)).allowed) return false;
  // Per-user indexed check avoids loading a full roster for every notification read.
  if (job.cleanerIds.includes(user._id)) return true;
  if (!job.assignedTeamId) return false;
  const team = await ctx.db.get(job.assignedTeamId);
  if (!team || team.companyId !== job.companyId) return false;
  const member = await ctx.db.query("teamMembers").withIndex("by_teamId_userId", q => q.eq("teamId", team._id).eq("userId", user._id)).take(2);
  return member.some(row => row.active && row.companyId === job.companyId);
}

export async function scheduleNotificationLabel(ctx: Ctx, notification: Doc<"notifications">) {
  if (notification.type !== "job_schedule_changed" || !notification.relatedJobId) return undefined;
  const job = await ctx.db.get(notification.relatedJobId);
  if (!job || job.companyId !== notification.companyId) return undefined;
  const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
  return property?.companyId === job.companyId ? property.name : job.propertySnapshot?.name;
}
