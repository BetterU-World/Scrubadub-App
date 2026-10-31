import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export const IDENTITY_SCAN_LIMIT = 200;
export const IDENTITY_CANDIDATE_LIMIT = 20;
const identityReason = v.union(v.literal("overlapping_dates"), v.literal("same_uid_other_feed"), v.literal("absent_uid_same_feed"), v.literal("incomplete_scan"));
export const calendarIdentityReview = v.object({
  revision: v.number(), eventVersion: v.string(), fingerprint: v.string(),
  state: v.union(v.literal("pending"), v.literal("distinct"), v.literal("duplicate")),
  candidateIds: v.array(v.id("calendarReservations")), reasons: v.array(identityReason), incomplete: v.boolean(),
  observedAt: v.number(), reviewedAt: v.optional(v.number()), reviewedBy: v.optional(v.id("users")),
  duplicateOf: v.optional(v.id("calendarReservations")),
});
export const calendarDateReview = v.object({
  revision: v.number(), eventVersion: v.string(), state: v.union(v.literal("pending"), v.literal("acknowledged")),
  previousCheckIn: v.string(), previousCheckOut: v.string(), proposedCheckIn: v.string(), proposedCheckOut: v.string(),
  observedAt: v.number(), acknowledgedAt: v.optional(v.number()), acknowledgedBy: v.optional(v.id("users")),
});
type IdentityReview = Infer<typeof calendarIdentityReview>;
type Reservation = Doc<"calendarReservations">;

export function validStayDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Hints only. Neither a title nor a date/UID coincidence proves identity. */
export function identityReviewFor(
  target: Reservation, neighbors: Reservation[], scanIncomplete: boolean, now: number,
): IdentityReview | undefined {
  const reasons = new Set<Infer<typeof identityReason>>();
  const candidates = neighbors.filter(other => {
    if (other._id === target._id || other.companyId !== target.companyId || other.propertyId !== target.propertyId
      || (other.identityReview?.state === "duplicate" && !other.linkedJobId)) return false;
    let possible = false;
    if (target.checkIn < other.checkOut && other.checkIn < target.checkOut) { reasons.add("overlapping_dates"); possible = true; }
    if (target.externalUid === other.externalUid && target.connectionId !== other.connectionId) { reasons.add("same_uid_other_feed"); possible = true; }
    // Missing/cancelled old observations remain evidence, including disjoint dates.
    if (target.connectionId === other.connectionId && target.externalUid !== other.externalUid
      && (other.missing !== undefined || other.status === "cancelled")) { reasons.add("absent_uid_same_feed"); possible = true; }
    return possible;
  }).sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const incomplete = scanIncomplete || candidates.length > IDENTITY_CANDIDATE_LIMIT;
  if (incomplete) reasons.add("incomplete_scan");
  if (!candidates.length && !incomplete && !target.identityReview) return undefined;
  const selected = candidates.slice(0, IDENTITY_CANDIDATE_LIMIT);
  const fingerprint = JSON.stringify([target.eventVersion ?? target.rawHash, target.checkIn, target.checkOut, incomplete,
    selected.map(row => [row._id, row.eventVersion ?? row.rawHash, row.checkIn, row.checkOut,
      row.status, row.linkedJobId ?? null, row.missing?.episodeId ?? null, row.identityReview?.state === "duplicate"])]);
  if (target.identityReview?.fingerprint === fingerprint) return target.identityReview;
  return { revision: (target.identityReview?.revision ?? 0) + 1, eventVersion: target.eventVersion ?? "legacy",
    fingerprint, state: "pending", candidateIds: selected.map(row => row._id), reasons: [...reasons].sort(), incomplete, observedAt: now };
}
