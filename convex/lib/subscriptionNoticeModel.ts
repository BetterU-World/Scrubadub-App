import { v } from "convex/values";
export const billingSnapshot = v.object({
  subscriptionId: v.string(), customerId: v.string(), status: v.string(), renewing: v.boolean(),
  createdAt: v.number(), plan: v.string(), amount: v.number(), currency: v.string(),
  interval: v.union(v.literal("month"), v.literal("year")), intervalCount: v.number(), anchor: v.number(),
  trialEnd: v.optional(v.number()), awardedUntil: v.optional(v.number()),
  discounts: v.array(v.object({ id: v.string(), description: v.string(), start: v.number(), end: v.optional(v.number()) })),
});
export const noticeKind = v.union(v.literal("confirmation"), v.literal("trial"), v.literal("promotion"), v.literal("annual"));
export const noticeStatus = v.union(v.literal("pending"), v.literal("claimed"), v.literal("accepted"),
  v.literal("unknown"), v.literal("failed"), v.literal("superseded"), v.literal("missed"));
export const noticeRow = v.object({
  _id: v.id("subscriptionNotices"), _creationTime: v.number(), accountId: v.id("subscriptionNoticeAccounts"),
  eventKey: v.string(), kind: noticeKind, targetAt: v.number(), dueAt: v.number(), expiresAt: v.number(), status: noticeStatus,
  fingerprint: v.string(), attempts: v.number(), firstAttemptAt: v.optional(v.number()), leaseUntil: v.optional(v.number()),
  providerId: v.optional(v.string()), updatedAt: v.number(),
});
