import { query } from "../_generated/server";
import { v } from "convex/values";
import schema from "../schema";
import { requireVerifiedStaffSession } from "../lib/sessionAuth";
import { visibleScheduleNotification, scheduleNotificationLabel } from "../lib/jobScheduleNotifications";

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
      if (notification.companyId !== user.companyId || !await visibleScheduleNotification(ctx, notification, user)) continue;
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
    for (const notification of unread) if (notification.companyId === user.companyId && await visibleScheduleNotification(ctx, notification, user)) count++;
    return count;
  },
});
