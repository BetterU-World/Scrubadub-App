import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { effectiveDeclineWorkers } from "./lib/workerDeclineReviews";
import { requireSharedJobAccepted } from "./lib/sharedJobAuthorization";
import { resolveOperationalEmailIdentity } from "./lib/operationalEmailIdentity";

/** Re-read immediately before external delivery; stale queued assignment invitations are suppressed. */
export const assignmentEmailState = internalQuery({
  args: { jobId: v.id("jobs"), workerId: v.id("users"), revision: v.number() },
  returns: v.union(v.null(), v.object({ email: v.string(), propertyName: v.string(), scheduledDate: v.string(),
    startTime: v.optional(v.string()), companyName: v.string(), replyTo: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || (job.assignmentRevision ?? 0) !== args.revision || job.startedAt !== undefined ||
      job.timerStoppedAt !== undefined || !["scheduled", "confirmed"].includes(job.status)) return null;
    try { await requireSharedJobAccepted(ctx, job); } catch { return null; }
    const worker = (await effectiveDeclineWorkers(ctx, job)).find(user => user._id === args.workerId);
    if (!worker?.email) return null;
    const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
    if (property && property.companyId !== job.companyId) return null;
    return { email: worker.email, propertyName: property?.name ?? job.propertySnapshot?.name ?? "a property",
      scheduledDate: job.scheduledDate, startTime: job.startTime, ...await resolveOperationalEmailIdentity(ctx, job.companyId) };
  },
});
