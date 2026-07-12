import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireVerifiedStaffSession } from "../lib/sessionAuth";

export const markAsRead = mutation({
  args: { notificationId: v.id("notifications"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");
    if (notification.userId !== user._id) throw new Error("Access denied");

    await ctx.db.patch(args.notificationId, { read: true });
  },
});

export const markAllAsRead = mutation({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
    if (user._id !== args.userId) throw new Error("Access denied");

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", (q) =>
        q.eq("userId", args.userId).eq("read", false)
      )
      .collect();
    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }
  },
});

export const markReadUpTo = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), seenThroughTs: v.number() },
  handler: async (ctx, args) => {
    const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
    if (user._id !== args.userId) throw new Error("Access denied");

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", (q) =>
        q.eq("userId", args.userId).eq("read", false)
      )
      .collect();

    for (const n of unread) {
      if (n._creationTime <= args.seenThroughTs) {
        await ctx.db.patch(n._id, { read: true });
      }
    }
  },
});
