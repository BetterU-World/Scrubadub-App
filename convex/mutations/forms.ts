import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, logAudit, createNotification } from "../lib/helpers";
import { FORM_TEMPLATE } from "../lib/constants";

export const createFromTemplate = mutation({
  args: {
    sessionToken: v.string(),
    jobId: v.id("jobs"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);

    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== user.companyId) throw new Error("Not your company");
    if (!job.cleanerIds.includes(user._id)) throw new Error("Not assigned to this job");

    // Idempotency: return existing form if already created
    const existing = await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    if (existing) return existing._id;

    const formId = await ctx.db.insert("forms", {
      jobId: args.jobId,
      companyId: job.companyId,
      cleanerId: user._id,
      status: "in_progress",
    });

    let order = 0;
    for (const section of FORM_TEMPLATE) {
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

async function requireEditable(ctx: any, formId: any) {
  const form = await ctx.db.get(formId);
  if (!form) throw new Error("Form not found");
  if (form.status === "submitted" || form.status === "approved") {
    throw new Error("Form has been submitted and cannot be modified");
  }
  return form;
}

export const updateItem = mutation({
  args: {
    sessionToken: v.string(),
    itemId: v.id("formItems"),
    completed: v.optional(v.boolean()),
    note: v.optional(v.string()),
    isRedFlag: v.optional(v.boolean()),
    photoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);

    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const form = await requireEditable(ctx, item.formId);
    if (form.companyId !== user.companyId) throw new Error("Not your company");

    const { itemId, sessionToken, ...updates } = args;
    const cleanUpdates: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) cleanUpdates[key] = val;
    }
    await ctx.db.patch(itemId, cleanUpdates);
  },
});

export const updateScore = mutation({
  args: {
    sessionToken: v.string(),
    formId: v.id("forms"),
    cleanerScore: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const form = await requireEditable(ctx, args.formId);
    if (form.companyId !== user.companyId) throw new Error("Not your company");
    await ctx.db.patch(args.formId, { cleanerScore: args.cleanerScore });
  },
});

export const updateFinalPass = mutation({
  args: {
    sessionToken: v.string(),
    formId: v.id("forms"),
    finalPass: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const form = await requireEditable(ctx, args.formId);
    if (form.companyId !== user.companyId) throw new Error("Not your company");
    await ctx.db.patch(args.formId, { finalPass: args.finalPass });
  },
});

export const saveSignature = mutation({
  args: {
    sessionToken: v.string(),
    formId: v.id("forms"),
    signatureStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const form = await requireEditable(ctx, args.formId);
    if (form.companyId !== user.companyId) throw new Error("Not your company");
    await ctx.db.patch(args.formId, {
      signatureStorageId: args.signatureStorageId,
    });
  },
});

export const submit = mutation({
  args: { sessionToken: v.string(), formId: v.id("forms") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    if (form.companyId !== user.companyId) throw new Error("Not your company");
    if (form.cleanerId !== user._id) throw new Error("Not your form");
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
