import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

export const markAsRead = mutation({
  args: { sessionToken: v.string(), notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");
    if (notification.userId !== user._id) throw new Error("Not your notification");
    await ctx.db.patch(args.notificationId, { read: true });
  },
});

export const markAllAsRead = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", (q) =>
        q.eq("userId", user._id).eq("read", false)
      )
      .collect();
    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }
  },
});
