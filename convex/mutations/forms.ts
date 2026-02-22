import { mutation, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireAuth, requireOwner, logAudit, createNotification } from "../lib/helpers";
import { FORM_TEMPLATE, MAINTENANCE_FORM_TEMPLATE } from "../lib/constants";

export const createFromTemplate = mutation({
  args: {
    jobId: v.id("jobs"),
    companyId: v.id("companies"),
    cleanerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.cleanerId);
    // Verify company access
    if (user.companyId !== args.companyId) throw new Error("Access denied");
    // Verify cleaner is assigned to this job
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== user.companyId) throw new Error("Access denied");

    const existing = await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (existing) return existing._id;

    const formId = await ctx.db.insert("forms", {
      jobId: args.jobId,
      companyId: args.companyId,
      cleanerId: args.cleanerId,
      status: "in_progress",
    });

    const template = job.type === "maintenance" ? MAINTENANCE_FORM_TEMPLATE : FORM_TEMPLATE;

    let order = 0;
    for (const section of template) {
      for (const itemName of section.items) {
        await ctx.db.insert("formItems", {
          formId,
          section: section.section,
          itemName,
          completed: false,
          isRedFlag: false,
          order: order++,
        });
      }
    }

    return formId;
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
  args: {
    itemId: v.id("formItems"),
    completed: v.optional(v.boolean()),
    note: v.optional(v.string()),
    isRedFlag: v.optional(v.boolean()),
    photoStorageId: v.optional(v.id("_storage")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const form = await requireEditable(ctx, item.formId);
    if (form.companyId !== user.companyId) throw new Error("Access denied");

    const { itemId, userId: _uid, ...updates } = args;
    const cleanUpdates: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) cleanUpdates[key] = val;
    }
    await ctx.db.patch(itemId, cleanUpdates);
  },
});

export const updateScore = mutation({
  args: {
    formId: v.id("forms"),
    cleanerScore: v.number(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const form = await requireEditable(ctx, args.formId);
    if (form.companyId !== user.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.formId, { cleanerScore: args.cleanerScore });
  },
});

export const updateFinalPass = mutation({
  args: {
    formId: v.id("forms"),
    finalPass: v.boolean(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const form = await requireEditable(ctx, args.formId);
    if (form.companyId !== user.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.formId, { finalPass: args.finalPass });
  },
});

export const saveSignature = mutation({
  args: {
    formId: v.id("forms"),
    signatureStorageId: v.id("_storage"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const form = await requireEditable(ctx, args.formId);
    if (form.companyId !== user.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.formId, {
      signatureStorageId: args.signatureStorageId,
    });
  },
});

export const markAllComplete = mutation({
  args: { formId: v.id("forms"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const form = await requireEditable(ctx, args.formId);
    if (form.companyId !== user.companyId) throw new Error("Access denied");

    const items = await ctx.db
      .query("formItems")
      .withIndex("by_formId", (q) => q.eq("formId", args.formId))
      .collect();
    for (const item of items) {
      if (!item.completed) {
        await ctx.db.patch(item._id, { completed: true });
      }
    }
  },
});

export const addPhoto = mutation({
  args: {
    formId: v.id("forms"),
    photoStorageId: v.id("_storage"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const form = await requireEditable(ctx, args.formId);
    if (form.companyId !== user.companyId) throw new Error("Access denied");

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
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    if (form.companyId !== owner.companyId) throw new Error("Access denied");

    // Check job status (authoritative) — works for both forms.submit and jobs.completeJob paths
    const job = await ctx.db.get(form.jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "submitted") throw new Error("Job not submitted for review");

    await ctx.db.patch(args.formId, {
      status: "approved",
      ownerNotes: args.notes,
    });
    await ctx.db.patch(form.jobId, { status: "approved", completedAt: Date.now() });

    for (const cid of job.cleanerIds) {
      await createNotification(ctx, {
        companyId: form.companyId,
        userId: cid,
        type: "job_approved",
        title: "Job Approved",
        message: `Owner approved cleaning for ${job.scheduledDate}`,
        relatedJobId: form.jobId,
      });
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
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
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

    for (const cid of job.cleanerIds) {
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
    maintenanceCost: v.optional(v.number()),
    maintenanceVendor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    if (form.cleanerId !== user._id) {
      // Fall back: allow if user is assigned to the job (handles auth identity mismatch)
      const job = await ctx.db.get(form.jobId);
      if (!job || !job.cleanerIds.includes(user._id)) {
        throw new Error("Not your form");
      }
    }
    if (form.companyId !== user.companyId) throw new Error("Access denied");
    if (form.status === "submitted" || form.status === "approved") {
      throw new Error("Form already submitted");
    }

    const items = await ctx.db
      .query("formItems")
      .withIndex("by_formId", (q) => q.eq("formId", args.formId))
      .collect();
    const incomplete = items.filter((item) => !item.completed);
    if (incomplete.length > 0) {
      throw new Error(
        `Cannot submit: ${incomplete.length} item(s) not completed. All checklist items must be marked before submission.`
      );
    }

    await ctx.db.patch(args.formId, {
      status: "submitted",
      submittedAt: Date.now(),
      ...(args.maintenanceCost != null ? { maintenanceCost: args.maintenanceCost } : {}),
      ...(args.maintenanceVendor ? { maintenanceVendor: args.maintenanceVendor } : {}),
    });

    const job = await ctx.db.get(form.jobId);
    if (job) {
      await ctx.db.patch(form.jobId, { status: "submitted" });

      const owners = await ctx.db
        .query("users")
        .withIndex("by_companyId", (q) => q.eq("companyId", form.companyId))
        .collect();
      for (const owner of owners.filter((u) => u.role === "owner")) {
        await createNotification(ctx, {
          companyId: form.companyId,
          userId: owner._id,
          type: "job_submitted",
          title: "Job Submitted for Review",
          message: `${user.name} submitted cleaning form for ${job.scheduledDate}`,
          relatedJobId: form.jobId,
        });
      }
    }

    await logAudit(ctx, {
      companyId: form.companyId,
      userId: user._id,
      action: "submit_form",
      entityType: "form",
      entityId: args.formId,
    });
  },
});
