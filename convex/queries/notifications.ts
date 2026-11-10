import { operationalWorkerAvailable } from "../lib/operationalWorkerEligibility";
import { query } from "../_generated/server";
import { v } from "convex/values";
import schema from "../schema";
import { requireVerifiedStaffSession } from "../lib/sessionAuth";
import { visibleScheduleNotification, scheduleNotificationLabel } from "../lib/jobScheduleNotifications";
import { isRoleCompatibleWithJobExecution } from "../lib/jobExecutionAuth";
import { isUserAssignedToJob } from "../lib/teams";
import { sharedJobAccess } from "../lib/sharedJobAuthorization";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

async function visibleAssignmentNotification(ctx: QueryCtx, notification: Doc<"notifications">, user: Doc<"users">) {
  // Removal notices deliberately have no job link or current property details.
  if (!["job_assigned", "job_reassigned"].includes(notification.type) || !notification.relatedJobId) return true;
  const job = await ctx.db.get(notification.relatedJobId);
  return await operationalWorkerAvailable(ctx, user) && !!job && job.companyId === user.companyId && isRoleCompatibleWithJobExecution(user.role, job.type) &&
    await isUserAssignedToJob(ctx, job, user._id) && (await sharedJobAccess(ctx, job)).allowed;
}

const notificationResult = v.object({ ...schema.tables.notifications.validator.fields,
  _id: v.id("notifications"), _creationTime: v.number(), scheduleLabel: v.optional(v.string()) });
// Existing notification surface, bounded newest-first. No company-wide scans.
export const list = query({
  args: { userId: v.id("users"), sessionToken: v.string() }, returns: v.array(notificationResult),
  handler: async (ctx, args) => {
    const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
    const notifications = await ctx.db.query("notifications")
      .withIndex("by_userId_created", q => q.eq("userId", user._id)).order("desc").take(500);
    const result = [];
    for (const notification of notifications) {
      if (notification.companyId !== user.companyId || !await visibleAssignmentNotification(ctx, notification, user) || !await visibleScheduleNotification(ctx, notification, user)) continue;
      result.push({ ...notification, scheduleLabel: await scheduleNotificationLabel(ctx, notification) });
    }
    return result;
  },
});

export const unreadCount = query({
  args: { userId: v.id("users"), sessionToken: v.string() }, returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
    const unread = await ctx.db.query("notifications")
      .withIndex("by_userId_read", q => q.eq("userId", user._id).eq("read", false)).order("desc").take(500);
    let count = 0;
    for (const notification of unread) if (notification.companyId === user.companyId && await visibleAssignmentNotification(ctx, notification, user) && await visibleScheduleNotification(ctx, notification, user)) count++;
    return count;
  },
});
