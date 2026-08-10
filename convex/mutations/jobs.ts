import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { logAudit, createNotification } from "../lib/helpers";
import {
  requireOwnerManagerSession,
  requireOwnerSession,
} from "../lib/sessionAuth";
import { requireActiveSubscription } from "../lib/subscriptionGating";
import {
  assertTeamInCompany,
  getJobRecipientUserIds,
} from "../lib/teams";
import { resolveOperationalEmailIdentity } from "../lib/operationalEmailIdentity";
import { MAX_JOB_PAUSE_CYCLES, normalizePauseNote } from "../lib/jobTiming";
import { copyAcceptedProposalAddOnSnapshots } from "../lib/acceptedProposalAddOnSnapshots";
import { createJobFromClientRequest } from "../lib/clientRequestScheduling";
import {
  assertValidJobExecutionAssignees,
  requireAssignedJobExecutor,
} from "../lib/jobExecutionAuth";
import { ensureJobExecutionForm } from "../lib/jobExecutionForm";
import { submitJobExecution } from "../lib/jobSubmission";
import { resolvePropertyConditionRequirement } from "../lib/propertyConditionRequirements";
import { hasOwnerOrManagerPermission } from "../lib/auth";

const requestJobTypeValidator = v.union(
  v.literal("standard"),
  v.literal("deep_clean"),
  v.literal("turnover"),
  v.literal("move_in_out"),
  v.literal("maintenance"),
  v.literal("post_construction"),
);

export const confirmClientRequestSchedule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    requestId: v.id("clientRequests"),
    scheduledDate: v.string(),
    startTime: v.string(),
    durationMinutes: v.number(),
    type: requestJobTypeValidator,
    clientSchedulingNote: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireOwnerManagerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    if (actor.role === "manager" && actor.canManageSchedule !== true)
      throw new Error("Schedule management permission required");
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== actor.companyId) throw new Error("Access denied");
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(args.idempotencyKey))
      throw new Error("Invalid scheduling key");
    const result = await createJobFromClientRequest(ctx, request, args, {
      userId: actor._id,
      action: "schedule_client_request",
      details: { idempotencyKey: args.idempotencyKey },
    });
    const pending = await ctx.db
      .query("clientRequestScheduleProposals")
      .withIndex("by_clientRequestId_status", (q) =>
        q.eq("clientRequestId", request._id).eq("status", "pending"),
      )
      .collect();
    const now = Date.now();
    for (const proposal of pending)
      await ctx.db.patch(proposal._id, {
        status: "withdrawn",
        withdrawnAt: now,
        respondedAt: now,
      });
    return {
      jobId: result.job!._id,
      scheduledDate: result.job!.scheduledDate,
      startTime: result.job!.startTime,
      durationMinutes: result.job!.durationMinutes,
      replayed: result.replayed,
    };
  },
});

const pauseReasonValidator = v.union(
  v.literal("break"),
  v.literal("waiting_for_access"),
  v.literal("supplies"),
  v.literal("client_interruption"),
  v.literal("travel_between_service_areas"),
  v.literal("equipment_issue"),
  v.literal("other"),
);

const cancelReasonValidator = v.union(
  v.literal("client_cancelled"),
  v.literal("weather"),
  v.literal("property_unavailable"),
  v.literal("staff_unavailable"),
  v.literal("duplicate_booking"),
  v.literal("scheduling_conflict"),
  v.literal("pricing_disagreement"),
  v.literal("safety_concern"),
  v.literal("other"),
);

function findOpenPauseIndex(history: Array<{ resumedAt?: number }>) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].resumedAt === undefined) return index;
  }
  return -1;
}

export const create = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    cleanerIds: v.array(v.id("users")),
    assignedTeamId: v.optional(v.id("teams")),
    type: v.union(
      v.literal("standard"),
      v.literal("deep_clean"),
      v.literal("turnover"),
      v.literal("move_in_out"),
      v.literal("maintenance"),
      v.literal("post_construction"),
    ),
    scheduledDate: v.string(),
    startTime: v.optional(v.string()),
    durationMinutes: v.number(),
    notes: v.optional(v.string()),
    requireConfirmation: v.optional(v.boolean()),
    assignedManagerId: v.optional(v.id("users")),
    proposalId: v.optional(v.id("proposals")),
    clientRequestId: v.optional(v.id("clientRequests")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerManagerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    if (!hasOwnerOrManagerPermission(owner, "canCreateJobs")) throw new Error("Job creation permission required");
    if (owner.role === "manager" && (args.cleanerIds.length > 0 || args.assignedTeamId || args.assignedManagerId) && !owner.canAssignCleaners) {
      throw new Error("Worker assignment permission required");
    }
    if (owner.companyId !== args.companyId) throw new Error("Not your company");
    await requireActiveSubscription(ctx, args.companyId);
    if (args.assignedTeamId) {
      await assertTeamInCompany(ctx, args.assignedTeamId, args.companyId, {
        requireActive: true,
      });
      if (args.cleanerIds.length > 0)
        throw new Error("Choose either individual cleaners or a team");
    }
    await assertValidJobExecutionAssignees(ctx, args.companyId, args.type, args.cleanerIds);

    const initialStatus =
      args.requireConfirmation === false ? "confirmed" : "scheduled";
    const initialAcceptance =
      args.requireConfirmation === false
        ? ("accepted" as const)
        : ("pending" as const);

    const property = await ctx.db.get(args.propertyId);
    if (!property || property.companyId !== args.companyId) {
      throw new Error("Property not found");
    }
    const emailIdentity = await resolveOperationalEmailIdentity(
      ctx,
      args.companyId,
    );
    const requiresPropertyConditionCheck = await resolvePropertyConditionRequirement(ctx, {
      companyId: args.companyId,
      propertyId: args.propertyId,
    });

    let sourceProposalId: typeof args.proposalId | undefined;
    let acceptedProposalAddOnSnapshots: any[] | undefined;
    if (args.proposalId) {
      const copied = await copyAcceptedProposalAddOnSnapshots(
        ctx,
        args.proposalId,
        args.companyId,
      );
      if (
        !args.clientRequestId ||
        copied.proposal.clientRequestId !== args.clientRequestId
      ) {
        throw new Error("Accepted proposal must match the source request");
      }
      const request = await ctx.db.get(args.clientRequestId);
      if (!request || request.companyId !== args.companyId)
        throw new Error("Source request not found");
      if (request.propertyId && request.propertyId !== args.propertyId) {
        throw new Error(
          "Job property must match the accepted proposal request",
        );
      }
      if (
        copied.proposal.clientRelationshipId &&
        copied.proposal.clientRelationshipId !== property.clientRelationshipId
      ) {
        throw new Error("Job client must match the accepted proposal");
      }
      sourceProposalId = copied.proposal._id;
      acceptedProposalAddOnSnapshots = copied.snapshots;
    }

    const {
      userId: _uid,
      sessionToken: _sessionToken,
      proposalId: _proposalId,
      clientRequestId: _requestId,
      ...jobData
    } = args;
    const jobId = await ctx.db.insert("jobs", {
      ...jobData,
      sourceProposalId,
      acceptedProposalAddOnSnapshots,
      clientRelationshipId: property.clientRelationshipId,
      requiresPropertyConditionCheck,
      status: initialStatus,
      acceptanceStatus: initialAcceptance,
      reworkCount: 0,
    });

    const recipientIds = args.assignedTeamId
      ? await getJobRecipientUserIds(ctx, {
          companyId: args.companyId,
          cleanerIds: args.cleanerIds,
          assignedTeamId: args.assignedTeamId,
        })
      : args.cleanerIds;

    // Notify assigned cleaners/team members
    for (const cleanerId of recipientIds) {
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
        await ctx.scheduler.runAfter(
          0,
          internal.actions.emailNotifications.sendJobAssigned,
          {
            email: cleaner.email,
            propertyName: property?.name ?? "a property",
            scheduledDate: args.scheduledDate,
            startTime: args.startTime,
            ...emailIdentity,
          },
        );
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
    sessionToken: v.string(),
    jobId: v.id("jobs"),
    propertyId: v.optional(v.id("properties")),
    cleanerIds: v.optional(v.array(v.id("users"))),
    assignedTeamId: v.optional(v.id("teams")),
    clearAssignedTeam: v.optional(v.boolean()),
    type: v.optional(
      v.union(
        v.literal("standard"),
        v.literal("deep_clean"),
        v.literal("turnover"),
        v.literal("move_in_out"),
        v.literal("maintenance"),
        v.literal("post_construction"),
      ),
    ),
    scheduledDate: v.optional(v.string()),
    startTime: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    notes: v.optional(v.string()),
    assignedManagerId: v.optional(v.id("users")),
    clearAssignedManager: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerManagerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    if (!hasOwnerOrManagerPermission(owner, "canCreateJobs")) throw new Error("Job editing permission required");
    if (owner.role === "manager" && (args.cleanerIds !== undefined || args.assignedTeamId || args.clearAssignedTeam || args.assignedManagerId || args.clearAssignedManager) && !owner.canAssignCleaners) {
      throw new Error("Worker assignment permission required");
    }
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");

    if (args.assignedTeamId) {
      await assertTeamInCompany(ctx, args.assignedTeamId, owner.companyId, {
        requireActive: true,
      });
      if (args.cleanerIds && args.cleanerIds.length > 0)
        throw new Error("Choose either individual cleaners or a team");
    }
    if (args.cleanerIds) {
      await assertValidJobExecutionAssignees(
        ctx,
        owner.companyId,
        args.type ?? job.type,
        args.cleanerIds,
      );
    }

    const {
      jobId,
      userId: _uid,
      sessionToken: _sessionToken,
      clearAssignedManager,
      clearAssignedTeam,
      ...updates
    } = args;
    // Remove undefined values
    const cleanUpdates: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) cleanUpdates[key] = val;
    }
    // Explicitly clear assignedManagerId when requested
    if (clearAssignedManager) {
      cleanUpdates.assignedManagerId = undefined;
    }
    if (
      clearAssignedTeam ||
      (updates.cleanerIds && updates.cleanerIds.length > 0)
    ) {
      cleanUpdates.assignedTeamId = undefined;
    }
    if (updates.propertyId) {
      const property = await ctx.db.get(updates.propertyId);
      if (!property || property.companyId !== owner.companyId) {
        throw new Error("Property not found");
      }
      cleanUpdates.clientRelationshipId = property.clientRelationshipId;
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
  args: {
    jobId: v.id("jobs"),
    reason: cancelReasonValidator,
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireOwnerManagerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    if (!hasOwnerOrManagerPermission(actor, "canCreateJobs")) throw new Error("Job cancellation permission required");
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== actor.companyId) throw new Error("Access denied");
    if (job.status === "cancelled") throw new Error("Job is already cancelled");
    if (job.status === "approved" || job.status === "submitted") {
      throw new Error("Completed jobs cannot be cancelled");
    }
    const notes = args.notes?.trim();
    if (args.reason === "other" && !notes)
      throw new Error("Notes are required when reason is Other");
    const cancelledAt = Date.now();
    let pauseHistory = job.pauseHistory;
    if (job.currentPauseStartedAt !== undefined) {
      pauseHistory = [...(job.pauseHistory ?? [])];
      const openPauseIndex = findOpenPauseIndex(pauseHistory);
      if (openPauseIndex < 0) throw new Error("Pause history is inconsistent");
      const openPause = pauseHistory[openPauseIndex];
      pauseHistory[openPauseIndex] = {
        ...openPause,
        resumedAt: cancelledAt,
        durationMs: Math.max(0, cancelledAt - openPause.pausedAt),
      };
    }

    await ctx.db.patch(args.jobId, {
      status: "cancelled",
      cancelledAt,
      cancelledBy: actor._id,
      cancelledByName: actor.name,
      cancelReason: args.reason,
      cancelNotes: notes,
      currentPauseStartedAt: undefined,
      pauseHistory,
    });

    const recipientIds = new Set(await getJobRecipientUserIds(ctx, job));
    if (actor.role === "manager") {
      const companyUsers = await ctx.db
        .query("users")
        .withIndex("by_companyId", (q) => q.eq("companyId", job.companyId))
        .collect();
      for (const owner of companyUsers.filter((user) => user.role === "owner"))
        recipientIds.add(owner._id);
    }
    recipientIds.delete(actor._id);
    for (const recipientId of recipientIds) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: recipientId,
        type: "job_cancelled",
        title: "Job Cancelled",
        message: `A job scheduled for ${job.scheduledDate} has been cancelled by ${actor.name}`,
        relatedJobId: args.jobId,
      });
    }

    await logAudit(ctx, {
      companyId: actor.companyId,
      userId: actor._id,
      action: "cancel_job",
      entityType: "job",
      entityId: args.jobId,
      details: JSON.stringify({ reason: args.reason, notes, cancelledAt }),
    });
  },
});

export const acceptJob = mutation({
  args: {
    jobId: v.id("jobs"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.userId);
    if (job.status !== "scheduled")
      throw new Error("Job cannot be accepted in current status");

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
  args: {
    jobId: v.id("jobs"),
    reason: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.userId);
    if (job.status !== "scheduled")
      throw new Error("Job cannot be denied in current status");

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
  args: {
    jobId: v.id("jobs"),
    reason: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.userId);

    // Only allow cancellation before work has started
    if (
      job.status === "in_progress" ||
      job.status === "submitted" ||
      job.status === "approved"
    ) {
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
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.status === "cancelled")
      throw new Error("Cancelled jobs cannot be reassigned");

    const newCleaner = await ctx.db.get(args.newCleanerId);
    if (!newCleaner || newCleaner.companyId !== owner.companyId)
      throw new Error("Cleaner not found in your company");
    await assertValidJobExecutionAssignees(ctx, owner.companyId, job.type, [args.newCleanerId]);

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
    const propertyName =
      property?.name ?? job.propertySnapshot?.name ?? "a property";
    const emailIdentity = await resolveOperationalEmailIdentity(
      ctx,
      job.companyId,
    );
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
      await ctx.scheduler.runAfter(
        0,
        internal.actions.emailNotifications.sendJobAssigned,
        {
          email: newCleaner.email,
          propertyName,
          scheduledDate: job.scheduledDate,
          startTime: job.startTime,
          ...emailIdentity,
        },
      );
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
  args: {
    jobId: v.id("jobs"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.userId);
    if (job.status !== "confirmed" && job.status !== "scheduled")
      throw new Error("Cannot mark arrived in current status");

    await ctx.db.patch(args.jobId, { arrivedAt: Date.now() });
  },
});

export const startJob = mutation({
  args: {
    jobId: v.id("jobs"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.userId);
    if (job.status !== "confirmed" && job.status !== "rework_requested")
      throw new Error("Job cannot be started in current status");

    // Form initialization is part of the same transaction as starting the job,
    // so every executor receives one canonical checklist without a partial state.
    await ensureJobExecutionForm(ctx, job, user._id);

    // Snapshot property inventory onto job as checklist
    const updates: Record<string, unknown> = {
      status: "in_progress",
      startedAt: Date.now(),
    };
    if (job.propertyId) {
      const property = await ctx.db.get(job.propertyId);
      if (property?.inventoryItems && property.inventoryItems.length > 0) {
        updates.inventoryChecklist = property.inventoryItems.map((item) => ({
          name: item.name,
          category: item.category,
          parLevel: item.parLevel,
          required: item.required,
        }));
      }
    }
    await ctx.db.patch(args.jobId, updates);

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

export const pauseJob = mutation({
  args: {
    jobId: v.id("jobs"),
    reason: pauseReasonValidator,
    note: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.userId);
    if (job.status !== "in_progress")
      throw new Error("Only an in-progress job can be paused");
    if (job.timerStoppedAt !== undefined)
      throw new Error("This job timer was administratively closed");
    if (job.currentPauseStartedAt !== undefined)
      throw new Error("Job is already paused");
    const history = job.pauseHistory ?? [];
    if (history.length >= MAX_JOB_PAUSE_CYCLES)
      throw new Error("This job has reached the pause limit");
    const now = Date.now();
    const note = normalizePauseNote(args.reason, args.note);
    await ctx.db.patch(args.jobId, {
      currentPauseStartedAt: now,
      pauseHistory: [
        ...history,
        { pausedAt: now, reason: args.reason, note, pausedByUserId: user._id },
      ],
    });
    await logAudit(ctx, {
      companyId: job.companyId,
      userId: user._id,
      action: "pause_job",
      entityType: "job",
      entityId: args.jobId,
      details: args.reason,
    });
  },
});

export const resumeJob = mutation({
  args: {
    jobId: v.id("jobs"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.userId);
    if (job.status !== "in_progress")
      throw new Error("Only an in-progress job can be resumed");
    if (job.timerStoppedAt !== undefined)
      throw new Error("This job timer was administratively closed");
    if (job.currentPauseStartedAt === undefined)
      throw new Error("Job is not paused");
    const history = [...(job.pauseHistory ?? [])];
    const openIndex = findOpenPauseIndex(history);
    if (openIndex < 0) throw new Error("Pause history is inconsistent");
    const now = Date.now();
    history[openIndex] = {
      ...history[openIndex],
      resumedAt: now,
      durationMs: Math.max(0, now - history[openIndex].pausedAt),
      resumedByUserId: user._id,
    };
    await ctx.db.patch(args.jobId, {
      currentPauseStartedAt: undefined,
      pauseHistory: history,
    });
    await logAudit(ctx, {
      companyId: job.companyId,
      userId: user._id,
      action: "resume_job",
      entityType: "job",
      entityId: args.jobId,
    });
  },
});

export const completeJob = mutation({
  args: {
    jobId: v.id("jobs"),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.userId);
    return await submitJobExecution(ctx, {
      job,
      user,
      notes: args.notes,
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
  args: {
    jobId: v.id("jobs"),
    userId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.assignedManagerId !== owner._id)
      throw new Error("You are not self-assigned to this job");
    if (
      job.status !== "scheduled" &&
      job.status !== "confirmed" &&
      job.status !== "rework_requested"
    )
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

export const ownerPauseJob = mutation({
  args: {
    jobId: v.id("jobs"),
    reason: pauseReasonValidator,
    note: v.optional(v.string()),
    userId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== owner.companyId)
      throw new Error("Job not found");
    if (job.assignedManagerId !== owner._id)
      throw new Error("You are not self-assigned to this job");
    if (job.status !== "in_progress")
      throw new Error("Only an in-progress job can be paused");
    if (job.timerStoppedAt !== undefined)
      throw new Error("This job timer was administratively closed");
    if (job.currentPauseStartedAt !== undefined)
      throw new Error("Job is already paused");
    const history = job.pauseHistory ?? [];
    if (history.length >= MAX_JOB_PAUSE_CYCLES)
      throw new Error("This job has reached the pause limit");
    const now = Date.now();
    const note = normalizePauseNote(args.reason, args.note);
    await ctx.db.patch(args.jobId, {
      currentPauseStartedAt: now,
      pauseHistory: [
        ...history,
        { pausedAt: now, reason: args.reason, note, pausedByUserId: owner._id },
      ],
    });
    await logAudit(ctx, {
      companyId: job.companyId,
      userId: owner._id,
      action: "pause_job",
      entityType: "job",
      entityId: args.jobId,
      details: args.reason,
    });
  },
});

export const ownerResumeJob = mutation({
  args: {
    jobId: v.id("jobs"),
    userId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== owner.companyId)
      throw new Error("Job not found");
    if (job.assignedManagerId !== owner._id)
      throw new Error("You are not self-assigned to this job");
    if (job.status !== "in_progress")
      throw new Error("Only an in-progress job can be resumed");
    if (job.timerStoppedAt !== undefined)
      throw new Error("This job timer was administratively closed");
    if (job.currentPauseStartedAt === undefined)
      throw new Error("Job is not paused");
    const history = [...(job.pauseHistory ?? [])];
    const openIndex = findOpenPauseIndex(history);
    if (openIndex < 0) throw new Error("Pause history is inconsistent");
    const now = Date.now();
    history[openIndex] = {
      ...history[openIndex],
      resumedAt: now,
      durationMs: Math.max(0, now - history[openIndex].pausedAt),
      resumedByUserId: owner._id,
    };
    await ctx.db.patch(args.jobId, {
      currentPauseStartedAt: undefined,
      pauseHistory: history,
    });
    await logAudit(ctx, {
      companyId: job.companyId,
      userId: owner._id,
      action: "resume_job",
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
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.assignedManagerId !== owner._id)
      throw new Error("You are not self-assigned to this job");
    if (job.status !== "in_progress") throw new Error("Job not in progress");
    if (job.timerStoppedAt !== undefined)
      throw new Error("This job timer was administratively closed");
    if (job.currentPauseStartedAt !== undefined)
      throw new Error("Resume the job before completing it");

    await ctx.db.patch(args.jobId, {
      status: "approved",
      completedAt: Date.now(),
      approvedAt: Date.now(),
      notes: args.notes
        ? `${job.notes ? job.notes + "\n" : ""}Owner completion: ${args.notes}`
        : job.notes,
    });

    // Keep form status in sync if one exists
    const form = await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (
      form &&
      (form.status === "in_progress" || form.status === "submitted")
    ) {
      await ctx.db.patch(form._id, {
        status: "approved",
        submittedAt: Date.now(),
      });
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
    sessionToken: v.string(),
    jobId: v.id("jobs"),
    readinessScore: v.number(),
    severity: v.union(
      v.literal("none"),
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical"),
    ),
    notes: v.optional(v.string()),
    issues: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.assignedManagerId !== owner._id)
      throw new Error("You are not self-assigned to this job");

    if (
      args.readinessScore < 1 ||
      args.readinessScore > 10 ||
      !Number.isInteger(args.readinessScore)
    ) {
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
        note:
          args.notes && args.notes.trim()
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
    sessionToken: v.string(),
    jobId: v.id("jobs"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );

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
    const payableWorker = await ctx.db.get(job.cleanerIds[0]);
    if (
      payableWorker?.role !== "cleaner" &&
      payableWorker?.role !== "maintenance"
    ) {
      throw new Error("The assigned job executor is not eligible for cleaner pay");
    }

    await ctx.db.patch(args.jobId, {
      plannedCleanerPayCents: args.amountCents,
    });
  },
});

// ── Inventory checklist (Sprint 2, Batch 4) ─────────────────────────

/** Cleaner updates a single inventory checklist item by name. */
export const updateInventoryChecklistItem = mutation({
  args: {
    jobId: v.id("jobs"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    itemName: v.string(),
    status: v.union(
      v.literal("ok"),
      v.literal("low"),
      v.literal("out"),
      v.literal("restocked"),
    ),
    reportedQty: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.userId);
    if (job.status !== "in_progress" && job.status !== "rework_requested")
      throw new Error("Job is not in progress");
    if (!job.inventoryChecklist)
      throw new Error("No inventory checklist on this job");

    const checklist = job.inventoryChecklist.map((item) => {
      if (item.name === args.itemName) {
        return {
          ...item,
          status: args.status,
          ...(args.reportedQty !== undefined
            ? { reportedQty: args.reportedQty }
            : {}),
          ...(args.note !== undefined ? { note: args.note } : {}),
        };
      }
      return item;
    });

    await ctx.db.patch(args.jobId, { inventoryChecklist: checklist });
  },
});
