import { v } from "convex/values";

export const DAY = 86_400_000;
export const PRESENCE_VERSION = 1;
export const PRESENCE_THROTTLE = 5 * 60_000;
export const metricCounts = v.record(v.string(), v.number());
export type Counts = Record<string, number>;
export function increment(counts: Counts, key: string, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}
export function mergeCounts(target: Counts, source: Counts) {
  for (const [key, value] of Object.entries(source))
    increment(target, key, value);
}
export function inWindow(
  timestamp: number | undefined,
  now: number,
  days: number,
) {
  return (
    timestamp !== undefined && timestamp > now - days * DAY && timestamp <= now
  );
}
export function reportingPlan(tier?: string) {
  switch (tier) {
    case "scrub_solo":
      return "Solo";
    case "scrub_team":
      return "Team";
    case "scrub_pro":
      return "Pro";
    case "cleaning_owner":
      return "Legacy cleaning owner";
    case "str_owner":
      return "Legacy STR owner";
    default:
      return "Unknown / unset";
  }
}
export function engagement(
  owner: number | null,
  staff: number | null,
  start: number | null,
  now: number,
  days: number,
) {
  if (start === null || start > now - days * DAY)
    return "Insufficient observation";
  const o = inWindow(owner ?? undefined, now, days),
    s = inWindow(staff ?? undefined, now, days);
  return o && s
    ? "Both active"
    : o
      ? "Owner-only"
      : s
        ? "Staff-only"
        : "Neither";
}

type JobEvidence = {
  _creationTime: number;
  scheduledDate: string;
  status: string;
  completedAt?: number;
  approvedAt?: number;
  cancelledAt?: number;
  sharedFromJobId?: unknown;
  source?: string;
  generatedFromCommercialSchedule?: boolean;
};
/** Each persisted job belongs to one tenant. Partner copies are separately identified, not added to canonical volume. */
export function countJob(counts: Counts, job: JobEvidence, now: number) {
  increment(counts, "jobRecords");
  const shared = !!job.sharedFromJobId;
  increment(counts, shared ? "sharedCopies" : "canonicalJobs");
  if (job.source === "calendar_sync" || job.generatedFromCommercialSchedule)
    increment(counts, "automatedJobs");
  if (job.status === "cancelled") increment(counts, "cancelledRecords");
  if (job.status === "approved" && job.completedAt === undefined)
    increment(counts, "approvedMissingCompletion");
  if (job.status === "approved" && job.approvedAt === undefined)
    increment(counts, "approvedMissingApproval");
  if (job.status === "cancelled" && job.cancelledAt === undefined)
    increment(counts, "cancelledMissingTimestamp");
  const scheduled = /^\d{4}-\d{2}-\d{2}$/.test(job.scheduledDate)
    ? Date.parse(`${job.scheduledDate}T00:00:00Z`)
    : NaN;
  for (const days of [7, 30]) {
    const suffix = `${days}d`;
    // Canonical records avoid original + partner-copy double counting platform volume.
    if (!shared) {
      if (inWindow(job._creationTime, now, days))
        increment(counts, `created${suffix}`);
      if (job.status !== "cancelled" && inWindow(scheduled, now, days))
        increment(counts, `scheduled${suffix}`);
      if (inWindow(job.completedAt, now, days))
        increment(counts, `completed${suffix}`);
      if (inWindow(job.approvedAt, now, days))
        increment(counts, `approved${suffix}`);
      if (inWindow(job.cancelledAt, now, days))
        increment(counts, `cancelled${suffix}`);
    } else if (inWindow(job._creationTime, now, days))
      increment(counts, `sharedCreated${suffix}`);
  }
}

export const billingEvidence = v.object({
  trialEnd: v.union(v.number(), v.null()),
  awardedUntil: v.union(v.number(), v.null()),
  plan: v.string(),
  storedTier: v.union(v.string(), v.null()),
  status: v.string(),
  complimentary: v.boolean(),
  trial: v.boolean(),
  promotion: v.union(v.boolean(), v.null()),
  cancellation: v.boolean(),
  snapshotAt: v.union(v.number(), v.null()),
  stale: v.boolean(),
  payment: v.literal("Unverified"),
});
export const companyCard = v.object({
  id: v.id("companies"),
  measuredAt: v.number(),
  name: v.string(),
  contactEmail: v.union(v.string(), v.null()),
  qa: v.boolean(),
  createdAt: v.number(),
  billing: billingEvidence,
  ownerContacts: v.array(v.object({ name: v.string(), email: v.string() })),
  ownerLastSeen: v.union(v.number(), v.null()),
  staffLastSeen: v.union(v.number(), v.null()),
  coverageStart: v.union(v.number(), v.null()),
  engagement7: v.string(),
  engagement30: v.string(),
});
