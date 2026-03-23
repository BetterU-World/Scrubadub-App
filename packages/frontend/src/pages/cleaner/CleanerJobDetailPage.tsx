import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useParams, Link, useLocation } from "wouter";
import { JobTimeline } from "@/components/JobTimeline";
import { Calendar, Clock, MapPin, Key, CheckCircle, XCircle, Play, ClipboardCheck, MapPinCheck, Send, Package, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
} from "../../../../../convex/lib/constants";

export function CleanerJobDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const job = useQuery(api.queries.jobs.get,
    user ? { jobId: params.id as Id<"jobs">, userId: user._id } : "skip"
  );
  const acceptJob = useMutation(api.mutations.jobs.acceptJob);
  const denyJob = useMutation(api.mutations.jobs.denyJob);
  const arriveJob = useMutation(api.mutations.jobs.arriveJob);
  const startJob = useMutation(api.mutations.jobs.startJob);
  const completeJob = useMutation(api.mutations.jobs.completeJob);
  const createForm = useMutation(api.mutations.forms.createFromTemplate);

  const cleanerCancelJob = useMutation(api.mutations.jobs.cleanerCancelJob);
  const updateChecklistItem = useMutation(api.mutations.jobs.updateInventoryChecklistItem);

  const [showDeny, setShowDeny] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [showCleanerCancel, setShowCleanerCancel] = useState(false);
  const [cleanerCancelReason, setCleanerCancelReason] = useState("");
  const [cleanerCancelling, setCleanerCancelling] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [completing, setCompleting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [denying, setDenying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  if (job === undefined) return <PageLoader />;
  if (job === null) return <div className="text-center py-12 text-gray-500">{t("jobs.jobNotFound")}</div>;

  const acceptance = job.acceptanceStatus ?? "pending";
  const canAccept = job.status === "scheduled" && acceptance === "pending";
  const canArrive = (job.status === "confirmed" || job.status === "scheduled") && !job.arrivedAt;
  const hasArrived = !!job.arrivedAt;
  const canStart = (job.status === "confirmed" || job.status === "rework_requested");
  const canCleanerCancel = job.status === "confirmed" && acceptance === "accepted" && !job.startedAt;
  const isInProgress = job.status === "in_progress";
  const hasForm = !!job.form;

  const handleStartJob = async () => {
    if (!user) return;
    await startJob({ jobId: job._id, userId: user._id });
    await createForm({
      jobId: job._id,
      companyId: job.companyId,
      cleanerId: user._id,
    });
    setLocation(`/jobs/${job._id}/form`);
  };

  const handleCompleteJob = async () => {
    if (!user) return;
    setCompleting(true);
    try {
      await completeJob({ jobId: job._id, notes: completionNotes || undefined, userId: user._id });
      setShowComplete(false);
    } catch (err: any) {
      console.error(err);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title={job.property?.name ?? (job as any).propertySnapshot?.name ?? t("jobs.jobDetails")} />

      <div className="space-y-4">
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} />
            <span className="text-sm text-gray-500 capitalize">{t(`jobTypes.${job.type}`, job.type.replace(/_/g, " "))}</span>
            {hasArrived && (
              <span className="badge bg-green-100 text-green-700 flex items-center gap-1">
                <MapPinCheck className="w-3 h-3" /> {t("jobs.arrived")}
              </span>
            )}
          </div>

          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" /> {job.scheduledDate}
              {job.startTime && ` at ${job.startTime}`}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" /> {job.durationMinutes} {t("common.minutes")}
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" /> {job.property?.address ?? (job as any).propertySnapshot?.address}
            </div>
          </div>

          {(job.property?.accessInstructions || (job as any).propertySnapshot?.accessInstructions) && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm font-medium text-yellow-800 flex items-center gap-1">
                <Key className="w-4 h-4" /> {t("jobs.accessInstructions")}
              </p>
              <p className="text-sm text-yellow-700 mt-1">{job.property?.accessInstructions ?? (job as any).propertySnapshot?.accessInstructions}</p>
            </div>
          )}

          {job.notes && <p className="text-sm text-gray-600 border-t pt-3">{job.notes}</p>}
        </div>

        <JobTimeline job={job as any} />

        {job.form?.ownerNotes && (
          <div className="card">
            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-sm font-medium text-orange-800">{t("jobs.reworkNotesFromOwner")}</p>
              <p className="text-sm text-orange-700 mt-1">{job.form.ownerNotes}</p>
            </div>
          </div>
        )}

        {/* Toast notification */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
              toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Acceptance status */}
        {acceptance !== "pending" && (
          <div className={`card text-center text-sm font-medium py-3 ${
            acceptance === "accepted" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
          }`}>
            {acceptance === "accepted" ? t("jobs.youAcceptedJob") : t("jobs.youDeniedJob")}
          </div>
        )}

        {/* Action buttons */}
        <div className="card space-y-3">
          {canAccept && (
            <div className="flex gap-3">
              <button
                disabled={accepting}
                onClick={async () => {
                  if (!user) return;
                  setAccepting(true);
                  try {
                    await acceptJob({ jobId: job._id, userId: user._id });
                    setToast({ message: t("jobs.jobAccepted"), type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  } catch (err: any) {
                    setToast({ message: err.message ?? t("common.failedToAccept"), type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setAccepting(false);
                  }
                }}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> {accepting ? t("jobs.accepting") : t("jobs.acceptJob")}
              </button>
              <button
                onClick={() => setShowDeny(true)}
                className="btn-danger flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> {t("jobs.deny")}
              </button>
            </div>
          )}

          {canArrive && !canAccept && (
            <button
              onClick={async () => { await arriveJob({ jobId: job._id, userId: user!._id }); }}
              className="btn-secondary w-full flex items-center justify-center gap-2 py-3"
            >
              <MapPinCheck className="w-5 h-5" /> {t("jobs.iveArrived")}
            </button>
          )}

          {canCleanerCancel && (
            <button
              onClick={() => setShowCleanerCancel(true)}
              className="btn-danger w-full flex items-center justify-center gap-2 py-2 text-sm"
            >
              <XCircle className="w-4 h-4" /> {t("jobs.cancelJobCleaner")}
            </button>
          )}

          {canStart && (
            <button
              onClick={handleStartJob}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg"
            >
              <Play className="w-5 h-5" /> {t("jobs.startCleaning")}
            </button>
          )}

          {isInProgress && hasForm && (
            <Link href={`/jobs/${job._id}/form`} className="btn-secondary w-full flex items-center justify-center gap-2 py-3 text-lg">
              <ClipboardCheck className="w-5 h-5" /> {t("jobs.continueChecklist")}
            </Link>
          )}

          {isInProgress && (
            <button
              onClick={() => setShowComplete(true)}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg"
            >
              <CheckCircle className="w-5 h-5" /> {t("jobs.completeCleaning")}
            </button>
          )}

          {job.status === "rework_requested" && (
            <div className="text-center text-sm text-red-600 font-medium py-2">
              {t("jobs.reworkRedoMsg")}
            </div>
          )}

          {job.status === "submitted" && (
            <div className="text-center text-sm text-gray-500 py-2">
              {t("jobs.waitingForReview")}
            </div>
          )}

          {job.status === "approved" && (
            <div className="text-center text-sm text-green-600 font-medium py-2">
              {t("jobs.jobApprovedCleaner")}
            </div>
          )}
        </div>

        {/* Inventory checklist */}
        {(isInProgress || job.status === "submitted" || job.status === "approved") && job.inventoryChecklist && job.inventoryChecklist.length > 0 && (
          <InventoryChecklistSection
            checklist={job.inventoryChecklist}
            jobId={job._id}
            userId={user!._id}
            updateItem={updateChecklistItem}
            editable={isInProgress || job.status === "rework_requested"}
          />
        )}
      </div>

      {/* Deny dialog */}
      {showDeny && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t("jobs.denyJob")}</h3>
            <textarea
              className="input-field mb-4"
              rows={3}
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder={t("jobs.denyReasonPlaceholder")}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeny(false)} className="btn-secondary">{t("common.cancel")}</button>
              <button
                disabled={denying}
                onClick={async () => {
                  if (!user) return;
                  setDenying(true);
                  try {
                    await denyJob({ jobId: job._id, reason: denyReason || undefined, userId: user._id });
                    setShowDeny(false);
                    setToast({ message: t("jobs.jobDenied"), type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  } catch (err: any) {
                    setToast({ message: err.message ?? t("common.failedToDeny"), type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setDenying(false);
                  }
                }}
                className="btn-danger"
              >
                {denying ? t("jobs.denying") : t("jobs.denyJob")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cleaner cancel dialog */}
      {showCleanerCancel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t("jobs.cancelJobCleaner")}</h3>
            <p className="text-sm text-gray-500 mb-3">{t("jobs.cancelJobCleanerConfirm")}</p>
            <textarea
              className="input-field mb-4"
              rows={3}
              value={cleanerCancelReason}
              onChange={(e) => setCleanerCancelReason(e.target.value)}
              placeholder={t("jobs.cancelReasonPlaceholder")}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCleanerCancel(false)} className="btn-secondary">{t("common.goBack")}</button>
              <button
                disabled={cleanerCancelling}
                onClick={async () => {
                  if (!user) return;
                  setCleanerCancelling(true);
                  try {
                    await cleanerCancelJob({ jobId: job._id, reason: cleanerCancelReason || undefined, userId: user._id });
                    setShowCleanerCancel(false);
                    setToast({ message: t("jobs.jobCancelled"), type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  } catch (err: any) {
                    setToast({ message: err.message ?? t("common.failedToCancel"), type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setCleanerCancelling(false);
                  }
                }}
                className="btn-danger"
              >
                {cleanerCancelling ? t("jobs.cancelling") : t("jobs.cancelJobCleaner")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete dialog */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t("jobs.completeCleanTitle")}</h3>
            <p className="text-sm text-gray-500 mb-3">{t("jobs.completeCleanDesc")}</p>
            <textarea
              className="input-field mb-4"
              rows={3}
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder={t("jobs.completeCleanPlaceholder")}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowComplete(false)} className="btn-secondary">{t("common.cancel")}</button>
              <button
                onClick={handleCompleteJob}
                disabled={completing}
                className="btn-primary flex items-center gap-2"
              >
                {completing && <LoadingSpinner size="sm" />}
                <Send className="w-4 h-4" /> {t("common.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inventory Checklist Section ────────────────────────────────────────

const STATUS_OPTIONS = ["ok", "low", "out", "restocked"] as const;

const STATUS_STYLES: Record<string, string> = {
  ok: "bg-green-100 text-green-700 border-green-300",
  low: "bg-yellow-100 text-yellow-700 border-yellow-300",
  out: "bg-red-100 text-red-700 border-red-300",
  restocked: "bg-blue-100 text-blue-700 border-blue-300",
};

function InventoryChecklistSection({
  checklist,
  jobId,
  userId,
  updateItem,
  editable,
}: {
  checklist: any[];
  jobId: Id<"jobs">;
  userId: Id<"users">;
  updateItem: any;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const reported = checklist.filter((i) => i.status).length;

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const item of checklist) {
    const cat = item.category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const handleStatusChange = async (itemName: string, status: string, reportedQty?: number, note?: string) => {
    setSaving(itemName);
    try {
      await updateItem({
        jobId,
        userId,
        itemName,
        status,
        ...(reportedQty !== undefined ? { reportedQty } : {}),
        ...(note !== undefined ? { note } : {}),
      });
    } catch {
      // handled by convex
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-gray-900">{t("jobs.inventoryChecklist")}</h3>
          <span className="text-xs text-gray-400">
            {t("jobs.itemsReported", { reported, total: checklist.length })}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {INVENTORY_CATEGORIES.filter((cat) => grouped[cat]?.length).map((cat) => (
            <div key={cat}>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {t(`properties.inventory.categories.${cat}`, INVENTORY_CATEGORY_LABELS[cat])}
              </h4>
              <div className="space-y-1.5">
                {grouped[cat].map((item: any) => (
                  <InventoryChecklistItem
                    key={item.name}
                    item={item}
                    editable={editable}
                    saving={saving === item.name}
                    isExpanded={expandedItem === item.name}
                    onToggleExpand={() => setExpandedItem(expandedItem === item.name ? null : item.name)}
                    onStatusChange={(status) => handleStatusChange(item.name, status)}
                    onDetailSave={(qty, note) => handleStatusChange(item.name, item.status || "ok", qty, note)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InventoryChecklistItem({
  item,
  editable,
  saving,
  isExpanded,
  onToggleExpand,
  onStatusChange,
  onDetailSave,
}: {
  item: any;
  editable: boolean;
  saving: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (status: string) => void;
  onDetailSave: (qty?: number, note?: string) => void;
}) {
  const { t } = useTranslation();
  const [qty, setQty] = useState<string>(item.reportedQty?.toString() ?? "");
  const [note, setNote] = useState(item.note ?? "");

  return (
    <div className={`rounded-lg border p-2.5 ${item.status ? STATUS_STYLES[item.status] || "bg-gray-50 border-gray-200" : "bg-gray-50 border-gray-200"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1" onClick={onToggleExpand}>
          <span className="text-sm font-medium truncate">{item.name}</span>
          {item.required && (
            <span className="text-[10px] font-semibold text-red-600">*</span>
          )}
          <span className="text-[10px] text-gray-400 flex-shrink-0">
            par:{item.parLevel}
          </span>
        </div>
        {editable ? (
          <div className="flex gap-1 flex-shrink-0">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                disabled={saving}
                onClick={() => onStatusChange(s)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors ${
                  item.status === s
                    ? STATUS_STYLES[s]
                    : "bg-white border-gray-200 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {t(`jobs.status${s.charAt(0).toUpperCase() + s.slice(1)}`)}
              </button>
            ))}
          </div>
        ) : (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            item.status ? STATUS_STYLES[item.status] : "bg-gray-100 text-gray-500"
          }`}>
            {item.status ? t(`jobs.status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`) : t("jobs.statusNotReported")}
          </span>
        )}
      </div>

      {/* Expandable detail row for qty + note */}
      {isExpanded && editable && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-gray-500">{t("jobs.reportQty")}</label>
            <input
              type="number"
              className="input-field text-xs w-14 py-0.5 px-1.5"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              min={0}
              placeholder="—"
            />
          </div>
          <input
            className="input-field text-xs flex-1 py-0.5 px-1.5 min-w-[100px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("jobs.itemNote")}
          />
          <button
            disabled={saving}
            onClick={() => onDetailSave(
              qty ? Number(qty) : undefined,
              note || undefined
            )}
            className="btn-primary text-[11px] py-0.5 px-2"
          >
            {saving ? "..." : t("common.save")}
          </button>
        </div>
      )}

      {/* Show note read-only when not expanded but note exists */}
      {!isExpanded && item.note && (
        <p className="text-[11px] text-gray-500 mt-1 truncate">{item.note}</p>
      )}
    </div>
  );
}
