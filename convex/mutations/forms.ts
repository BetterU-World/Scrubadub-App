import { mutation, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { logAudit, createNotification } from "../lib/helpers";
import { requireOwnerManagerSession } from "../lib/sessionAuth";
import { hasOwnerOrManagerPermission } from "../lib/auth";
import { getJobRecipientUserIds } from "../lib/teams";
import { resolveOperationalEmailIdentity } from "../lib/operationalEmailIdentity";
import { requireAssignedJobExecutor } from "../lib/jobExecutionAuth";
import { ensureJobExecutionForm } from "../lib/jobExecutionForm";
import { submitJobExecution } from "../lib/jobSubmission";
import { consumeAttachmentUpload } from "../lib/attachmentUploads";

export const createFromTemplate = mutation({
  args: {
    jobId: v.id("jobs"),
    companyId: v.id("companies"),
    cleanerId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.cleanerId);
    if (user.companyId !== args.companyId) throw new Error("Access denied");

    return await ensureJobExecutionForm(ctx, job, user._id);
  },
});

async function requireEditable(ctx: MutationCtx, formId: Id<"forms">) {
  const form = await ctx.db.get(formId);
  if (!form) throw new Error("Form not found");
  if (form.status === "submitted" || form.status === "approved") {
    throw new Error("Form has been submitted and cannot be modified");
  }
  return form;
}

export const updateItem = mutation({
  returns: v.null(),
  args: {
    itemId: v.id("formItems"),
    completed: v.optional(v.boolean()),
    note: v.optional(v.string()),
    isRedFlag: v.optional(v.boolean()),
    photoStorageId: v.optional(v.id("_storage")),
    uploadIntentId: v.optional(v.id("attachmentUploadIntents")),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const form = await requireEditable(ctx, item.formId);
    const { user } = await requireAssignedJobExecutor(ctx, args.sessionToken, form.jobId, args.userId);

    if (args.photoStorageId) await consumeAttachmentUpload(ctx, args.sessionToken, { kind: "formItemPhoto", itemId: args.itemId }, args.photoStorageId, args.uploadIntentId);
    else if (args.uploadIntentId) throw new Error("Attachment file required");

    const { itemId, userId: _uid, sessionToken: _sessionToken, uploadIntentId: _intentId, ...updates } = args;
    const cleanUpdates: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) cleanUpdates[key] = val;
    }
    if (args.completed !== undefined) {
      cleanUpdates.completionConfirmation = args.completed
        ? { method: "individual", confirmedById: user._id, confirmedAt: Date.now() }
        : undefined;
    }
    await ctx.db.patch(itemId, cleanUpdates);
  },
});

export const updateScore = mutation({
  args: {
    formId: v.id("forms"),
    cleanerScore: v.number(),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const form = await requireEditable(ctx, args.formId);
    await requireAssignedJobExecutor(ctx, args.sessionToken, form.jobId, args.userId);

    await ctx.db.patch(args.formId, { cleanerScore: args.cleanerScore });
  },
});

export const markAllComplete = mutation({
  args: { formId: v.id("forms"), userId: v.optional(v.id("users")), sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const form = await requireEditable(ctx, args.formId);
    await requireAssignedJobExecutor(ctx, args.sessionToken, form.jobId, args.userId);
    // Compatibility tombstone: old clients call this automatically on mount.
    // Resolve without writes instead of generating unhandled permission errors.
    // Explicit confirmation is available only through confirmSection below.
    return null;
  },
});

export const confirmSection = mutation({
  args: { formId: v.id("forms"), section: v.string(), userId: v.optional(v.id("users")), sessionToken: v.string() },
  returns: v.object({ completedCount: v.number() }),
  handler: async (ctx, args) => {
    const form = await requireEditable(ctx, args.formId);
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, form.jobId, args.userId);
    if (form.companyId !== user.companyId || form.status !== "in_progress" || job.status !== "in_progress" || job.type === "maintenance") {
      throw new Error("Cleaning form is not in progress");
    }
    const profile = await ctx.db.query("workerProfiles").withIndex("by_userId", q => q.eq("userId", user._id)).first();
    if (user.role !== "cleaner" || !profile || profile.companyId !== user.companyId ||
        profile.workerStatus !== "active" || profile.fastModeEligible !== true) {
      throw new Error("Fast Mode eligibility required");
    }
    const items = await ctx.db.query("formItems")
      .withIndex("by_formId_section", q => q.eq("formId", form._id).eq("section", args.section)).take(1001);
    if (items.length > 1000) throw new Error("Checklist section is too large to confirm");
    if (!items.length) throw new Error("Checklist section not found");
    const unfinished = items.filter(item => !item.completed);
    const confirmedAt = Date.now();
    for (const item of unfinished) {
      await ctx.db.patch(item._id, { completed: true, completionConfirmation: {
        method: "section", confirmedById: user._id, confirmedAt,
      } });
    }
    if (unfinished.length) await logAudit(ctx, {
      companyId: job.companyId, userId: user._id, action: "confirm_checklist_section",
      entityType: "form", entityId: form._id,
      details: JSON.stringify({ method: "section", jobId: job._id, formId: form._id,
        section: args.section, confirmedAt, completedCount: unfinished.length }),
    });
    return { completedCount: unfinished.length };
  },
});

export const addPhoto = mutation({
  returns: v.null(),
  args: {
    formId: v.id("forms"),
    photoStorageId: v.id("_storage"),
    uploadIntentId: v.id("attachmentUploadIntents"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const form = await requireEditable(ctx, args.formId);
    await requireAssignedJobExecutor(ctx, args.sessionToken, form.jobId, args.userId);

    await consumeAttachmentUpload(ctx, args.sessionToken, { kind: "formPhoto", formId: args.formId }, args.photoStorageId, args.uploadIntentId);
    const existing = form.photoStorageIds ?? [];
    await ctx.db.patch(args.formId, {
      photoStorageIds: [...existing, args.photoStorageId],
    });
  },
});

export const approve = mutation({
  args: {
    formId: v.id("forms"),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
    if (!hasOwnerOrManagerPermission(owner, "canApproveForms")) throw new Error("Completed work review permission required");
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    if (form.companyId !== owner.companyId) throw new Error("Access denied");

    // Check job status (authoritative) — works for both forms.submit and jobs.completeJob paths
    const job = await ctx.db.get(form.jobId);
    if (!job) throw new Error("Job not found");
    if (job.status === "approved" && form.status === "approved") return;
    if (job.status !== "submitted") throw new Error("Job not submitted for review");
    if (form.status !== "submitted") throw new Error("Required cleaning form is not submitted");

    await ctx.db.patch(args.formId, {
      status: "approved",
      ownerNotes: args.notes,
    });
    await ctx.db.patch(form.jobId, { status: "approved", approvedAt: Date.now(), approvedExecutionSequence: job.submittedExecutionSequence });

    const approveProperty = job.propertyId ? await ctx.db.get(job.propertyId) : null;
    const approvePropertyName = approveProperty?.name ?? job.propertySnapshot?.name ?? "a property";
    const emailIdentity = await resolveOperationalEmailIdentity(ctx, form.companyId);

    for (const cid of await getJobRecipientUserIds(ctx, job)) {
      await createNotification(ctx, {
        companyId: form.companyId,
        userId: cid,
        type: "job_approved",
        title: "Job Approved",
        message: `Completed work was approved for ${job.scheduledDate}`,
        relatedJobId: form.jobId,
      });

      // Send job approved email to cleaner
      const cleaner = await ctx.db.get(cid);
      if (cleaner?.email) {
        await ctx.scheduler.runAfter(0, internal.actions.emailNotifications.sendJobApproved, {
          email: cleaner.email,
          propertyName: approvePropertyName,
          ...emailIdentity,
        });
      }
    }

    // ── Shared-job completion sync ──
    if (job.sharedFromJobId) {
      const sharedRecord = await ctx.db
        .query("sharedJobs")
        .withIndex("by_copiedJobId", (q) => q.eq("copiedJobId", form.jobId))
        .first();
      if (
        sharedRecord &&
        (sharedRecord.status === "accepted" || sharedRecord.status === "in_progress")
      ) {
        const completionPatch: Record<string, any> = {
          status: "completed",
          completedAt: Date.now(),
        };
        if (sharedRecord.sharePackage) {
          const items = await ctx.db
            .query("formItems")
            .withIndex("by_formId", (q) => q.eq("formId", args.formId))
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
      companyId: form.companyId,
      userId: owner._id,
      action: "approve_form",
      entityType: "form",
      entityId: args.formId,
    });
  },
});

export const requestRework = mutation({
  args: {
    formId: v.id("forms"),
    notes: v.string(),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
    if (!hasOwnerOrManagerPermission(owner, "canRequestRework")) throw new Error("Rework permission required");
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    if (form.companyId !== owner.companyId) throw new Error("Access denied");

    // Check job status (authoritative) — works for both forms.submit and jobs.completeJob paths
    const job = await ctx.db.get(form.jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "submitted") throw new Error("Job not submitted for review");

    await ctx.db.patch(args.formId, {
      status: "rework_requested",
      ownerNotes: args.notes,
    });
    await ctx.db.patch(form.jobId, {
      status: "rework_requested",
      reworkCount: (job.reworkCount ?? 0) + 1,
    });

    for (const cid of await getJobRecipientUserIds(ctx, job)) {
      await createNotification(ctx, {
        companyId: form.companyId,
        userId: cid,
        type: "rework_requested",
        title: "Rework Requested",
        message: `Owner requested rework for ${job.scheduledDate}: ${args.notes}`,
        relatedJobId: form.jobId,
      });
    }

    await logAudit(ctx, {
      companyId: form.companyId,
      userId: owner._id,
      action: "request_rework",
      entityType: "form",
      entityId: args.formId,
    });
  },
});

export const submit = mutation({
  args: {
    formId: v.id("forms"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    performedWorkerIds: v.optional(v.array(v.id("users"))),
    maintenanceCost: v.optional(v.number()),
    maintenanceVendor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    const { user, job } = await requireAssignedJobExecutor(ctx, args.sessionToken, form.jobId, args.userId);
    if (form.companyId !== user.companyId) throw new Error("Access denied");
    return await submitJobExecution(ctx, {
      job,
      user,
      formId: args.formId,
      performedWorkerIds: args.performedWorkerIds,
      maintenanceCost: args.maintenanceCost,
      maintenanceVendor: args.maintenanceVendor,
    });
  },
});
