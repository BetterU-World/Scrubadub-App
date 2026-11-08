import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireAssignedJobExecutor } from "./lib/jobExecutionAuth";
import { effectiveDeclineWorkers, requireDeclineReviewer } from "./lib/workerDeclineReviews";
import { workerDeclineReviewDocument } from "./lib/workerDeclineReviewModel";
import { logAudit } from "./lib/helpers";

const auth = { userId: v.id("users"), sessionToken: v.string() };

export const workerState = query({
  args: { ...auth, jobId: v.id("jobs") },
  returns: v.object({ reviewOnly: v.boolean(), latest: v.union(workerDeclineReviewDocument, v.null()) }),
  handler: async (ctx, args) => {
    const { job, user } = await requireAssignedJobExecutor(ctx, args.sessionToken, args.jobId, args.userId);
    const latest = await ctx.db.query("workerDeclineReviews")
      .withIndex("by_job_worker", q => q.eq("jobId", job._id).eq("workerId", user._id)).order("desc").first();
    if (latest && latest.companyId !== job.companyId) throw new Error("Worker review access denied");
    const workers = await effectiveDeclineWorkers(ctx, job);
    if (!workers.some(worker => worker._id === user._id)) throw new Error("Worker is not an eligible current assignee");
    return { reviewOnly: latest?.status === "pending" || workers.length > 1, latest };
  },
});

export const forJob = query({
  args: { ...auth, jobId: v.id("jobs"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(workerDeclineReviewDocument), isDone: v.boolean(), continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
  }),
  handler: async (ctx, args) => {
    const { job } = await requireDeclineReviewer(ctx, args.sessionToken, args.userId, args.jobId);
    // Pending requests sort before resolved history; pagination keeps both reachable.
    const result = await ctx.db.query("workerDeclineReviews")
      .withIndex("by_company_job_status", q => q.eq("companyId", job.companyId).eq("jobId", job._id)).order("asc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 50) });
    return result;
  },
});

export const resolve = mutation({
  args: { ...auth, reviewId: v.id("workerDeclineReviews") },
  returns: v.object({ resolvedAt: v.number(), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) throw new Error("Worker review not found");
    const { user, job } = await requireDeclineReviewer(ctx, args.sessionToken, args.userId, review.jobId);
    if (review.companyId !== job.companyId) throw new Error("Worker review access denied");
    if (review.status === "resolved") return { resolvedAt: review.resolvedAt!, replayed: true };
    const resolvedAt = Date.now();
    await ctx.db.patch(review._id, { status: "resolved", resolvedAt, resolvedBy: user._id, resolvedByName: user.name });
    await logAudit(ctx, { companyId: job.companyId, userId: user._id, action: "resolve_worker_decline_review",
      entityType: "job", entityId: job._id, details: JSON.stringify({ reviewId: review._id, workerId: review.workerId }) });
    return { resolvedAt, replayed: false };
  },
});
