import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { createNotification, logAudit } from "./helpers";
import { resolveOperationalEmailIdentity } from "./operationalEmailIdentity";
import { canSubmitFinalJob } from "./teams";

type SubmissionArgs = {
  job: Doc<"jobs">;
  user: Doc<"users">;
  formId?: Id<"forms">;
  notes?: string;
  maintenanceCost?: number;
  maintenanceVendor?: string;
};

/** The single transaction boundary for final operational submission. */
export async function submitJobExecution(ctx: MutationCtx, args: SubmissionArgs) {
  const { job, user } = args;
  if (!(await canSubmitFinalJob(ctx, job, user))) {
    throw new Error("Only a team lead, assigned manager, or owner can submit this job");
  }

  const form = await ctx.db
    .query("forms")
    .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
    .first();
  if (!form || (args.formId && form._id !== args.formId)) {
    throw new Error("Canonical job form not found");
  }

  // Retried submissions are intentionally safe, including a retry after approval.
  if (
    (job.status === "submitted" || job.status === "approved") &&
    (form.status === "submitted" || form.status === "approved")
  ) {
    const completionLine = args.notes?.trim() ? `Completion notes: ${args.notes.trim()}` : undefined;
    if (completionLine && !job.notes?.includes(completionLine)) {
      await ctx.db.patch(job._id, {
        notes: `${job.notes ? `${job.notes}\n` : ""}${completionLine}`,
      });
    }
    return { submittedAt: job.completedAt, alreadySubmitted: true };
  }
  if (job.status !== "in_progress") throw new Error("Job not in progress");
  if (job.timerStoppedAt !== undefined) {
    throw new Error("This job timer was administratively closed");
  }
  if (form.status !== "in_progress" && form.status !== "submitted") {
    throw new Error("Cleaning form cannot be submitted in its current state");
  }

  const items = await ctx.db
    .query("formItems")
    .withIndex("by_formId", (q) => q.eq("formId", form._id))
    .collect();
  const incomplete = items.filter((item) => !item.completed);
  if (incomplete.length > 0) {
    throw new Error(
      `Cannot submit: ${incomplete.length} item(s) not completed. All checklist items must be marked before submission.`,
    );
  }

  if (job.inventoryChecklist?.length) {
    const unreported = job.inventoryChecklist.filter((item) => item.required && !item.status);
    if (unreported.length > 0) {
      throw new Error(
        `Cannot submit: ${unreported.length} required inventory item(s) not reported. Please check all required items.`,
      );
    }
  }

  const now = Date.now();
  let pauseHistory = job.pauseHistory;
  if (job.currentPauseStartedAt !== undefined) {
    pauseHistory = [...(job.pauseHistory ?? [])];
    const openIndex = pauseHistory.findIndex((pause) => pause.resumedAt === undefined);
    if (openIndex < 0) throw new Error("Pause history is inconsistent");
    const openPause = pauseHistory[openIndex];
    pauseHistory[openIndex] = {
      ...openPause,
      resumedAt: now,
      durationMs: Math.max(0, now - openPause.pausedAt),
      resumedByUserId: user._id,
    };
  }

  await ctx.db.patch(form._id, {
    status: "submitted",
    submittedAt: now,
    ...(args.maintenanceCost != null ? { maintenanceCost: args.maintenanceCost } : {}),
    ...(args.maintenanceVendor?.trim() ? { maintenanceVendor: args.maintenanceVendor.trim() } : {}),
  });
  await ctx.db.patch(job._id, {
    status: "submitted",
    completedAt: now,
    currentPauseStartedAt: undefined,
    pauseHistory,
    notes: args.notes
      ? `${job.notes ? `${job.notes}\n` : ""}Completion notes: ${args.notes}`
      : job.notes,
  });

  const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
  const propertyName = property?.name ?? job.propertySnapshot?.name ?? "a property";
  const owners = await ctx.db
    .query("users")
    .withIndex("by_companyId", (q) => q.eq("companyId", job.companyId))
    .collect();
  const emailIdentity = await resolveOperationalEmailIdentity(ctx, job.companyId);
  for (const owner of owners.filter((candidate) => candidate.role === "owner")) {
    await createNotification(ctx, {
      companyId: job.companyId,
      userId: owner._id,
      type: "job_submitted",
      title: "Job Completed",
      message: `${user.name} completed cleaning ${propertyName} on ${job.scheduledDate}`,
      relatedJobId: job._id,
    });
    if (owner.email) {
      await ctx.scheduler.runAfter(0, internal.actions.emailNotifications.sendJobCompleted, {
        email: owner.email,
        propertyName,
        cleanerName: user.name,
        completedAt: now,
        ...emailIdentity,
      });
    }
  }

  if (!job.assignedTeamId) {
    const existingPayment = await ctx.db
      .query("cleanerPayments")
      .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
      .first();
    if (!existingPayment) {
      const cleanerId = job.cleanerIds[0];
      const cleaner = cleanerId ? await ctx.db.get(cleanerId) : null;
      if (cleanerId && (cleaner?.role === "cleaner" || cleaner?.role === "maintenance")) {
        const cleanerPaymentId = await ctx.db.insert("cleanerPayments", {
          companyId: job.companyId,
          jobId: job._id,
          cleanerUserId: cleanerId,
          status: "OPEN",
          createdAt: now,
        });
        await ctx.db.patch(job._id, { cleanerPaymentId });
      }
    }
  }

  await logAudit(ctx, {
    companyId: job.companyId,
    userId: user._id,
    action: "complete_job",
    entityType: "job",
    entityId: job._id,
  });
  return { submittedAt: now, alreadySubmitted: false };
}
