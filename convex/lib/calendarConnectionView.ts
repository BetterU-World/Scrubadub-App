import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { sanitizeFeedDiagnostic } from "./calendarFeedSecurity";

export const calendarConnectionViewValidator = v.object({
  _id: v.id("calendarConnections"), _creationTime: v.number(),
  companyId: v.id("companies"), propertyId: v.id("properties"),
  platform: v.union(v.literal("airbnb"), v.literal("vrbo"), v.literal("other")),
  label: v.optional(v.string()), enabled: v.boolean(), feedRevision: v.optional(v.number()),
  hasFeedUrl: v.boolean(), lastSyncAt: v.optional(v.number()), lastCheckedAt: v.optional(v.number()),
  lastSyncStatus: v.union(v.literal("success"), v.literal("error"), v.literal("pending"), v.literal("empty")),
  consecutiveErrors: v.number(), lastSyncError: v.optional(v.string()),
});

/** Explicit allowlist: bearer URL and internal attempt/cooldown details stay server-side. */
export function calendarConnectionView(c: Doc<"calendarConnections">) {
  return {
    _id: c._id, _creationTime: c._creationTime, companyId: c.companyId,
    propertyId: c.propertyId, platform: c.platform, label: c.label,
    enabled: c.enabled, feedRevision: c.feedRevision, hasFeedUrl: Boolean(c.icalUrl),
    lastSyncAt: c.lastSyncAt, lastCheckedAt: c.lastCheckedAt,
    lastSyncStatus: c.lastSyncStatus, consecutiveErrors: c.consecutiveErrors,
    lastSyncError: c.lastSyncError ? sanitizeFeedDiagnostic(c.lastSyncError) : undefined,
  };
}
