import { v } from "convex/values";

export const workerDeclineReviewFields = {
  companyId: v.id("companies"),
  jobId: v.id("jobs"),
  workerId: v.id("users"),
  workerName: v.string(),
  kind: v.union(v.literal("decline"), v.literal("cancellation")),
  reason: v.optional(v.string()),
  requestedAt: v.number(),
  status: v.union(v.literal("pending"), v.literal("resolved")),
  resolutionReason: v.optional(v.literal("assignment_removed")),
  resolvedAt: v.optional(v.number()),
  resolvedBy: v.optional(v.id("users")),
  resolvedByName: v.optional(v.string()),
};

export const workerDeclineReviewDocument = v.object({
  ...workerDeclineReviewFields,
  _id: v.id("workerDeclineReviews"),
  _creationTime: v.number(),
});

export const workerDeclineResult = v.object({
  reviewRequested: v.literal(true),
  reviewId: v.id("workerDeclineReviews"),
  replayed: v.boolean(),
});
