import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser, hasManagerPermission } from "../lib/auth";
import { createNotification, logAudit } from "../lib/helpers";

export const submit = mutation({
  args: {
    userId: v.id("users"),
    jobId: v.id("jobs"),
    readinessScore: v.number(),
    severity: v.union(
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

    // Audit log
    await logAudit(ctx, {
      companyId: user.companyId,
      userId: user._id,
      action: "inspection_submitted",
      entityType: "managerInspection",
      entityId: inspectionId,
      details: `Score: ${args.readinessScore}/10, Severity: ${args.severity}`,
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
        message: `${user.name} submitted a house check (score: ${args.readinessScore}/10, severity: ${args.severity})`,
        relatedJobId: args.jobId,
      });
    }

    return inspectionId;
  },
});
