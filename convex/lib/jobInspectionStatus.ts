export type JobInspectionStatus = "none" | "submitted" | "reinspection_requested";

export function deriveJobInspectionStatus(
  job: { status: string; inspectionCycleOpen?: boolean }, inspectionCount: number,
): JobInspectionStatus {
  if (job.status === "approved" || job.status === "cancelled" || inspectionCount === 0) return "none";
  if (job.inspectionCycleOpen === true) return "reinspection_requested";
  return "submitted";
}
