import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { logAudit } from "../lib/helpers";
import { requireOwnerSession } from "../lib/sessionAuth";
import { requireActiveSubscription } from "../lib/subscriptionGating";

export const create = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    platform: v.union(
      v.literal("airbnb"),
      v.literal("vrbo"),
      v.literal("other")
    ),
    icalUrl: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    if (owner.companyId !== args.companyId) throw new Error("Not your company");
    await requireActiveSubscription(ctx, args.companyId);

    // Verify property belongs to this company
    const property = await ctx.db.get(args.propertyId);
    if (!property || property.companyId !== args.companyId) {
      throw new Error("Property not found");
    }

    // Compute today in ISO format for first-sync cutoff.
    // Reservations with checkOut <= this date will not generate jobs on first sync.
    const now = new Date();
    const initialSyncCutoff = now.toISOString().slice(0, 10);

    const connectionId = await ctx.db.insert("calendarConnections", {
      companyId: args.companyId,
      propertyId: args.propertyId,
      platform: args.platform,
      icalUrl: args.icalUrl,
      label: args.label,
      enabled: true,
      lastSyncStatus: "pending",
      initialSyncCutoff,
      consecutiveErrors: 0,
      createdAt: Date.now(),
      createdBy: owner._id,
    });

    await logAudit(ctx, {
      companyId: args.companyId,
      userId: owner._id,
      action: "create_calendar_connection",
      entityType: "calendarConnection",
      entityId: connectionId,
    });

    return connectionId;
  },
});

export const update = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    connectionId: v.id("calendarConnections"),
    icalUrl: v.optional(v.string()),
    label: v.optional(v.string()),
    platform: v.optional(
      v.union(
        v.literal("airbnb"),
        v.literal("vrbo"),
        v.literal("other")
      )
    ),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) throw new Error("Connection not found");

    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    if (owner.companyId !== connection.companyId) throw new Error("Not your company");

    const updates: Record<string, unknown> = {};
    if (args.icalUrl !== undefined) updates.icalUrl = args.icalUrl;
    if (args.label !== undefined) updates.label = args.label;
    if (args.platform !== undefined) updates.platform = args.platform;

    await ctx.db.patch(args.connectionId, updates);

    await logAudit(ctx, {
      companyId: connection.companyId,
      userId: owner._id,
      action: "update_calendar_connection",
      entityType: "calendarConnection",
      entityId: args.connectionId,
    });
  },
});

export const setEnabled = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    connectionId: v.id("calendarConnections"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) throw new Error("Connection not found");

    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    if (owner.companyId !== connection.companyId) throw new Error("Not your company");

    await ctx.db.patch(args.connectionId, { enabled: args.enabled });

    await logAudit(ctx, {
      companyId: connection.companyId,
      userId: owner._id,
      action: args.enabled ? "enable_calendar_connection" : "disable_calendar_connection",
      entityType: "calendarConnection",
      entityId: args.connectionId,
    });
  },
});

export const remove = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    connectionId: v.id("calendarConnections"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) throw new Error("Connection not found");

    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    if (owner.companyId !== connection.companyId) throw new Error("Not your company");

    await ctx.db.delete(args.connectionId);

    await logAudit(ctx, {
      companyId: connection.companyId,
      userId: owner._id,
      action: "delete_calendar_connection",
      entityType: "calendarConnection",
      entityId: args.connectionId,
    });
  },
});
