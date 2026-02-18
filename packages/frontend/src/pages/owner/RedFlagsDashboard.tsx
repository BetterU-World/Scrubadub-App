import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
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
  const { user, sessionToken } = useAuth();
  const [statusFilter, setStatusFilter] = useState("open");
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  const flags = useQuery(
    api.queries.redFlags.listByCompany,
    sessionToken
      ? { sessionToken, status: statusFilter || undefined }
      : "skip"
  );
  const cleaners = useQuery(
    api.queries.employees.getCleaners,
    sessionToken ? { sessionToken } : "skip"
  );
  const updateStatus = useMutation(api.mutations.redFlags.updateStatus);
  const createMaintenanceJob = useMutation(api.mutations.redFlags.createMaintenanceJob);

  if (!user || flags === undefined) return <PageLoader />;

  const handleStatusUpdate = async (flagId: string, status: "acknowledged" | "resolved", ownerNote: string) => {
    await updateStatus({
      sessionToken: sessionToken!,
      flagId,
      status,
      ...(ownerNote.trim() ? { ownerNote: ownerNote.trim() } : {}),
    });
    setActiveAction(null);
  };

  const handleCreateMaintenanceJob = async (flagId: string) => {
    if (activeAction?.type !== "maintenance") return;
    const { scheduledDate, cleanerIds, notes, durationMinutes } = activeAction;
    if (!scheduledDate || cleanerIds.length === 0) return;

    await createMaintenanceJob({
      sessionToken: sessionToken!,
      flagId,
      scheduledDate,
      cleanerIds,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(durationMinutes.trim() ? { durationMinutes: parseInt(durationMinutes, 10) } : {}),
    });
    setActiveAction(null);
  };

  return (
    <div>
      <PageHeader title="Red Flags" description="Track and resolve issues reported during cleaning" />

      <div className="flex gap-2 mb-6">
        {[
          { value: "open", label: "Open" },
          { value: "acknowledged", label: "Acknowledged" },
          { value: "resolved", label: "Resolved" },
          { value: "", label: "All" },
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
        <EmptyState icon={Flag} title="No red flags" description="No issues match the selected filter" />
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
                        Owner note: {flag.ownerNote}
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
                        <Wrench className="w-3 h-3" /> View Maintenance Job
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
                        <Eye className="w-3.5 h-3.5" /> Acknowledge
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
                          <CheckCircle className="w-3.5 h-3.5" /> Resolve
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
                            <Wrench className="w-3.5 h-3.5" /> Create Job
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
                      Add a note (optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={activeAction.ownerNote}
                        onChange={(e) =>
                          setActiveAction({ ...activeAction, ownerNote: e.target.value })
                        }
                        placeholder="Enter a note..."
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
                        Confirm
                      </button>
                      <button
                        onClick={() => setActiveAction(null)}
                        className="btn-secondary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline maintenance job form */}
                {isMaintenanceAction && activeAction.type === "maintenance" && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Scheduled Date *
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
                        Assign Cleaners *
                      </label>
                      {cleaners === undefined ? (
                        <p className="text-xs text-gray-400">Loading cleaners...</p>
                      ) : cleaners.length === 0 ? (
                        <p className="text-xs text-gray-400">No cleaners available</p>
                      ) : (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {cleaners.map((cleaner) => (
                            <label key={cleaner._id} className="flex items-center gap-1.5 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={activeAction.cleanerIds.includes(cleaner._id)}
                                onChange={(e) => {
                                  const ids = e.target.checked
                                    ? [...activeAction.cleanerIds, cleaner._id]
                                    : activeAction.cleanerIds.filter((id) => id !== cleaner._id);
                                  setActiveAction({ ...activeAction, cleanerIds: ids });
                                }}
                                className="rounded border-gray-300"
                              />
                              {cleaner.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Notes (optional)
                        </label>
                        <input
                          type="text"
                          value={activeAction.notes}
                          onChange={(e) =>
                            setActiveAction({ ...activeAction, notes: e.target.value })
                          }
                          placeholder="Any additional notes..."
                          className="input text-sm w-full"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Duration (min)
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
                        Create Maintenance Job
                      </button>
                      <button
                        onClick={() => setActiveAction(null)}
                        className="btn-secondary text-sm"
                      >
                        Cancel
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
