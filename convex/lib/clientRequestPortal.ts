export const AUTHENTICATED_REQUEST_SERVICES = [
  "Standard Clean",
  "Deep Clean",
  "Turnover",
  "Move In/Out",
  "Maintenance",
  "Other",
] as const;

export const AUTHENTICATED_REQUEST_TIME_WINDOWS = ["morning", "afternoon", "evening"] as const;

export type ClientRequestDisplayStatus =
  | "submitted"
  | "under_review"
  | "proposal_available"
  | "agreement_available"
  | "processing"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "declined";

export function deriveClientRequestStatus(input: {
  requestStatus: string;
  proposals?: any[];
  agreements?: any[];
  jobs?: any[];
  today: string;
}): ClientRequestDisplayStatus {
  const jobs = input.jobs ?? [];
  if (jobs.some((job) => job.status === "in_progress")) return "in_progress";
  if (jobs.some((job) => !["cancelled", "approved"].includes(job.status) && job.scheduledDate >= input.today)) return "scheduled";
  if (jobs.length > 0 && jobs.every((job) => job.status === "approved" || job.completedAt)) return "completed";
  if ((input.agreements ?? []).some((agreement) => agreement.status === "sent")) return "agreement_available";
  if ((input.proposals ?? []).some((proposal) => proposal.status === "sent")) return "proposal_available";
  if (input.requestStatus === "declined") return "declined";
  if (input.requestStatus === "contacted") return "under_review";
  if (input.requestStatus === "converted") return "processing";
  return "submitted";
}
