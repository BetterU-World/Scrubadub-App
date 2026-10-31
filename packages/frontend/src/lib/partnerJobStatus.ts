export type PartnerResponseStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed";

/** Recognize only the server's shared-work boundary errors, including wrapped calls. */
export function sharedWorkError(message: string) {
  if (/company Owner must accept this shared-work request/i.test(message)) return {
    key: "sharedWork.pending", fallback: "Your company Owner must accept this shared-work request before assignment or execution. Worker acceptance is separate.",
  };
  if (/shared-work request was rejected/i.test(message)) return {
    key: "sharedWork.rejected", fallback: "This shared-work request was rejected. Historical information remains available; operational changes are blocked.",
  };
  if (/Shared work needs manual review|shared-work record needs manual review|partner connection is disconnected/i.test(message)) return {
    key: "sharedWork.manualReview", fallback: "This shared-work record needs manual review. Contact your company Owner. Existing work and financial evidence have been preserved.",
  };
  return null;
}

const PARTNER_STATUS_PRIORITY: PartnerResponseStatus[] = [
  "rejected",
  "pending",
  "accepted",
  "in_progress",
  "completed",
];

export function getPartnerResponseStatus(
  statuses: PartnerResponseStatus[],
): PartnerResponseStatus | null {
  return PARTNER_STATUS_PRIORITY.find((status) => statuses.includes(status)) ?? null;
}

/** The bridge is canonical for a received shared job's company-to-company state. */
export function getJobPrimaryStatus(job: {
  status: string;
  sharedFromJobId?: unknown;
  partnerResponseStatus?: PartnerResponseStatus | null;
}): string {
  if (job.partnerResponseStatus) {
    return job.partnerResponseStatus;
  }
  return job.status;
}
