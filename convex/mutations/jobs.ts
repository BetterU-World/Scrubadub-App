import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireOwner, requireAuth, logAudit, createNotification } from "../lib/helpers";
import { requireActiveSubscription } from "../lib/subscriptionGating";

export const create = mutation({
  args: {
    userId: v.optional(v.id("users")),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    cleanerIds: v.array(v.id("users")),
    type: v.union(
      v.literal("standard"),
      v.literal("deep_clean"),
      v.literal("turnover"),
      v.literal("move_in_out"),
      v.literal("maintenance")
    ),
    scheduledDate: v.string(),
    startTime: v.optional(v.string()),
    durationMinutes: v.number(),
    notes: v.optional(v.string()),
    requireConfirmation: v.optional(v.boolean()),
    assignedManagerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    if (owner.companyId !== args.companyId) throw new Error("Not your company");
    await requireActiveSubscription(ctx, args.companyId);

    const initialStatus = args.requireConfirmation === false ? "confirmed" : "scheduled";
    const initialAcceptance = args.requireConfirmation === false ? "accepted" as const : "pending" as const;

    const { userId: _uid, ...jobData } = args;
    const jobId = await ctx.db.insert("jobs", {
      ...jobData,
      status: initialStatus,
      acceptanceStatus: initialAcceptance,
      reworkCount: 0,
    });

    const property = await ctx.db.get(args.propertyId);

    // Notify assigned cleaners
    for (const cleanerId of args.cleanerIds) {
      await createNotification(ctx, {
        companyId: args.companyId,
        userId: cleanerId,
        type: "job_assigned",
        title: "New Job Assigned",
        message: `You've been assigned to clean ${property?.name ?? "a property"} on ${args.scheduledDate}`,
        relatedJobId: jobId,
      });

      // Send job assigned email
      const cleaner = await ctx.db.get(cleanerId);
      if (cleaner?.email) {
        await ctx.scheduler.runAfter(0, internal.actions.emailNotifications.sendJobAssigned, {
          email: cleaner.email,
          propertyName: property?.name ?? "a property",
          scheduledDate: args.scheduledDate,
          startTime: args.startTime,
        });
      }
    }

    await logAudit(ctx, {
      companyId: args.companyId,
      userId: owner._id,
      action: "create_job",
      entityType: "job",
      entityId: jobId,
    });

    return jobId;
  },
});

export const update = mutation({
  args: {
    userId: v.optional(v.id("users")),
    jobId: v.id("jobs"),
    propertyId: v.optional(v.id("properties")),
    cleanerIds: v.optional(v.array(v.id("users"))),
    type: v.optional(
      v.union(
        v.literal("standard"),
        v.literal("deep_clean"),
        v.literal("turnover"),
        v.literal("move_in_out"),
      v.literal("maintenance")
      )
    ),
    scheduledDate: v.optional(v.string()),
    startTime: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    notes: v.optional(v.string()),
    assignedManagerId: v.optional(v.id("users")),
    clearAssignedManager: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");

    const { jobId, userId: _uid, clearAssignedManager, ...updates } = args;
    // Remove undefined values
    const cleanUpdates: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) cleanUpdates[key] = val;
    }
    // Explicitly clear assignedManagerId when requested
    if (clearAssignedManager) {
      cleanUpdates.assignedManagerId = undefined;
    }
    await ctx.db.patch(jobId, cleanUpdates);

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "update_job",
      entityType: "job",
      entityId: jobId,
    });
  },
});

export const cancel = mutation({
  args: { jobId: v.id("jobs"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");

    await ctx.db.patch(args.jobId, { status: "cancelled" });

    for (const cleanerId of job.cleanerIds) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: cleanerId,
        type: "job_denied",
        title: "Job Cancelled",
        message: `A job scheduled for ${job.scheduledDate} has been cancelled`,
        relatedJobId: args.jobId,
      });
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "cancel_job",
      entityType: "job",
      entityId: args.jobId,
    });
  },
});

export const confirmJob = mutation({
  args: { jobId: v.id("jobs"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");
    if (job.status !== "scheduled") throw new Error("Job cannot be confirmed in current status");

    await ctx.db.patch(args.jobId, { status: "confirmed" });

    // Notify owners
    const owners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", job.companyId))
      .collect();
    for (const owner of owners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: owner._id,
        type: "job_confirmed",
        title: "Job Confirmed",
        message: `${user.name} confirmed the job for ${job.scheduledDate}`,
        relatedJobId: args.jobId,
      });
    }
  },
});

export const acceptJob = mutation({
  args: { jobId: v.id("jobs"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");
    if (job.status !== "scheduled") throw new Error("Job cannot be accepted in current status");

    await ctx.db.patch(args.jobId, {
      status: "confirmed",
      acceptanceStatus: "accepted",
      acceptedAt: Date.now(),
      deniedAt: undefined,
      denyReason: undefined,
    });

    const owners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", job.companyId))
      .collect();
    for (const owner of owners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: owner._id,
        type: "job_accepted",
        title: "Job Accepted",
        message: `${user.name} accepted the job for ${job.scheduledDate}`,
        relatedJobId: args.jobId,
      });
    }

    await logAudit(ctx, {
      companyId: job.companyId,
      userId: user._id,
      action: "accept_job",
      entityType: "job",
      entityId: args.jobId,
    });
  },
});

export const denyJob = mutation({
  args: { jobId: v.id("jobs"), reason: v.optional(v.string()), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");
    if (job.status !== "scheduled") throw new Error("Job cannot be denied in current status");

    await ctx.db.patch(args.jobId, {
      status: "denied",
      acceptanceStatus: "denied",
      deniedAt: Date.now(),
      denyReason: args.reason,
      acceptedAt: undefined,
    });

    const owners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", job.companyId))
      .collect();
    for (const owner of owners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: owner._id,
        type: "job_denied",
        title: "Job Denied",
        message: `${user.name} denied the job for ${job.scheduledDate}${args.reason ? `: ${args.reason}` : ""}`,
        relatedJobId: args.jobId,
      });
    }

    await logAudit(ctx, {
      companyId: job.companyId,
      userId: user._id,
      action: "deny_job",
      entityType: "job",
      entityId: args.jobId,
      details: args.reason,
    });
  },
});

/**
 * Cleaner cancels a job they previously accepted — allowed until work has started.
 * Resets the job so the owner can reassign.
 */
export const cleanerCancelJob = mutation({
  args: { jobId: v.id("jobs"), reason: v.optional(v.string()), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");

    // Only allow cancellation before work has started
    if (job.status === "in_progress" || job.status === "submitted" || job.status === "approved") {
      throw new Error("Cannot cancel a job that has already started");
    }
    if (job.status === "cancelled" || job.status === "denied") {
      throw new Error("Job is already cancelled or denied");
    }

    await ctx.db.patch(args.jobId, {
      status: "denied",
      acceptanceStatus: "denied",
      deniedAt: Date.now(),
      denyReason: args.reason ?? "Cleaner cancelled after accepting",
      acceptedAt: undefined,
      arrivedAt: undefined,
    });

    const owners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", job.companyId))
      .collect();
    for (const owner of owners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: owner._id,
        type: "job_denied",
        title: "Job Cancelled by Cleaner",
        message: `${user.name} cancelled the job for ${job.scheduledDate}${args.reason ? `: ${args.reason}` : ""}`,
        relatedJobId: args.jobId,
      });
    }

    await logAudit(ctx, {
      companyId: job.companyId,
      userId: user._id,
      action: "deny_job",
      entityType: "job",
      entityId: args.jobId,
      details: args.reason ?? "Cleaner cancelled after accepting",
    });
  },
});

export const reassignJob = mutation({
  args: {
    jobId: v.id("jobs"),
    newCleanerId: v.id("users"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.status === "cancelled") throw new Error("Cancelled jobs cannot be reassigned");

    const newCleaner = await ctx.db.get(args.newCleanerId);
    if (!newCleaner || newCleaner.companyId !== owner.companyId)
      throw new Error("Cleaner not found in your company");

    await ctx.db.patch(args.jobId, {
      cleanerIds: [args.newCleanerId],
      status: "scheduled",
      acceptanceStatus: "pending",
      acceptedAt: undefined,
      deniedAt: undefined,
      denyReason: undefined,
    });

    // Notify the new cleaner
    const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
    const propertyName = property?.name ?? job.propertySnapshot?.name ?? "a property";
    await createNotification(ctx, {
      companyId: job.companyId,
      userId: args.newCleanerId,
      type: "job_reassigned",
      title: "Job Assigned to You",
      message: `You've been assigned to clean ${propertyName} on ${job.scheduledDate}`,
      relatedJobId: args.jobId,
    });

    // Send job assigned email to new cleaner
    if (newCleaner.email) {
      await ctx.scheduler.runAfter(0, internal.actions.emailNotifications.sendJobAssigned, {
        email: newCleaner.email,
        propertyName,
        scheduledDate: job.scheduledDate,
        startTime: job.startTime,
      });
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "reassign_job",
      entityType: "job",
      entityId: args.jobId,
      details: `Reassigned to ${newCleaner.name}`,
    });
  },
});

export const arriveJob = mutation({
  args: { jobId: v.id("jobs"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");
    if (job.status !== "confirmed" && job.status !== "scheduled")
      throw new Error("Cannot mark arrived in current status");

    await ctx.db.patch(args.jobId, { arrivedAt: Date.now() });
  },
});

export const startJob = mutation({
  args: { jobId: v.id("jobs"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");
    if (job.status !== "confirmed" && job.status !== "rework_requested")
      throw new Error("Job cannot be started in current status");

    await ctx.db.patch(args.jobId, {
      status: "in_progress",
      startedAt: Date.now(),
    });

    const owners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", job.companyId))
      .collect();
    for (const owner of owners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: owner._id,
        type: "job_started",
        title: "Job Started",
        message: `${user.name} started the job for ${job.scheduledDate}`,
        relatedJobId: args.jobId,
      });
    }

    // ── Shared-job in_progress sync ──
    if (job.sharedFromJobId) {
      const sharedRecord = await ctx.db
        .query("sharedJobs")
        .withIndex("by_copiedJobId", (q) => q.eq("copiedJobId", args.jobId))
        .first();
      if (sharedRecord && sharedRecord.status === "accepted") {
        await ctx.db.patch(sharedRecord._id, { status: "in_progress" });
      }
    }
  },
});

export const approveJob = mutation({
  args: { jobId: v.id("jobs"), notes: v.optional(v.string()), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.status !== "submitted") throw new Error("Job not submitted for review");

    await ctx.db.patch(args.jobId, { status: "approved", completedAt: Date.now() });

    // Update form status
    const form = await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (form) {
      await ctx.db.patch(form._id, { status: "approved", ownerNotes: args.notes });
    }

    const approveProperty = job.propertyId ? await ctx.db.get(job.propertyId) : null;
    const approvePropertyName = approveProperty?.name ?? job.propertySnapshot?.name ?? "a property";

    for (const cleanerId of job.cleanerIds) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: cleanerId,
        type: "job_approved",
        title: "Job Approved!",
        message: `Your work for ${job.scheduledDate} has been approved${args.notes ? `: ${args.notes}` : ""}`,
        relatedJobId: args.jobId,
      });

      // Send job approved email to cleaner
      const cleaner = await ctx.db.get(cleanerId);
      if (cleaner?.email) {
        await ctx.scheduler.runAfter(0, internal.actions.emailNotifications.sendJobApproved, {
          email: cleaner.email,
          propertyName: approvePropertyName,
        });
      }
    }

    // ── Shared-job completion sync ──
    if (job.sharedFromJobId) {
      const sharedRecord = await ctx.db
        .query("sharedJobs")
        .withIndex("by_copiedJobId", (q) => q.eq("copiedJobId", args.jobId))
        .first();
      if (
        sharedRecord &&
        (sharedRecord.status === "accepted" || sharedRecord.status === "in_progress")
      ) {
        const completionPatch: Record<string, any> = {
          status: "completed" as const,
          completedAt: Date.now(),
        };
        if (sharedRecord.sharePackage && form) {
          const items = await ctx.db
            .query("formItems")
            .withIndex("by_formId", (q) => q.eq("formId", form._id))
            .collect();
          const total = items.length;
          const done = items.filter((i) => i.completed).length;
          completionPatch.checklistSummary = `${done}/${total} items completed`;
          completionPatch.completionNotes = args.notes ?? "";
          if (form.photoStorageIds && form.photoStorageIds.length > 0) {
            completionPatch.photoStorageIds = form.photoStorageIds;
          }
        }
        await ctx.db.patch(sharedRecord._id, completionPatch);
      }
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "approve_job",
      entityType: "job",
      entityId: args.jobId,
    });
  },
});

export const requestRework = mutation({
  args: { jobId: v.id("jobs"), notes: v.string(), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.status !== "submitted") throw new Error("Job not submitted for review");
    if (job.reworkCount >= 2) throw new Error("Maximum rework limit (2) reached");

    await ctx.db.patch(args.jobId, {
      status: "rework_requested",
      reworkCount: job.reworkCount + 1,
    });

    const form = await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (form) {
      await ctx.db.patch(form._id, { status: "rework_requested", ownerNotes: args.notes });
    }

    for (const cleanerId of job.cleanerIds) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: cleanerId,
        type: "rework_requested",
        title: "Rework Requested",
        message: `Your work for ${job.scheduledDate} needs attention: ${args.notes}`,
        relatedJobId: args.jobId,
      });
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "request_rework",
      entityType: "job",
      entityId: args.jobId,
      details: args.notes,
    });
  },
});

export const completeJob = mutation({
  args: {
    jobId: v.id("jobs"),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");
    if (job.status !== "in_progress") throw new Error("Job not in progress");

    await ctx.db.patch(args.jobId, {
      status: "submitted",
      completedAt: Date.now(),
      notes: args.notes ? `${job.notes ? job.notes + "\n" : ""}Completion notes: ${args.notes}` : job.notes,
    });

    // Keep form status in sync to prevent drift
    const form = await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (form && form.status === "in_progress") {
      await ctx.db.patch(form._id, { status: "submitted", submittedAt: Date.now() });
    }

    const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
    const propName = property?.name ?? job.propertySnapshot?.name ?? "a property";
    const owners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", job.companyId))
      .collect();
    const now = Date.now();
    for (const owner of owners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: owner._id,
        type: "job_submitted",
        title: "Job Completed",
        message: `${user.name} completed cleaning ${propName} on ${job.scheduledDate}`,
        relatedJobId: args.jobId,
      });

      // Send job completed email to owner
      if (owner.email) {
        await ctx.scheduler.runAfter(0, internal.actions.emailNotifications.sendJobCompleted, {
          email: owner.email,
          propertyName: propName,
          cleanerName: user.name,
          completedAt: now,
        });
      }
    }

    // Auto-create OPEN cleaner payment if none exists (idempotent)
    const existingPayment = await ctx.db
      .query("cleanerPayments")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (!existingPayment) {
      const cleanerId = job.cleanerIds[0];
      if (cleanerId) {
        const paymentId = await ctx.db.insert("cleanerPayments", {
          companyId: job.companyId,
          jobId: args.jobId,
          cleanerUserId: cleanerId,
          status: "OPEN",
          createdAt: Date.now(),
        });
        await ctx.db.patch(args.jobId, { cleanerPaymentId: paymentId });
      }
    }

    await logAudit(ctx, {
      companyId: job.companyId,
      userId: user._id,
      action: "complete_job",
      entityType: "job",
      entityId: args.jobId,
    });
  },
});

/**
 * Set or update the planned cleaner pay amount on a job (owner-gated).
 * Can be set anytime once a cleaner is assigned.
 */
/**
 * Owner self-execution: start a job the owner is self-assigned to (via assignedManagerId).
 * Lighter-weight alternative to the cleaner startJob flow.
 */
export const ownerStartJob = mutation({
  args: { jobId: v.id("jobs"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.assignedManagerId !== owner._id) throw new Error("You are not self-assigned to this job");
    if (job.status !== "scheduled" && job.status !== "confirmed" && job.status !== "rework_requested")
      throw new Error("Job cannot be started in current status");

    await ctx.db.patch(args.jobId, {
      status: "in_progress",
      startedAt: Date.now(),
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "owner_start_job",
      entityType: "job",
      entityId: args.jobId,
    });
  },
});

/**
 * Owner self-execution: complete a job the owner is self-assigned to.
 * Skips the submit→approve cycle — directly marks as approved.
 */
export const ownerCompleteJob = mutation({
  args: {
    jobId: v.id("jobs"),
    notes: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.assignedManagerId !== owner._id) throw new Error("You are not self-assigned to this job");
    if (job.status !== "in_progress") throw new Error("Job not in progress");

    await ctx.db.patch(args.jobId, {
      status: "approved",
      completedAt: Date.now(),
      notes: args.notes ? `${job.notes ? job.notes + "\n" : ""}Owner completion: ${args.notes}` : job.notes,
    });

    // Keep form status in sync if one exists
    const form = await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (form && (form.status === "in_progress" || form.status === "submitted")) {
      await ctx.db.patch(form._id, { status: "approved", submittedAt: Date.now() });
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "owner_complete_job",
      entityType: "job",
      entityId: args.jobId,
    });
  },
});

/**
 * Owner self-execution: submit a house-check inspection on a self-assigned job.
 * Reuses the same managerInspections table but with owner-level auth.
 */
export const ownerSubmitInspection = mutation({
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
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.assignedManagerId !== owner._id) throw new Error("You are not self-assigned to this job");

    if (args.readinessScore < 1 || args.readinessScore > 10 || !Number.isInteger(args.readinessScore)) {
      throw new Error("Readiness score must be an integer between 1 and 10");
    }

    const now = Date.now();
    const inspectionId = await ctx.db.insert("managerInspections", {
      jobId: args.jobId,
      companyId: owner.companyId,
      managerId: owner._id,
      readinessScore: args.readinessScore,
      severity: args.severity,
      notes: args.notes,
      issues: args.issues,
      createdAt: now,
    });

    if (args.severity !== "none" && job.propertyId) {
      await ctx.db.insert("redFlags", {
        companyId: owner.companyId,
        propertyId: job.propertyId,
        jobId: args.jobId,
        category: "inspection",
        severity: args.severity,
        note: (args.notes && args.notes.trim())
          ? `Owner inspection: ${args.notes.trim()}`
          : `Owner inspection red flag (score ${args.readinessScore}/10)`,
        status: "open",
        inspectionId,
      });
    }

    await ctx.db.patch(args.jobId, { inspectionCycleOpen: false });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "owner_inspection_submitted",
      entityType: "managerInspection",
      entityId: inspectionId,
      details: `Score: ${args.readinessScore}/10, Severity: ${args.severity}`,
    });

    return inspectionId;
  },
});

export const updatePlannedCleanerPay = mutation({
  args: {
    userId: v.id("users"),
    jobId: v.id("jobs"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    if (args.amountCents < 100) {
      throw new Error("Minimum planned pay is $1.00");
    }

    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== owner.companyId) {
      throw new Error("Job not found or does not belong to your company");
    }
    if (job.status === "cancelled" || job.status === "denied") {
      throw new Error("Cannot set planned pay for cancelled or rejected jobs");
    }
    if (job.cleanerIds.length === 0) {
      throw new Error("No cleaner assigned to this job");
    }

    await ctx.db.patch(args.jobId, { plannedCleanerPayCents: args.amountCents });
  },
});
