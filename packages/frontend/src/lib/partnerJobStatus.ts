export type PartnerResponseStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed";

/** The bridge is canonical for a received shared job's company-to-company state. */
export function getJobPrimaryStatus(job: {
  status: string;
  sharedFromJobId?: unknown;
  partnerResponseStatus?: PartnerResponseStatus | null;
}): string {
  if (job.sharedFromJobId && job.partnerResponseStatus) {
    return job.partnerResponseStatus;
  }
  return job.status;
}
