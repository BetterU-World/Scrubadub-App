import { calendarConnectionView, calendarConnectionViewValidator } from "../lib/calendarConnectionView";
import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireStaffCompany } from "../lib/sessionAuth";

/**
 * Internal query — read a single connection by ID.
 * Operational view only. Sync obtains credentials through atomic beginSyncAttempt.
 */
export const getConnectionInternal = internalQuery({
  args: { connectionId: v.id("calendarConnections") },
  returns: v.union(calendarConnectionViewValidator, v.null()),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    return connection ? calendarConnectionView(connection) : null;
  },
});

export const listByProperty = query({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    sessionToken: v.string(),
  },
  returns: v.array(calendarConnectionViewValidator),
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property || property.companyId !== args.companyId) throw new Error("Access denied");

    const connections = await ctx.db
      .query("calendarConnections")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();
    return connections.filter((connection) => connection.companyId === args.companyId).map(calendarConnectionView);
  },
});
