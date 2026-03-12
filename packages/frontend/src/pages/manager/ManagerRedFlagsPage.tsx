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
import { Flag, CheckCircle } from "lucide-react";
import { Link } from "wouter";

type ActiveAction = {
  flagId: string;
  type: "in_progress" | "resolve" | "wont_fix";
  note: string;
} | null;

export function ManagerRedFlagsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("open");
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  const canResolve = !!(user as any)?.canResolveRedFlags;

  const flags = useQuery(
    api.queries.redFlags.listForManager,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id, status: statusFilter || undefined }
      : "skip"
  );
  const updateLifecycle = useMutation(api.mutations.redFlags.managerUpdateLifecycle);

  if (!user || flags === undefined) return <PageLoader />;

  const handleLifecycleUpdate = async (flagId: string, status: "in_progress" | "resolved" | "wont_fix", note: string) => {
    await updateLifecycle({
      flagId: flagId as Id<"redFlags">,
      status,
      userId: user!._id,
      ...(note.trim() ? { note: note.trim() } : {}),
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

      {flags.length === 0 ? (
        <EmptyState icon={Flag} title={t("redFlags.noRedFlags")} description={t("redFlags.noMatchFilter")} />
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => {
            const isActive = activeAction?.flagId === flag._id;

            return (
              <div key={flag._id} className={`card ${flag.category === "inspection" ? "border-blue-200" : ""}`}>
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
                      {flag.category === "inspection" ? (
                        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          {t("redFlags.sourceInspection")}
                        </span>
                      ) : (
                        <span className="text-sm font-medium capitalize">{flag.category}</span>
                      )}
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
                        {t("redFlags.viewMaintenanceJob")}
                      </Link>
                    )}
                  </div>
                  {canResolve && flag.status !== "resolved" && flag.status !== "wont_fix" && (
                    <div className="flex gap-2 flex-shrink-0 flex-wrap">
                      {flag.status !== "in_progress" && (
                        <button
                          onClick={() =>
                            setActiveAction(
                              isActive && activeAction.type === "in_progress"
                                ? null
                                : { flagId: flag._id, type: "in_progress", note: "" }
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
                              : { flagId: flag._id, type: "resolve", note: "" }
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
                              : { flagId: flag._id, type: "wont_fix", note: "" }
                          )
                        }
                        className="btn-secondary text-sm flex items-center gap-1 text-gray-500"
                      >
                        {t("redFlags.wontFix")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline note input for lifecycle status changes */}
                {isActive && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {t("redFlags.addNote")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={activeAction.note}
                        onChange={(e) =>
                          setActiveAction({ ...activeAction, note: e.target.value })
                        }
                        placeholder={t("redFlags.enterNote")}
                        className="input text-sm flex-1"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          const statusMap: Record<string, "in_progress" | "resolved" | "wont_fix"> = {
                            in_progress: "in_progress",
                            resolve: "resolved",
                            wont_fix: "wont_fix",
                          };
                          handleLifecycleUpdate(
                            flag._id,
                            statusMap[activeAction.type],
                            activeAction.note
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
