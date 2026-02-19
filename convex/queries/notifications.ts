import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await getSessionUser(ctx, args.userId);

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", (q) => q.eq("userId", args.userId))
      .collect();
    return notifications.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const unreadCount = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await getSessionUser(ctx, args.userId);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", (q) =>
        q.eq("userId", args.userId).eq("read", false)
      )
      .collect();
    return unread.length;
  },
});
