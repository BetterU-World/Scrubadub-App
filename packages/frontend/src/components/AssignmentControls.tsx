import { useId } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";

type Worker = { _id: string; name: string; email?: string };
type Team = { _id: string; name: string };
type Props = {
  teams: readonly Team[]; workers: readonly Worker[]; selectedWorkerIds: string[]; teamId: string;
  onTeamChange: (id: string) => void; onWorkersChange: (ids: string[]) => void;
  previousTeam?: Team | null; previousWorkers?: readonly (Worker | null)[];
  unavailableIds?: ReadonlySet<string>; maintenance?: boolean;
};

export function AssignmentControls({ teams, workers, selectedWorkerIds, teamId, onTeamChange, onWorkersChange,
  previousTeam, previousWorkers = [], unavailableIds, maintenance = false }: Props) {
  const { t } = useTranslation();
  const { user, sessionToken } = useAuth();
  const id = useId();
  const team = useQuery(api.queries.teams.get, user && teamId
    ? { teamId: teamId as Id<"teams">, userId: user._id, sessionToken } : "skip");
  // Only use eligible local membership IDs to mark overlap; do not display another company's roster.
  const memberIds = new Set<string>((team?.members ?? []).filter((m: { active: boolean; companyId: string; user?: { status: string; role: string } | null }) =>
    m.active && m.companyId === user?.companyId && m.user?.status === "active" &&
    (maintenance ? m.user.role === "maintenance" : ["cleaner", "manager", "owner"].includes(m.user.role)))
    .map((m: { userId: string }) => m.userId));
  const selected = new Set(selectedWorkerIds);
  const choices = [...workers];
  for (const workerId of selected) if (!choices.some(w => w._id === workerId)) {
    choices.push(previousWorkers.find(w => w?._id === workerId) ?? { _id: workerId, name: t("assignment.unavailableWorker") });
  }
  const missingTeam = teamId && !teams.some(team => team._id === teamId);
  return <fieldset className="space-y-3 min-w-0" aria-describedby={`${id}-help`}>
    <legend className="text-sm font-semibold text-gray-700">{t("quick.assignment")}</legend>
    <p id={`${id}-help`} className="text-xs text-gray-600">{t("assignment.help")}</p>
    <div className="min-w-0">
      <label htmlFor={`${id}-team`} className="block text-sm font-medium mb-1">{t("assignment.team")}</label>
      <select id={`${id}-team`} className="input-field w-full min-w-0" value={teamId} onChange={e => onTeamChange(e.target.value)}>
        <option value="">{t("assignment.noTeam")}</option>
        {missingTeam && <option value={teamId}>{previousTeam?.name ?? team?.name ?? t("assignment.unavailableTeam")} ({t("assignment.retainedTeam")})</option>}
        {teams.map(team => <option key={team._id} value={team._id}>{team.name}</option>)}
      </select>
    </div>
    <fieldset className="space-y-2 min-w-0">
      <legend className="text-sm font-medium">{t("assignment.direct")}</legend>
      {choices.length === 0 && <p className="text-sm text-gray-500">{t("assignment.noWorkers")}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
        {choices.map(worker => {
          const checked = selected.has(worker._id);
          const unavailable = unavailableIds?.has(worker._id);
          const retained = !workers.some(w => w._id === worker._id);
          return <label key={worker._id} className="flex items-start gap-3 min-h-11 rounded-lg border border-gray-200 p-3 min-w-0 cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={checked} disabled={!!unavailable && !checked}
              onChange={e => onWorkersChange(e.target.checked ? [...selected, worker._id] : [...selected].filter(id => id !== worker._id))} />
            <span className="min-w-0 break-words text-sm"><span>{worker.name}</span>
              {worker.email && <span className="block text-xs text-gray-500 break-all">{worker.email}</span>}
              {memberIds.has(worker._id) && <span className="block text-xs text-blue-700">{t("assignment.alsoOnTeam")}</span>}
              {unavailable && <span className="block text-xs text-amber-700">{t("common.unavailable")}</span>}
              {retained && <span className="block text-xs text-amber-700">{t("assignment.retainedWorker")}</span>}
            </span>
          </label>;
        })}
      </div>
    </fieldset>
    {teamId && <p className="text-xs text-gray-600">{t("assignment.overlapHelp")}</p>}
  </fieldset>;
}
