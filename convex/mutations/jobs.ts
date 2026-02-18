import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, requireAuth, logAudit, createNotification } from "../lib/helpers";

export const create = mutation({
  args: {
    sessionToken: v.string(),
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
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.sessionToken);
    const companyId = owner.companyId;

    const property = await ctx.db.get(args.propertyId);
    if (!property || property.companyId !== companyId) {
      throw new Error("Property not found");
    }

    const initialStatus = args.requireConfirmation === false ? "confirmed" : "scheduled";
    const { sessionToken, ...rest } = args;
    const jobId = await ctx.db.insert("jobs", {
      ...rest,
      companyId,
      status: initialStatus,
      reworkCount: 0,
    });

    for (const cleanerId of args.cleanerIds) {
      await createNotification(ctx, {
        companyId,
        userId: cleanerId,
        type: "job_assigned",
        title: "New Job Assigned",
        message: `You've been assigned to clean ${property.name} on ${args.scheduledDate}`,
        relatedJobId: jobId,
      });
    }

    await logAudit(ctx, {
      companyId,
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
    sessionToken: v.string(),
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
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");

    const { jobId, sessionToken, ...updates } = args;
    const cleanUpdates: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) cleanUpdates[key] = val;
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
  args: { sessionToken: v.string(), jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.sessionToken);
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
  args: { sessionToken: v.string(), jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== user.companyId) throw new Error("Not your company");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");
    if (job.status !== "scheduled") throw new Error("Job cannot be confirmed in current status");

    await ctx.db.patch(args.jobId, { status: "confirmed" });

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

export const denyJob = mutation({
  args: { sessionToken: v.string(), jobId: v.id("jobs"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== user.companyId) throw new Error("Not your company");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");
    if (job.status !== "scheduled") throw new Error("Job cannot be denied in current status");

    await ctx.db.patch(args.jobId, { status: "denied" });

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
  },
});

export const startJob = mutation({
  args: { sessionToken: v.string(), jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== user.companyId) throw new Error("Not your company");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");
    if (job.status !== "confirmed" && job.status !== "rework_requested")
      throw new Error("Job cannot be started in current status");

    await ctx.db.patch(args.jobId, { status: "in_progress", startedAt: Date.now() });

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
  },
});

export const approveJob = mutation({
  args: { sessionToken: v.string(), jobId: v.id("jobs"), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your company");
    if (job.status !== "submitted") throw new Error("Job not submitted for review");

    await ctx.db.patch(args.jobId, { status: "approved", completedAt: Date.now() });

    const form = await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (form) {
      await ctx.db.patch(form._id, { status: "approved", ownerNotes: args.notes });
    }

    for (const cleanerId of job.cleanerIds) {
      await createNotification(ctx, {
        companyId: job.companyId,
        userId: cleanerId,
        type: "job_approved",
        title: "Job Approved!",
        message: `Your work for ${job.scheduledDate} has been approved${args.notes ? `: ${args.notes}` : ""}`,
        relatedJobId: args.jobId,
      });
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
  args: { sessionToken: v.string(), jobId: v.id("jobs"), notes: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.sessionToken);
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
