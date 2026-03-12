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
import { Flag, CheckCircle, Eye, Wrench, ClipboardCheck } from "lucide-react";
import { Link } from "wouter";

type ActiveAction =
  | { flagId: string; type: "acknowledge" | "in_progress" | "resolve" | "wont_fix"; ownerNote: string }
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
  const inspectionFlags = useQuery(
    api.queries.inspections.getInspectionRedFlags,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id, status: statusFilter || undefined }
      : "skip"
  );
  const updateStatus = useMutation(api.mutations.redFlags.updateStatus);
  const createMaintenanceJob = useMutation(api.mutations.redFlags.createMaintenanceJob);

  if (!user || flags === undefined) return <PageLoader />;

  const handleStatusUpdate = async (flagId: string, status: "acknowledged" | "in_progress" | "resolved" | "wont_fix", ownerNote: string) => {
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

      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { value: "open", label: t("redFlags.filterOpen") },
          { value: "in_progress", label: t("redFlags.filterInProgress") },
          { value: "acknowledged", label: t("redFlags.filterAcknowledged") },
          { value: "resolved", label: t("redFlags.filterResolved") },
          { value: "wont_fix", label: t("redFlags.filterWontFix") },
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

      {/* Inspection-sourced red flags section */}
      {inspectionFlags && inspectionFlags.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" /> {t("redFlags.inspectionSourced")} ({inspectionFlags.length})
          </h3>
          <div className="space-y-3">
            {inspectionFlags.map((flag: any) => (
              <div key={flag._id} className="card border-blue-200">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge ${
                      flag.severity === "critical" ? "bg-red-200 text-red-900" :
                      flag.severity === "high" ? "bg-red-100 text-red-800" :
                      flag.severity === "medium" ? "bg-orange-100 text-orange-800" :
                      "bg-yellow-100 text-yellow-800"
                    } capitalize`}>
                      {t(`severity.${flag.severity}`, flag.severity)}
                    </span>
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                      {t("redFlags.sourceInspection")}
                    </span>
                    <span className="text-xs text-gray-500">{flag.managerName}</span>
                    {flag.readinessScore && (
                      <span className="text-xs font-medium text-blue-700">{flag.readinessScore}/10</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{flag.note}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {flag.propertyName} · {flag.jobDate}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {flags.length === 0 && (!inspectionFlags || inspectionFlags.length === 0) ? (
        <EmptyState icon={Flag} title={t("redFlags.noRedFlags")} description={t("redFlags.noMatchFilter")} />
      ) : flags.length === 0 ? null : (
        <div className="space-y-3">
          {inspectionFlags && inspectionFlags.length > 0 && (
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Flag className="w-4 h-4" /> {t("redFlags.cleanerSourced")}
            </h3>
          )}
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
                        {t(`severity.${flag.severity}`, flag.severity)}
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
                  <div className="flex gap-2 flex-shrink-0 flex-wrap">
                    {flag.status !== "resolved" && flag.status !== "wont_fix" && (
                      <>
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
                        {flag.status !== "in_progress" && (
                          <button
                            onClick={() =>
                              setActiveAction(
                                isActive && activeAction.type === "in_progress"
                                  ? null
                                  : { flagId: flag._id, type: "in_progress", ownerNote: "" }
                              )
                            }
                            className="btn-secondary text-sm flex items-center gap-1"
                          >
                            {t("redFlags.markInProgress")}
                          </button>
                        )}
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
                        <button
                          onClick={() =>
                            setActiveAction(
                              isActive && activeAction.type === "wont_fix"
                                ? null
                                : { flagId: flag._id, type: "wont_fix", ownerNote: "" }
                            )
                          }
                          className="btn-secondary text-sm flex items-center gap-1 text-gray-500"
                        >
                          {t("redFlags.wontFix")}
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

                {/* Inline owner note input for lifecycle status changes */}
                {isStatusAction && (activeAction.type === "acknowledge" || activeAction.type === "in_progress" || activeAction.type === "resolve" || activeAction.type === "wont_fix") && (
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
                        onClick={() => {
                          const statusMap: Record<string, "acknowledged" | "in_progress" | "resolved" | "wont_fix"> = {
                            acknowledge: "acknowledged",
                            in_progress: "in_progress",
                            resolve: "resolved",
                            wont_fix: "wont_fix",
                          };
                          handleStatusUpdate(
                            flag._id,
                            statusMap[activeAction.type],
                            activeAction.ownerNote
                          );
                        }}
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
