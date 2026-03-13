import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, requireOwner, logAudit, createNotification } from "../lib/helpers";
import { hasManagerPermission } from "../lib/auth";

export const create = mutation({
  args: {
    userId: v.optional(v.id("users")),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    jobId: v.id("jobs"),
    formItemId: v.optional(v.id("formItems")),
    category: v.union(
      v.literal("damage"),
      v.literal("safety"),
      v.literal("cleanliness"),
      v.literal("maintenance"),
      v.literal("other")
    ),
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    note: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    // Verify company access
    if (user.companyId !== args.companyId) throw new Error("Access denied");
    // Verify job belongs to this company
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== user.companyId) throw new Error("Access denied");

    const { userId: _uid, ...flagData } = args;
    const flagId = await ctx.db.insert("redFlags", {
      ...flagData,
      status: "open",
    });

    const owners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    for (const owner of owners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: args.companyId,
        userId: owner._id,
        type: "red_flag",
        title: `Red Flag: ${args.category} (${args.severity})`,
        message: args.note.slice(0, 200),
        relatedJobId: args.jobId,
      });
    }

    await logAudit(ctx, {
      companyId: args.companyId,
      userId: user._id,
      action: "create_red_flag",
      entityType: "redFlag",
      entityId: flagId,
    });

    return flagId;
  },
});

export const updateStatus = mutation({
  args: {
    flagId: v.id("redFlags"),
    status: v.union(
      v.literal("acknowledged"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("wont_fix")
    ),
    ownerNote: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new Error("Red flag not found");
    if (flag.companyId !== owner.companyId) throw new Error("Access denied");

    // Cannot transition out of terminal states
    if (flag.status === "resolved" || flag.status === "wont_fix") {
      throw new Error("Cannot update a flag that is already resolved or wont_fix");
    }

    const updates: Record<string, string> = { status: args.status };
    if (args.ownerNote !== undefined) updates.ownerNote = args.ownerNote;
    await ctx.db.patch(args.flagId, updates);

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: `${args.status}_red_flag`,
      entityType: "redFlag",
      entityId: args.flagId,
    });
  },
});

/** Manager with canResolveRedFlags permission: resolve a red flag. */
export const managerResolveRedFlag = mutation({
  args: {
    flagId: v.id("redFlags"),
    note: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.role !== "manager") throw new Error("Manager access required");
    if (!hasManagerPermission(user, "canResolveRedFlags")) throw new Error("Permission denied: canResolveRedFlags required");

    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new Error("Red flag not found");
    if (flag.companyId !== user.companyId) throw new Error("Access denied");
    if (flag.status === "resolved" || flag.status === "wont_fix") {
      throw new Error("Red flag is already in a terminal state");
    }

    const updates: Record<string, string> = { status: "resolved" };
    if (args.note?.trim()) updates.ownerNote = `[Manager: ${user.name}] ${args.note.trim()}`;
    await ctx.db.patch(args.flagId, updates);

    await logAudit(ctx, {
      companyId: user.companyId,
      userId: user._id,
      action: "manager_resolved_red_flag",
      entityType: "redFlag",
      entityId: args.flagId,
    });
  },
});

/** Manager with canResolveRedFlags permission: update red flag lifecycle status. */
export const managerUpdateLifecycle = mutation({
  args: {
    flagId: v.id("redFlags"),
    status: v.union(
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("wont_fix")
    ),
    note: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.role !== "manager") throw new Error("Manager access required");
    if (!hasManagerPermission(user, "canResolveRedFlags")) throw new Error("Permission denied: canResolveRedFlags required");

    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new Error("Red flag not found");
    if (flag.companyId !== user.companyId) throw new Error("Access denied");

    // Cannot transition out of terminal states
    if (flag.status === "resolved" || flag.status === "wont_fix") {
      throw new Error("Cannot update a flag that is already resolved or wont_fix");
    }

    const updates: Record<string, string> = { status: args.status };
    if (args.note?.trim()) {
      updates.ownerNote = `[Manager: ${user.name}] ${args.note.trim()}`;
    }
    await ctx.db.patch(args.flagId, updates);

    await logAudit(ctx, {
      companyId: user.companyId,
      userId: user._id,
      action: `manager_${args.status}_red_flag`,
      entityType: "redFlag",
      entityId: args.flagId,
    });
  },
});

export const createMaintenanceJob = mutation({
  args: {
    flagId: v.id("redFlags"),
    scheduledDate: v.string(),
    cleanerIds: v.array(v.id("users")),
    notes: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new Error("Red flag not found");
    if (flag.companyId !== owner.companyId) throw new Error("Access denied");

    const property = await ctx.db.get(flag.propertyId);

    const jobId = await ctx.db.insert("jobs", {
      companyId: flag.companyId,
      propertyId: flag.propertyId,
      cleanerIds: args.cleanerIds,
      type: "maintenance",
      status: "scheduled",
      scheduledDate: args.scheduledDate,
      durationMinutes: args.durationMinutes ?? 60,
      notes: args.notes ?? `Maintenance from Red Flag: ${flag.note.slice(0, 200)}`,
      reworkCount: 0,
      sourceRedFlagId: args.flagId,
    });

    await ctx.db.patch(args.flagId, { maintenanceJobId: jobId });

    for (const cleanerId of args.cleanerIds) {
      await createNotification(ctx, {
        companyId: flag.companyId,
        userId: cleanerId,
        type: "job_assigned",
        title: "Maintenance Job Assigned",
        message: `Maintenance needed at ${property?.name ?? "a property"}: ${flag.note.slice(0, 100)}`,
        relatedJobId: jobId,
      });
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "create_maintenance_job_from_flag",
      entityType: "job",
      entityId: jobId,
      details: `From red flag: ${args.flagId}`,
    });

    return jobId;
  },
});
