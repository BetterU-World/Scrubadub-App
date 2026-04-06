import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess } from "../lib/auth";

/**
 * Internal query — read a single connection by ID.
 * Used by the sync action to get connection details without auth checks.
 */
export const getConnectionInternal = internalQuery({
  args: { connectionId: v.id("calendarConnections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.connectionId);
  },
});

export const listByProperty = query({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
  },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

    return await ctx.db
      .query("calendarConnections")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();
  },
});
