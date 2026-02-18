import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", (q) => q.eq("userId", user._id))
      .collect();
    return notifications.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const unreadCount = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_read", (q) =>
        q.eq("userId", user._id).eq("read", false)
      )
      .collect();
    return unread.length;
  },
});
