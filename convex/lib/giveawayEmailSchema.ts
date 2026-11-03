import { defineTable } from "convex/server";
import { v } from "convex/values";
export const templateV = v.union(v.literal("winner"), v.literal("marketing"));
export const modeV = v.union(v.literal("test"), v.literal("production"));
export const countsV = v.object({ total: v.number(), winner: v.number(), marketing: v.number(), invalid: v.number(), duplicate: v.number(), noConsent: v.number(), invalidConsent: v.number(), suppressed: v.number() });
export const rowStateV = v.union(v.literal("ready"), v.literal("reserved"), v.literal("accepted"), v.literal("rejected"), v.literal("uncertain"), v.literal("suppressed"));
export const runStateV = v.union(v.literal("preparing"), v.literal("ready"), v.literal("approved"), v.literal("paused"), v.literal("complete"));
export const giveawayEmailTables = {
  giveawayEmailRuns: defineTable({
    mode: modeV, state: runStateV, createdBy: v.id("users"), createdAt: v.number(), configHash: v.string(), contentVersion: v.string(),
    digest: v.string(), cursor: v.union(v.string(), v.null()), counts: countsV,
    approvedBy: v.optional(v.id("users")), approvedAt: v.optional(v.number()), approvalExpiresAt: v.optional(v.number()),
    inFlight: v.optional(v.id("giveawayEmailRecipients")),
  }),
  giveawayEmailRecipients: defineTable({
    runId: v.id("giveawayEmailRuns"), entryId: v.optional(v.id("giveawayEntries")), template: templateV,
    email: v.string(), emailHash: v.string(), state: rowStateV, providerId: v.optional(v.string()), reservedAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()), responseDeadline: v.optional(v.number()),
  }).index("by_runId_and_template_and_state", ["runId", "template", "state"]),
  giveawayEmailDeliveries: defineTable({
    key: v.string(), recipientId: v.id("giveawayEmailRecipients"), state: rowStateV, reservedAt: v.number(),
    providerId: v.optional(v.string()), acceptedAt: v.optional(v.number()), reconciledBy: v.optional(v.id("users")),
    evidenceReference: v.optional(v.string()),
  }).index("by_key", ["key"]),
  marketingSuppressions: defineTable({ emailHash: v.string(), reason: v.union(v.literal("unsubscribe"), v.literal("provider"), v.literal("manual")), createdAt: v.number(), createdBy: v.optional(v.id("users")) }).index("by_emailHash", ["emailHash"]),
};
