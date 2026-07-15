export type PartnerResponseStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed";

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
