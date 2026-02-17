import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, requireOwner, logAudit, createNotification } from "../lib/helpers";

export const create = mutation({
  args: {
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
    const user = await requireAuth(ctx);
    // Verify company access
    if (user.companyId !== args.companyId) throw new Error("Access denied");
    // Verify job belongs to this company
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== user.companyId) throw new Error("Access denied");

    const flagId = await ctx.db.insert("redFlags", {
      ...args,
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
    status: v.union(v.literal("acknowledged"), v.literal("resolved")),
    ownerNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new Error("Red flag not found");
    if (flag.companyId !== owner.companyId) throw new Error("Access denied");

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

export const createMaintenanceJob = mutation({
  args: {
    flagId: v.id("redFlags"),
    scheduledDate: v.string(),
    cleanerIds: v.array(v.id("users")),
    notes: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
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
