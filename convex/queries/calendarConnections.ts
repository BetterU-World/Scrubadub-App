import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireStaffCompany } from "../lib/sessionAuth";

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
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property || property.companyId !== args.companyId) throw new Error("Access denied");

    return await ctx.db
      .query("calendarConnections")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();
  },
});
