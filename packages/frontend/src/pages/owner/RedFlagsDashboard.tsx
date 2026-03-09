import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Flag, CheckCircle, Eye, Wrench } from "lucide-react";
import { Link } from "wouter";

type ActiveAction =
  | { flagId: string; type: "acknowledge" | "resolve"; ownerNote: string }
  | { flagId: string; type: "maintenance"; scheduledDate: string; cleanerIds: string[]; notes: string; durationMinutes: string }
  | null;

export function RedFlagsDashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("open");
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  const flags = useQuery(
    api.queries.redFlags.listByCompany,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id, status: statusFilter || undefined }
      : "skip"
  );
  const maintenanceWorkers = useQuery(
    api.queries.employees.getMaintenanceWorkers,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const updateStatus = useMutation(api.mutations.redFlags.updateStatus);
  const createMaintenanceJob = useMutation(api.mutations.redFlags.createMaintenanceJob);

  if (!user || flags === undefined) return <PageLoader />;

  const handleStatusUpdate = async (flagId: string, status: "acknowledged" | "resolved", ownerNote: string) => {
    await updateStatus({
      flagId: flagId as Id<"redFlags">,
      status,
      userId: user!._id,
      ...(ownerNote.trim() ? { ownerNote: ownerNote.trim() } : {}),
    });
    setActiveAction(null);
  };

  const handleCreateMaintenanceJob = async (flagId: string) => {
    if (activeAction?.type !== "maintenance") return;
    const { scheduledDate, cleanerIds, notes, durationMinutes } = activeAction;
    if (!scheduledDate || cleanerIds.length === 0) return;

    await createMaintenanceJob({
      flagId: flagId as Id<"redFlags">,
      scheduledDate,
      cleanerIds: cleanerIds as Id<"users">[],
      userId: user!._id,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(durationMinutes.trim() ? { durationMinutes: parseInt(durationMinutes, 10) } : {}),
    });
    setActiveAction(null);
  };

  return (
    <div>
      <PageHeader title={t("redFlags.title")} description={t("redFlags.description")} />

      <div className="flex gap-2 mb-6">
        {[
          { value: "open", label: t("redFlags.filterOpen") },
          { value: "acknowledged", label: t("redFlags.filterAcknowledged") },
          { value: "resolved", label: t("redFlags.filterResolved") },
          { value: "", label: t("redFlags.filterAll") },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {flags.length === 0 ? (
        <EmptyState icon={Flag} title={t("redFlags.noRedFlags")} description={t("redFlags.noMatchFilter")} />
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => {
            const isActive = activeAction?.flagId === flag._id;
            const isStatusAction = isActive && (activeAction.type === "acknowledge" || activeAction.type === "resolve");
            const isMaintenanceAction = isActive && activeAction.type === "maintenance";

            return (
              <div key={flag._id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`badge ${
                        flag.severity === "critical" ? "bg-red-200 text-red-900" :
                        flag.severity === "high" ? "bg-red-100 text-red-800" :
                        flag.severity === "medium" ? "bg-orange-100 text-orange-800" :
                        "bg-yellow-100 text-yellow-800"
                      } capitalize`}>
                        {flag.severity}
                      </span>
                      <span className="text-sm font-medium capitalize">{flag.category}</span>
                      <StatusBadge status={flag.status} />
                    </div>
                    <p className="text-sm text-gray-700">{flag.note}</p>
                    {flag.ownerNote && (
                      <p className="text-xs text-gray-500 italic mt-1">
                        {t("redFlags.ownerNote", { note: flag.ownerNote })}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {flag.propertyName} · {flag.jobDate}
                    </p>
                    {flag.maintenanceJobId && (
                      <Link
                        href={`/jobs/${flag.maintenanceJobId}`}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1"
                      >
                        <Wrench className="w-3 h-3" /> {t("redFlags.viewMaintenanceJob")}
                      </Link>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {flag.status === "open" && (
                      <button
                        onClick={() =>
                          setActiveAction(
                            isActive && activeAction.type === "acknowledge"
                              ? null
                              : { flagId: flag._id, type: "acknowledge", ownerNote: "" }
                          )
                        }
                        className="btn-secondary text-sm flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> {t("redFlags.acknowledge")}
                      </button>
                    )}
                    {(flag.status === "open" || flag.status === "acknowledged") && (
                      <>
                        <button
                          onClick={() =>
                            setActiveAction(
                              isActive && activeAction.type === "resolve"
                                ? null
                                : { flagId: flag._id, type: "resolve", ownerNote: "" }
                            )
                          }
                          className="btn-primary text-sm flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> {t("redFlags.resolve")}
                        </button>
                        {!flag.maintenanceJobId && (
                          <button
                            onClick={() =>
                              setActiveAction(
                                isMaintenanceAction
                                  ? null
                                  : { flagId: flag._id, type: "maintenance", scheduledDate: "", cleanerIds: [], notes: "", durationMinutes: "" }
                              )
                            }
                            className="btn-secondary text-sm flex items-center gap-1"
                          >
                            <Wrench className="w-3.5 h-3.5" /> {t("redFlags.createJob")}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Inline owner note input for Acknowledge / Resolve */}
                {isStatusAction && (activeAction.type === "acknowledge" || activeAction.type === "resolve") && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {t("redFlags.addNote")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={activeAction.ownerNote}
                        onChange={(e) =>
                          setActiveAction({ ...activeAction, ownerNote: e.target.value })
                        }
                        placeholder={t("redFlags.enterNote")}
                        className="input text-sm flex-1"
                        autoFocus
                      />
                      <button
                        onClick={() =>
                          handleStatusUpdate(
                            flag._id,
                            activeAction.type === "acknowledge" ? "acknowledged" : "resolved",
                            activeAction.ownerNote
                          )
                        }
                        className="btn-primary text-sm"
                      >
                        {t("common.confirm")}
                      </button>
                      <button
                        onClick={() => setActiveAction(null)}
                        className="btn-secondary text-sm"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline maintenance job form */}
                {isMaintenanceAction && activeAction.type === "maintenance" && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {t("redFlags.scheduledDate")}
                      </label>
                      <input
                        type="date"
                        value={activeAction.scheduledDate}
                        onChange={(e) =>
                          setActiveAction({ ...activeAction, scheduledDate: e.target.value })
                        }
                        className="input text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {t("redFlags.assignWorkers")}
                      </label>
                      {maintenanceWorkers === undefined ? (
                        <p className="text-xs text-gray-400">{t("redFlags.loadingWorkers")}</p>
                      ) : maintenanceWorkers.length === 0 ? (
                        <p className="text-xs text-gray-400">{t("redFlags.noWorkersAvailable")}</p>
                      ) : (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {maintenanceWorkers.map((worker) => (
                            <label key={worker._id} className="flex items-center gap-1.5 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={activeAction.cleanerIds.includes(worker._id)}
                                onChange={(e) => {
                                  const ids = e.target.checked
                                    ? [...activeAction.cleanerIds, worker._id]
                                    : activeAction.cleanerIds.filter((id) => id !== worker._id);
                                  setActiveAction({ ...activeAction, cleanerIds: ids });
                                }}
                                className="rounded border-gray-300"
                              />
                              {worker.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          {t("redFlags.notesOptional")}
                        </label>
                        <input
                          type="text"
                          value={activeAction.notes}
                          onChange={(e) =>
                            setActiveAction({ ...activeAction, notes: e.target.value })
                          }
                          placeholder={t("redFlags.notesPlaceholder")}
                          className="input text-sm w-full"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          {t("redFlags.durationMin")}
                        </label>
                        <input
                          type="number"
                          value={activeAction.durationMinutes}
                          onChange={(e) =>
                            setActiveAction({ ...activeAction, durationMinutes: e.target.value })
                          }
                          placeholder="e.g. 60"
                          className="input text-sm w-full"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCreateMaintenanceJob(flag._id)}
                        disabled={!activeAction.scheduledDate || activeAction.cleanerIds.length === 0}
                        className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t("redFlags.createMaintenanceJob")}
                      </button>
                      <button
                        onClick={() => setActiveAction(null)}
                        className="btn-secondary text-sm"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
