import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { currentReviewWorkers } from "./lib/jobReviewRecipients";
import { requireSharedJobAccepted } from "./lib/sharedJobAuthorization";
import { resolveOperationalEmailIdentity } from "./lib/operationalEmailIdentity";
import { completionContext, approvalContext } from "./lib/jobReviewEmailContext";

const emailDetails = {
  email: v.string(), propertyName: v.string(), companyName: v.string(), replyTo: v.optional(v.string()),
};

async function currentPropertyName(ctx: QueryCtx, job: Doc<"jobs">) {
  const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
  if (job.propertyId && (!property || property.companyId !== job.companyId)) return null;
  return property?.name ?? job.propertySnapshot?.name ?? "a property";
}

/** A completion remains relevant through approval of the SAME submission, not rework. */
export const completionEmailState = internalQuery({
  args: completionContext.fields,
  returns: v.union(v.null(), v.object({ ...emailDetails, cleanerName: v.string(), completedAt: v.number() })),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== args.companyId || !["submitted", "approved"].includes(job.status) ||
        job.completedAt !== args.completedAt || job.submittedExecutionSequence !== args.executionSequence ||
        (job.status === "approved" && job.approvedExecutionSequence !== args.executionSequence)) return null;
    try { await requireSharedJobAccepted(ctx, job); } catch { return null; }
    const form = await ctx.db.query("forms").withIndex("by_jobId", q => q.eq("jobId", job._id)).first();
    if (!form || form._id !== args.formId || form.companyId !== job.companyId ||
        form.submittedAt !== args.completedAt || form.status !== job.status) return null;
    const evidence = job.executionHistory?.find(event => event.sequence === args.executionSequence);
    if (!evidence || evidence.provenance !== "submission_confirmed") return null;
    const owner = await ctx.db.get(args.recipientId);
    if (!owner || owner.companyId !== job.companyId || owner.status !== "active" || owner.role !== "owner" || !owner.email) return null;
    const propertyName = await currentPropertyName(ctx, job);
    if (propertyName === null) return null;
    const submitter = await ctx.db.get(evidence.confirmedById);
    return { email: owner.email, propertyName, completedAt: args.completedAt,
      cleanerName: submitter?.companyId === job.companyId ? submitter.name : "A worker",
      ...await resolveOperationalEmailIdentity(ctx, job.companyId) };
  },
});

/** Approval is tied to its event and current assignment, never historical performers. */
export const approvalEmailState = internalQuery({
  args: approvalContext.fields,
  returns: v.union(v.null(), v.object(emailDetails)),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== args.companyId || job.status !== "approved" ||
        job.approvedAt !== args.approvedAt || job.reworkCount !== args.reworkCount ||
        job.submittedExecutionSequence !== args.executionSequence ||
        job.approvedExecutionSequence !== args.executionSequence) return null;
    try { await requireSharedJobAccepted(ctx, job); } catch { return null; }
    const form = await ctx.db.query("forms").withIndex("by_jobId", q => q.eq("jobId", job._id)).first();
    if (!form || form._id !== args.formId || form.companyId !== job.companyId || form.status !== "approved") return null;
    const worker = (await currentReviewWorkers(ctx, job)).find(user => user._id === args.recipientId);
    if (!worker?.email) return null;
    const propertyName = await currentPropertyName(ctx, job);
    if (propertyName === null) return null;
    return { email: worker.email, propertyName, ...await resolveOperationalEmailIdentity(ctx, job.companyId) };
  },
});
