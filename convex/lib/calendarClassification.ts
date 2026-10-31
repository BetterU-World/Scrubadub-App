import { v } from "convex/values";

export const calendarEventMetadata = v.object({
  status: v.optional(v.string()),
  transparency: v.optional(v.string()),
  categories: v.optional(v.array(v.string())),
});
export const calendarClassification = v.object({
  kind: v.union(v.literal("guest_reservation"), v.literal("non_guest_block"), v.literal("needs_review")),
  source: v.union(v.literal("unverified_ical"), v.literal("owner")),
  reason: v.union(v.literal("insufficient_verified_evidence"), v.literal("material_event_changed"), v.literal("owner_confirmed")),
  classifiedAt: v.number(),
  revision: v.number(),
  // Retained when changed evidence requires renewed review; prior decisions
  // are also durably recorded in auditLog, never silently overwritten by sync.
  ownerDecision: v.optional(v.object({
    kind: v.union(v.literal("guest_reservation"), v.literal("non_guest_block")),
    actorId: v.id("users"), confirmedAt: v.number(), eventVersion: v.string(),
  })),
});

/** No supported iCal transport verifies a booking contract. Even CONFIRMED,
 * provider labels, IDs and human-readable titles remain untrusted hints.
 * Positive guest/block classification is available only through owner review.
 */
export function classifyICalEvent(_evidence: {
  platform?: string; summary?: string; status?: string; transparency?: string; categories?: string[];
}) {
  return { kind: "needs_review" as const, source: "unverified_ical" as const,
    reason: "insufficient_verified_evidence" as const };
}
