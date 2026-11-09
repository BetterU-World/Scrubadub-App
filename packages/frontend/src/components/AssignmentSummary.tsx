import { useTranslation } from "react-i18next";

type Worker = { _id: string; name: string } | null;
export type AssignmentDisplay = {
  assignedTeamId?: string;
  assignedTeamName?: string | null;
  cleaners?: readonly Worker[];
  assignedTeamMembers?: readonly Worker[];
};

/** Describe assignment sources, not a sum of people through each source. */
export function AssignmentSummary({ job, className = "" }: { job: AssignmentDisplay; className?: string }) {
  const { t } = useTranslation();
  const workers = [...new Map((job.cleaners ?? []).filter((w): w is NonNullable<Worker> => !!w).map(w => [w._id, w])).values()];
  const memberIds = new Set((job.assignedTeamMembers ?? []).filter(Boolean).map(w => w!._id));
  const hasTeam = !!(job.assignedTeamId || job.assignedTeamName);
  return <div className={`min-w-0 break-words space-y-1 ${className}`}>
    {hasTeam && <p><span className="font-medium">{t("assignment.team")}:</span> {job.assignedTeamName ?? t("assignment.unavailableTeam")}</p>}
    {workers.length > 0 && <p><span className="font-medium">{t("assignment.direct")}:</span> {workers.map(w => `${w.name}${hasTeam && memberIds.has(w._id) ? ` (${t("assignment.alsoOnTeam")})` : ""}`).join(", ")}</p>}
    {!hasTeam && workers.length === 0 && <p>{t("common.unassigned")}</p>}
  </div>;
}
