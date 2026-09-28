import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth, getStaffSessionToken } from "@/hooks/useAuth";

export function usePerformedWorkers(jobId: Id<"jobs">, enabled = true) {
  const { user } = useAuth();
  const candidates = useQuery(
    api.workerCompensation.submissionCandidates,
    user && enabled
      ? { userId: user._id, sessionToken: getStaffSessionToken(), jobId }
      : "skip",
  );
  const [selected, setSelected] = useState<Id<"users">[]>([]);
  const validSelected = selected.filter((id) =>
    candidates?.some((w) => w.userId === id),
  );
  return { candidates, selected: validSelected, setSelected };
}

export function PerformedWorkerPicker({
  candidates,
  selected,
  setSelected,
}: {
  candidates: { userId: Id<"users">; displayName: string }[] | undefined;
  selected: Id<"users">[];
  setSelected: (ids: Id<"users">[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2 my-4 min-w-0">
      <legend className="font-medium">{t("compensation.performed")}</legend>
      <p className="text-sm text-gray-500">{t("compensation.rosterHelp")}</p>
      {candidates === undefined && <p role="status">{t("common.loading")}</p>}
      {candidates?.length === 0 && (
        <p role="status">{t("compensation.noCandidates")}</p>
      )}
      {candidates?.map((w) => (
        <label
          key={w.userId}
          className="flex items-center gap-3 py-3 min-h-11 break-words"
        >
          <input
            type="checkbox"
            checked={selected.includes(w.userId)}
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? [...selected, w.userId]
                  : selected.filter((id) => id !== w.userId),
              )
            }
          />
          <span className="min-w-0 break-words">{w.displayName}</span>
        </label>
      ))}
    </fieldset>
  );
}
