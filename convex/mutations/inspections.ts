import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser, hasManagerPermission } from "../lib/auth";
import { createNotification, logAudit, requireOwner } from "../lib/helpers";

export const submit = mutation({
  args: {
    userId: v.id("users"),
    jobId: v.id("jobs"),
    readinessScore: v.number(),
    severity: v.union(
      v.literal("none"),
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    notes: v.optional(v.string()),
    issues: v.optional(v.array(v.string())),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    if (user.role !== "manager") throw new Error("Manager access required");

    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== user.companyId) throw new Error("Access denied");

    // Enforce manager visibility scope
    if (!hasManagerPermission(user, "canSeeAllJobs")) {
      if (job.assignedManagerId !== user._id) throw new Error("Access denied");
    }

    // Enforce single inspection cycle: reject if cycle is closed
    if (job.inspectionCycleOpen === false) {
      throw new Error("Inspection cycle is closed for this job. Owner must request re-inspection.");
    }

    // Validate readinessScore range
    if (args.readinessScore < 1 || args.readinessScore > 10 || !Number.isInteger(args.readinessScore)) {
      throw new Error("Readiness score must be an integer between 1 and 10");
    }

    const now = Date.now();
    const inspectionId = await ctx.db.insert("managerInspections", {
      jobId: args.jobId,
      companyId: user.companyId,
      managerId: user._id,
      readinessScore: args.readinessScore,
      severity: args.severity,
      notes: args.notes,
      issues: args.issues,
      photoStorageIds: args.photoStorageIds,
      createdAt: now,
    });

    // Materialize a real red flag record when severity is not "none"
    if (args.severity !== "none") {
      await ctx.db.insert("redFlags", {
        companyId: user.companyId,
        propertyId: job.propertyId!,
        jobId: args.jobId,
        category: "inspection",
        severity: args.severity,
        note: (args.notes && args.notes.trim())
          ? `Inspection finding: ${args.notes.trim()}`
          : `Inspection red flag (score ${args.readinessScore}/10)`,
        status: "open",
        inspectionId,
      });
    }

    // Close the inspection cycle so manager can't submit again until owner reopens
    await ctx.db.patch(args.jobId, { inspectionCycleOpen: false });

    // Audit log
    await logAudit(ctx, {
      companyId: user.companyId,
      userId: user._id,
      action: "inspection_submitted",
      entityType: "managerInspection",
      entityId: inspectionId,
      details: `Score: ${args.readinessScore}/10, Red Flags: ${args.severity}`,
    });

    // Notify all owners in the company
    const companyUsers = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", user.companyId))
      .collect();

    const owners = companyUsers.filter(
      (u) => u.role === "owner" && u.status === "active"
    );

    for (const owner of owners) {
      await createNotification(ctx, {
        companyId: user.companyId,
        userId: owner._id,
        type: "inspection_submitted",
        title: "Inspection Submitted",
        message: `${user.name} submitted a house check (score: ${args.readinessScore}/10, red flags: ${args.severity})`,
        relatedJobId: args.jobId,
      });
    }

    return inspectionId;
  },
});

/** Owner-only: reopen the inspection cycle so manager can submit again. */
export const reopenInspection = mutation({
  args: {
    jobId: v.id("jobs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Access denied");

    // Guard: cycle must be closed (false) — block if already open or never closed
    if (job.inspectionCycleOpen === true) {
      throw new Error("Inspection cycle is already open");
    }

    // Guard: at least one inspection must exist
    const inspections = await ctx.db
      .query("managerInspections")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();
    if (inspections.length === 0) {
      throw new Error("No inspections exist for this job");
    }

    await ctx.db.patch(args.jobId, { inspectionCycleOpen: true });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "reopen_inspection_cycle",
      entityType: "job",
      entityId: args.jobId,
    });

    // Notify assigned manager(s)
    if (job.assignedManagerId) {
      await createNotification(ctx, {
        companyId: owner.companyId,
        userId: job.assignedManagerId,
        type: "inspection_submitted",
        title: "Re-Inspection Requested",
        message: `Owner has requested a new inspection for ${job.scheduledDate ?? "a job"}`,
        relatedJobId: args.jobId,
      });
    }
  },
});
