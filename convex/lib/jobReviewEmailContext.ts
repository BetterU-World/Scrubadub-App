import { v } from "convex/values";

export const completionContext = v.object({
  companyId: v.id("companies"), jobId: v.id("jobs"), formId: v.id("forms"),
  recipientId: v.id("users"), completedAt: v.number(), executionSequence: v.number(),
});

export const approvalContext = v.object({
  companyId: v.id("companies"), jobId: v.id("jobs"), formId: v.id("forms"),
  recipientId: v.id("users"), approvedAt: v.number(), reworkCount: v.number(),
  executionSequence: v.optional(v.number()),
});
