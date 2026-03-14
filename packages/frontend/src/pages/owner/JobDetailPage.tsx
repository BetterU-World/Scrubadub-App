import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { toFriendlyMessage } from "@/lib/friendlyError";
import { requireUserId } from "@/lib/requireUserId";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useParams, Link } from "wouter";
import { JobTimeline } from "@/components/JobTimeline";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Flag,
  Pencil,
  XCircle,
  CheckCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Share2,
  Package,
  AlertTriangle,
  DollarSign,
  CreditCard,
  ImagePlus,
  Play,
} from "lucide-react";
import { useTranslation } from "react-i18next";

export function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const job = useQuery(api.queries.jobs.get,
    user ? { jobId: params.id as Id<"jobs">, userId: user._id } : "skip"
  );
  const formItems = useQuery(
    api.queries.forms.getItems,
    job?.form && user ? { formId: job.form._id, userId: user._id } : "skip"
  );

  const cancelJob = useMutation(api.mutations.jobs.cancel);
  const approveForm = useMutation(api.mutations.forms.approve);
  const requestFormRework = useMutation(api.mutations.forms.requestRework);
  const reassignJob = useMutation(api.mutations.jobs.reassignJob);
  const shareJobMut = useMutation(api.mutations.partners.shareJob);

  const cleaners = useQuery(
    api.queries.employees.getCleaners,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const cleanerAvailability = useQuery(
    api.queries.availability.listCleanersWithAvailability,
    user && job?.scheduledDate
      ? { userId: user._id, date: job.scheduledDate }
      : "skip"
  );
  const connections = useQuery(
    api.queries.partners.listConnections,
    user ? { userId: user._id } : "skip"
  );
  const sharedStatus = useQuery(
    api.queries.partners.getSharedJobStatus,
    user && job ? { jobId: params.id as Id<"jobs">, userId: user._id } : "skip"
  );
  const incomingShared = useQuery(
    api.queries.partners.getIncomingSharedStatus,
    user && job && (job as any).sharedFromJobId
      ? { copiedJobId: params.id as Id<"jobs">, userId: user._id }
      : "skip"
  );

  const acceptSharedJobMut = useMutation(api.mutations.partners.acceptSharedJob);
  const rejectSharedJobMut = useMutation(api.mutations.partners.rejectSharedJob);

  // Manager inspections
  const inspections = useQuery(
    api.queries.inspections.getByJob,
    user && job ? { jobId: params.id as Id<"jobs">, userId: user._id } : "skip"
  );
  const inspectionSummary = useQuery(
    api.queries.inspections.getSummary,
    user && job ? { jobId: params.id as Id<"jobs">, userId: user._id } : "skip"
  );
  const reopenInspection = useMutation(api.mutations.inspections.reopenInspection);

  // Cleaner payments
  const cleanerPaymentData = useQuery(
    api.queries.cleanerPayments.getCleanerPaymentForJob,
    user && job ? { userId: user._id, jobId: params.id as Id<"jobs"> } : "skip"
  );
  const createCleanerPayment = useMutation(api.mutations.cleanerPayments.createCleanerPayment);
  const markCleanerPaidOutside = useMutation(api.mutations.cleanerPayments.markCleanerPaidOutside);
  const createCleanerPaymentCheckout = useAction(api.actions.cleanerPayments.createCleanerPaymentCheckout);
  const updatePlannedCleanerPay = useMutation(api.mutations.jobs.updatePlannedCleanerPay);
  const sendStripeConnectInviteMut = useMutation(api.mutations.cleanerPayments.sendStripeConnectInvite);

  // Settlements
  const settlement = useQuery(
    api.queries.settlements.getSettlementForJob,
    user && job && !job.sharedFromJobId ? { userId: user._id, originalJobId: params.id as Id<"jobs"> } : "skip"
  );
  const upsertSettlement = useMutation(api.mutations.settlements.upsertSettlementForSharedJob);
  const markSettlementPaid = useMutation(api.mutations.settlements.markSettlementPaid);
  const createSettlementCheckout = useAction(api.actions.settlements.createSettlementPayCheckout);

  // Owner self-execution mutations
  const ownerStartJobMut = useMutation(api.mutations.jobs.ownerStartJob);
  const ownerCompleteJobMut = useMutation(api.mutations.jobs.ownerCompleteJob);
  const ownerSubmitInspectionMut = useMutation(api.mutations.jobs.ownerSubmitInspection);

  const [showCancel, setShowCancel] = useState(false);
  const [showRework, setShowRework] = useState(false);
  const [reworkNotes, setReworkNotes] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [approving, setApproving] = useState(false);
  const [expandForm, setExpandForm] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [reassignCleanerId, setReassignCleanerId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [shareToCompany, setShareToCompany] = useState("");
  const [sharePackage, setSharePackage] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [expandPackage, setExpandPackage] = useState(false);
  const [sharedJobAction, setSharedJobAction] = useState(false);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [settlementPayMethod, setSettlementPayMethod] = useState("");
  const [showSettlementPay, setShowSettlementPay] = useState(false);
  const [stripePayLoading, setStripePayLoading] = useState(false);
  const [cleanerPayAmount, setCleanerPayAmount] = useState("");
  const [cleanerPayAmountInit, setCleanerPayAmountInit] = useState(false);
  const [cleanerPaySaving, setCleanerPaySaving] = useState(false);
  const [cleanerStripeLoading, setCleanerStripeLoading] = useState(false);
  const [plannedPaySaving, setPlannedPaySaving] = useState(false);
  const [editingPlannedPay, setEditingPlannedPay] = useState(false);
  const [showConnectStripeModal, setShowConnectStripeModal] = useState(false);
  const [connectStripeLoading, setConnectStripeLoading] = useState(false);
  // Owner self-execution state
  const [ownerInspScore, setOwnerInspScore] = useState(7);
  const [ownerInspSeverity, setOwnerInspSeverity] = useState("none");
  const [ownerInspNotes, setOwnerInspNotes] = useState("");
  const [ownerInspSubmitting, setOwnerInspSubmitting] = useState(false);
  const [ownerInspectionSubmitted, setOwnerInspectionSubmitted] = useState(false);

  // Read flash toast from sessionStorage (set by JobFormPage)
  useEffect(() => {
    const msg = sessionStorage.getItem("scrubadub_toast");
    if (msg) {
      sessionStorage.removeItem("scrubadub_toast");
      setToast({ message: msg, type: "success" });
      setTimeout(() => setToast(null), 3000);
    }
  }, []);

  // Pre-fill cleaner pay amount from planned pay
  useEffect(() => {
    if (job && !cleanerPayAmountInit && (job as any).plannedCleanerPayCents) {
      setCleanerPayAmount(((job as any).plannedCleanerPayCents / 100).toFixed(2));
      setCleanerPayAmountInit(true);
    }
  }, [job, cleanerPayAmountInit]);

  if (job === undefined) return <PageLoader />;
  if (job === null) return <div className="text-center py-12 text-gray-500">{t("jobs.jobNotFound")}</div>;

  const canReview = job.status === "submitted";
  const canCancel = ["scheduled", "confirmed"].includes(job.status);

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={job.property?.name ?? (job as any).propertySnapshot?.name ?? t("jobs.jobDetails")}
        action={
          <div className="flex gap-2">
            {!job.sharedFromJobId && canCancel && (
              <button onClick={() => setShowShare(true)} className="btn-secondary flex items-center gap-2">
                <Share2 className="w-4 h-4" /> {t("jobs.shareJob")}
              </button>
            )}
            {job.status !== "cancelled" && ((job as any).acceptanceStatus === "denied" || (job as any).acceptanceStatus === "pending" || (job.sharedFromJobId && job.cleanerIds.length === 0)) && (
              <button onClick={() => setShowReassign(true)} className="btn-secondary flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> {job.sharedFromJobId && job.cleanerIds.length === 0 ? t("jobs.assignCleaner") : t("jobs.reassign")}
              </button>
            )}
            {canCancel && (
              <>
                <Link href={`/jobs/${job._id}/edit`} className="btn-secondary flex items-center gap-2">
                  <Pencil className="w-4 h-4" /> {t("common.edit")}
                </Link>
                <button onClick={() => setShowCancel(true)} className="btn-danger flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> {t("common.cancel")}
                </button>
              </>
            )}
          </div>
        }
      />

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="space-y-6">
        {/* Job info card */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={job.status} />
            {(job as any).acceptanceStatus && (
              <StatusBadge status={(job as any).acceptanceStatus} />
            )}
            <span className="text-sm text-gray-500 capitalize">{t(`jobTypes.${job.type}`, job.type.replace(/_/g, " "))}</span>
            {/* Inspection state badge */}
            {inspectionSummary && inspectionSummary.count > 0 && (
              <span className={`badge text-[10px] ${
                inspectionSummary.inspectionCycleOpen
                  ? "bg-amber-100 text-amber-700"
                  : "bg-blue-100 text-blue-700"
              }`}>
                {inspectionSummary.inspectionCycleOpen
                  ? t("jobs.reinspectionRequested")
                  : t("jobs.inspectionSubmitted")}
              </span>
            )}
            {inspectionSummary && inspectionSummary.count === 0 && (
              <span className="badge bg-gray-100 text-gray-500 text-[10px]">
                {t("jobs.notInspected")}
              </span>
            )}
            {job.reworkCount > 0 && (
              <span className="badge bg-orange-100 text-orange-700">{t("jobs.reworkNum", { count: job.reworkCount })}</span>
            )}
            {(job as any).sharedFromCompanyName && (
              <span className="badge bg-blue-100 text-blue-700">{t("jobs.sharedFrom", { name: (job as any).sharedFromCompanyName })}</span>
            )}
          </div>

          {(job as any).acceptanceStatus === "denied" && (job as any).denyReason && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm font-medium text-red-800">{t("jobs.denyReason")}</p>
              <p className="text-sm text-red-700 mt-1">{(job as any).denyReason}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" /> {job.scheduledDate}
              {job.startTime && ` at ${job.startTime}`}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" /> {job.durationMinutes} {t("common.minutes")}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400" /> {job.property?.address ?? (job as any).propertySnapshot?.address}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Users className="w-4 h-4 text-gray-400" />
              {(job.cleaners as any[]).map((c: any) => c.name).join(", ") || t("common.unassigned")}
            </div>
          </div>

          {/* Assigned Manager */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-medium text-gray-500">{t("jobs.assignedManager")}:</span>
            {(job as any).assignedManagerName ?? t("jobs.noManagerAssigned")}
          </div>

          {job.notes && <p className="text-sm text-gray-600 border-t pt-3">{job.notes}</p>}
        </div>

        <JobTimeline job={job as any} />

        {/* Owner2: shared job accept/reject banner */}
        {incomingShared && incomingShared.status === "pending" && (
          <div className="card border-blue-200 bg-blue-50/50">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-blue-800 flex items-center gap-2">
                  <Share2 className="w-5 h-5" /> {t("jobs.sharedJobFrom", { name: incomingShared.fromCompanyName })}
                </h3>
                <p className="text-sm text-blue-600 mt-1">
                  {t("jobs.sharedJobAcceptDesc")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={sharedJobAction}
                  onClick={async () => {
                    const uid = requireUserId(user);
                    if (!uid) return;
                    setSharedJobAction(true);
                    try {
                      await acceptSharedJobMut({ userId: uid, sharedJobId: incomingShared._id });
                      setToast({ message: t("jobs.sharedJobAccepted"), type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? t("common.failed"), type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setSharedJobAction(false);
                    }
                  }}
                  className="btn-primary flex items-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" /> {t("jobs.accept")}
                </button>
                <button
                  disabled={sharedJobAction}
                  onClick={async () => {
                    const uid = requireUserId(user);
                    if (!uid) return;
                    setSharedJobAction(true);
                    try {
                      await rejectSharedJobMut({ userId: uid, sharedJobId: incomingShared._id });
                      setToast({ message: t("jobs.sharedJobRejected"), type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? t("common.failed"), type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setSharedJobAction(false);
                    }
                  }}
                  className="btn-secondary flex items-center gap-1 text-red-600 border-red-200 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4" /> {t("jobs.reject")}
                </button>
              </div>
            </div>
          </div>
        )}

        {incomingShared && incomingShared.status === "rejected" && (
          <div className="card border-red-200 bg-red-50/50">
            <p className="text-sm font-medium text-red-700">
              {t("jobs.sharedJobRejectedDesc")}
            </p>
          </div>
        )}

        {incomingShared && incomingShared.status === "accepted" && (
          <div className="card border-green-200 bg-green-50/50">
            <p className="text-sm font-medium text-green-700">
              {t("jobs.sharedJobAcceptedDesc", { name: incomingShared.fromCompanyName })}
            </p>
          </div>
        )}

        {/* Red flags section - shown FIRST for review */}
        {job.redFlags.length > 0 && (
          <div className="card border-red-200">
            <h3 className="font-semibold text-red-700 flex items-center gap-2 mb-4">
              <Flag className="w-5 h-5" /> {t("jobs.redFlags")} ({job.redFlags.length})
            </h3>
            <div className="space-y-3">
              {job.redFlags.map((flag) => (
                <div key={flag._id} className="p-3 rounded-lg bg-red-50 border border-red-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge bg-red-200 text-red-800 capitalize">{flag.severity}</span>
                    <span className="text-sm font-medium capitalize">{flag.category}</span>
                    <StatusBadge status={flag.status} />
                  </div>
                  <p className="text-sm text-gray-700">{flag.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manager Inspections */}
        {inspections && inspections.length > 0 && (
          <div className="card border-blue-200">
            <h3 className="font-semibold text-blue-700 flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5" /> {t("inspection.managerInspections")} ({inspections.length})
            </h3>
            {inspectionSummary && inspectionSummary.latestScore !== null && (
              <div className="flex items-center gap-3 mb-4 p-2 bg-blue-50 rounded-lg flex-wrap">
                <span className="text-sm text-blue-700">
                  {t("inspection.latestScore")}: <span className="font-bold">{inspectionSummary.latestScore}/10</span>
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  inspectionSummary.latestSeverity === "critical" ? "bg-red-100 text-red-700" :
                  inspectionSummary.latestSeverity === "high" ? "bg-orange-100 text-orange-700" :
                  inspectionSummary.latestSeverity === "medium" ? "bg-yellow-100 text-yellow-700" :
                  inspectionSummary.latestSeverity === "low" ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  <Flag className="w-3 h-3" />
                  {t(`severity.${inspectionSummary.latestSeverity}`)}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(inspectionSummary.latestDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {/* Re-Inspection CTA: visible when cycle is closed and inspections exist */}
            {inspectionSummary && !inspectionSummary.inspectionCycleOpen && inspectionSummary.count > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-3">
                <span className="text-sm text-amber-800">{t("inspection.cycleClosed")}</span>
                <button
                  onClick={async () => {
                    try {
                      await reopenInspection({ jobId: params.id as Id<"jobs">, userId: user!._id });
                      setToast({ message: t("jobs.reinspectionRequested"), type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? t("common.failed"), type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    }
                  }}
                  className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> {t("inspection.requestReinspection")}
                </button>
              </div>
            )}
            <div className="space-y-3">
              {inspections.map((ins: any) => (
                <div key={ins._id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{ins.managerName}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        ins.severity === "critical" ? "bg-red-100 text-red-700" :
                        ins.severity === "high" ? "bg-orange-100 text-orange-700" :
                        ins.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                        ins.severity === "low" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        <Flag className="w-3 h-3" />
                        {t(`severity.${ins.severity}`)}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-blue-700">{ins.readinessScore}/10</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    {new Date(ins.createdAt).toLocaleString()}
                  </p>
                  {ins.notes && <p className="text-sm text-gray-600 mb-2">{ins.notes}</p>}
                  {ins.issues && ins.issues.length > 0 && (
                    <ul className="space-y-1 mb-2">
                      {ins.issues.map((issue: string, idx: number) => (
                        <li key={idx} className="text-sm text-gray-600 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                  {ins.photoUrls && ins.photoUrls.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {ins.photoUrls.map((url: string, i: number) => (
                        <img key={i} src={url} alt={`Inspection photo ${i + 1}`} className="w-full h-20 object-cover rounded-lg border" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form review section */}
        {job.form && (
          <div className="card">
            <button
              onClick={() => setExpandForm(!expandForm)}
              className="flex items-center justify-between w-full"
            >
              <h3 className="font-semibold text-gray-900">{t("jobs.cleaningForm")}</h3>
              {expandForm ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {job.form.cleanerScore !== undefined && (
              <p className="text-sm text-gray-500 mt-1">{t("jobs.selfScore", { score: job.form.cleanerScore })}</p>
            )}

            {expandForm && formItems && (
              <div className="mt-4 space-y-4">
                {Object.entries(
                  formItems.reduce<Record<string, typeof formItems>>((acc, item) => {
                    (acc[item.section] = acc[item.section] || []).push(item);
                    return acc;
                  }, {})
                ).map(([section, items]) => (
                  <div key={section}>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">{section}</h4>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <div key={item._id} className={`flex items-center gap-2 text-sm py-1 ${item.isRedFlag ? "text-red-600" : ""}`}>
                          <span>{item.completed ? "\u2713" : "\u25CB"}</span>
                          <span className={item.completed ? "text-gray-700" : "text-gray-400"}>
                            {item.itemName}
                          </span>
                          {item.isRedFlag && <Flag className="w-3 h-3 text-red-500" />}
                          {item.note && <span className="text-xs text-gray-400">— {item.note}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Photos section */}
            {(job.form as any).photoUrls && (job.form as any).photoUrls.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                  <ImagePlus className="w-4 h-4 text-gray-400" /> {t("jobs.photos")} ({(job.form as any).photoUrls.length})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(job.form as any).photoUrls.map((url: string, idx: number) => (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={`${t("jobs.photo")} ${idx + 1}`}
                        className="w-full h-32 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {((job.form as any).maintenanceCost != null || (job.form as any).maintenanceVendor) && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-1">{t("jobs.maintenanceDetails")}</p>
                <div className="flex gap-6 text-sm text-gray-600">
                  {(job.form as any).maintenanceCost != null && (
                    <span>{t("jobs.cost")}: <span className="font-medium">${(job.form as any).maintenanceCost.toFixed(2)}</span></span>
                  )}
                  {(job.form as any).maintenanceVendor && (
                    <span>{t("jobs.vendor")}: <span className="font-medium">{(job.form as any).maintenanceVendor}</span></span>
                  )}
                </div>
              </div>
            )}

            {job.form.ownerNotes && (
              <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm font-medium text-yellow-800">{t("jobs.reviewNotes")}</p>
                <p className="text-sm text-yellow-700">{job.form.ownerNotes}</p>
              </div>
            )}
          </div>
        )}

        {/* Review actions */}
        {canReview && (
          <div className="card border-primary-200 bg-primary-50/30">
            <h3 className="font-semibold text-gray-900 mb-4">{t("jobs.reviewSubmission")}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.notesOptional")}</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder={t("jobs.feedbackPlaceholder")}
                />
              </div>
              <div className="flex gap-3">
                <button
                  disabled={approving}
                  onClick={async () => {
                    const uid = requireUserId(user);
                    if (!uid || !job.form) return;
                    setApproving(true);
                    try {
                      await approveForm({ formId: job.form._id, notes: approveNotes || undefined, userId: uid });
                      setToast({ message: t("jobs.jobApproved"), type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? t("common.failedToApprove"), type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setApproving(false);
                    }
                  }}
                  className="btn-primary flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" /> {approving ? t("jobs.approving") : t("jobs.approve")}
                </button>
                {job.reworkCount < 2 && (
                  <button
                    onClick={() => setShowRework(true)}
                    className="btn-secondary flex items-center gap-2 text-orange-600 border-orange-300 hover:bg-orange-50"
                  >
                    <RotateCcw className="w-4 h-4" /> {t("jobs.requestRework")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cleaner Payment panel — Owner view */}
        {user?.role === "owner" && cleanerPaymentData && cleanerPaymentData.cleanerUserId && (() => {
          const { payment, cleanerName, cleanerStripeAccountId } = cleanerPaymentData;
          const isPaid = payment?.status === "PAID";
          const isCheckoutInProgress = payment?.status === "OPEN" && payment?.amountCents != null && payment?.method != null;
          const isEligible = ["submitted", "approved"].includes(job.status);
          const isRejectedOrCancelled = job.status === "cancelled" || job.status === "denied" || (job as any).acceptanceStatus === "denied";

          return (
            <div className="card border-emerald-200">
              <h3 className="font-semibold text-emerald-700 flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5" /> {t("jobs.cleanerPayment")}
              </h3>

              {isRejectedOrCancelled && !isPaid ? (
                /* Rejected or cancelled — no payment actions */
                <div className="flex items-center gap-2 py-2">
                  <AlertTriangle className="w-4 h-4 text-gray-400" />
                  <p className="text-sm text-gray-500">
                    {job.status === "cancelled"
                      ? t("jobs.paymentsUnavailableCancelled")
                      : t("jobs.paymentsUnavailableRejected")}
                  </p>
                </div>
              ) : isPaid ? (
                /* Already paid */
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">{t("jobs.paidTo", { name: cleanerName })}</p>
                      <p className="text-xl font-bold text-gray-900">
                        ${((payment!.amountCents ?? 0) / 100).toFixed(2)}
                      </p>
                    </div>
                    <span className="badge bg-green-100 text-green-700">{t("status.paid")}</span>
                  </div>
                  {payment!.paidAt && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      {t("payments.paidOn")} {new Date(payment!.paidAt).toLocaleDateString()}
                      {payment!.method === "in_app" ? (
                        <span className="inline-flex items-center gap-1 ml-1">
                          <CreditCard className="w-3 h-3" /> {t("payments.viaScrub")}
                        </span>
                      ) : (
                        <span> — {t("payments.paidOutsideApp")}</span>
                      )}
                    </p>
                  )}
                </div>
              ) : isCheckoutInProgress ? (
                /* Checkout in progress */
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">{t("jobs.paymentTo", { name: cleanerName })}</p>
                      <p className="text-xl font-bold text-gray-900">
                        ${(payment!.amountCents! / 100).toFixed(2)}
                      </p>
                    </div>
                    <span className="badge bg-amber-100 text-amber-700">{t("jobs.checkoutStarted")}</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {t("jobs.checkoutDesc")}
                  </p>
                </div>
              ) : (
                /* Planned pay + pay actions (when eligible) */
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    {t("jobs.payWorker", { name: cleanerName })}
                  </p>

                  {/* Planned pay: saved state (non-eligible, has amount, not editing) */}
                  {!isEligible && (job as any).plannedCleanerPayCents && !editingPlannedPay ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.plannedPay")}</label>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 max-w-xs">
                          <DollarSign className="w-4 h-4" />
                          <span className="font-medium text-gray-700">
                            {((job as any).plannedCleanerPayCents / 100).toFixed(2)}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> {t("jobs.saved")}
                        </span>
                        <button
                          onClick={() => {
                            setEditingPlannedPay(true);
                            setCleanerPayAmount(((job as any).plannedCleanerPayCents / 100).toFixed(2));
                          }}
                          className="btn-secondary text-xs flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" /> {t("jobs.change")}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {t("jobs.paymentAfterSubmit")}
                      </p>
                    </div>
                  ) : (
                    /* Editable amount input (when eligible, or planned pay not set, or editing) */
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {isEligible ? t("jobs.amount") : t("jobs.plannedPay")}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          className="input-field max-w-xs"
                          placeholder="0.00"
                          value={cleanerPayAmount}
                          onChange={(e) => setCleanerPayAmount(e.target.value)}
                        />
                        {!isEligible && (
                          <button
                            disabled={plannedPaySaving || !cleanerPayAmount || Number(cleanerPayAmount) < 1}
                            onClick={async () => {
                              const uid = requireUserId(user);
                              if (!uid) return;
                              setPlannedPaySaving(true);
                              try {
                                const amountCents = Math.round(Number(cleanerPayAmount) * 100);
                                await updatePlannedCleanerPay({
                                  userId: uid,
                                  jobId: params.id as Id<"jobs">,
                                  amountCents,
                                });
                                setEditingPlannedPay(false);
                                setToast({ message: t("jobs.saved"), type: "success" });
                                setTimeout(() => setToast(null), 3000);
                              } catch (err: any) {
                                setToast({ message: err.message ?? t("common.failedToSave"), type: "error" });
                                setTimeout(() => setToast(null), 4000);
                              } finally {
                                setPlannedPaySaving(false);
                              }
                            }}
                            className="btn-secondary text-sm"
                          >
                            {plannedPaySaving ? t("common.saving") : t("common.save")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {isEligible ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {cleanerStripeAccountId ? (
                        <button
                          disabled={cleanerStripeLoading || cleanerPaySaving || !cleanerPayAmount || Number(cleanerPayAmount) < 1}
                          onClick={async () => {
                            const uid = requireUserId(user);
                            if (!uid) return;
                            setCleanerStripeLoading(true);
                            try {
                              const amountCents = Math.round(Number(cleanerPayAmount) * 100);
                              // Also persist as planned pay
                              await updatePlannedCleanerPay({
                                userId: uid,
                                jobId: params.id as Id<"jobs">,
                                amountCents,
                              });
                              const paymentId = await createCleanerPayment({
                                userId: uid,
                                jobId: params.id as Id<"jobs">,
                                amountCents,
                              });
                              const result = await createCleanerPaymentCheckout({
                                userId: uid,
                                cleanerPaymentId: paymentId,
                              });
                              if (result?.url) window.location.href = result.url;
                            } catch (err: any) {
                              console.error("Checkout error:", err);
                              setToast({ message: toFriendlyMessage(err, t("common.paymentDidNotGoThrough")), type: "error" });
                              setTimeout(() => setToast(null), 5000);
                            } finally {
                              setCleanerStripeLoading(false);
                            }
                          }}
                          className="btn-primary text-sm flex items-center gap-1"
                        >
                          <CreditCard className="w-4 h-4" />
                          {cleanerStripeLoading ? t("common.loading") : t("jobs.payViaScrub")}
                        </button>
                      ) : (
                        <button
                          disabled={!cleanerPaymentData?.cleanerEmail}
                          onClick={() => setShowConnectStripeModal(true)}
                          className="btn-primary text-sm flex items-center gap-1"
                          title={!cleanerPaymentData?.cleanerEmail ? t("jobs.connectCleanerNoEmail") : undefined}
                        >
                          <CreditCard className="w-4 h-4" />
                          {t("jobs.connectCleanerToStripe")}
                        </button>
                      )}
                      <button
                        disabled={cleanerPaySaving || cleanerStripeLoading || !cleanerPayAmount || Number(cleanerPayAmount) < 1}
                        onClick={async () => {
                          const uid = requireUserId(user);
                          if (!uid) return;
                          setCleanerPaySaving(true);
                          try {
                            const amountCents = Math.round(Number(cleanerPayAmount) * 100);
                            await updatePlannedCleanerPay({
                              userId: uid,
                              jobId: params.id as Id<"jobs">,
                              amountCents,
                            });
                            await markCleanerPaidOutside({
                              userId: uid,
                              jobId: params.id as Id<"jobs">,
                              amountCents,
                            });
                            setToast({ message: t("jobs.cleanerMarkedPaid"), type: "success" });
                            setTimeout(() => setToast(null), 3000);
                          } catch (err: any) {
                            setToast({ message: toFriendlyMessage(err, t("common.failedToRecordPayment")), type: "error" });
                            setTimeout(() => setToast(null), 4000);
                          } finally {
                            setCleanerPaySaving(false);
                          }
                        }}
                        className="btn-secondary text-sm flex items-center gap-1"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {cleanerPaySaving ? t("common.saving") : t("jobs.markPaidOutside")}
                      </button>
                    </div>
                  ) : !((job as any).plannedCleanerPayCents && !editingPlannedPay) ? (
                    <p className="text-xs text-gray-400">
                      {t("jobs.paymentAfterSubmit")}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          );
        })()}

        {/* Cleaner Payment panel — Cleaner view (read-only planned pay) */}
        {user?.role !== "owner" && job.cleanerIds?.includes(user?._id as any) && (
          <div className="card border-emerald-200">
            <h3 className="font-semibold text-emerald-700 flex items-center gap-2 mb-3">
              <DollarSign className="w-5 h-5" /> {t("jobs.yourPay")}
            </h3>
            {(job as any).plannedCleanerPayCents ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{t("jobs.plannedPayForJob")}</p>
                  <p className="text-xl font-bold text-gray-900">
                    ${((job as any).plannedCleanerPayCents / 100).toFixed(2)}
                  </p>
                </div>
                <span className="badge bg-blue-100 text-blue-700">{t("status.planned")}</span>
              </div>
            ) : (
              <p className="text-sm text-gray-500">{t("jobs.paySetByManager")}</p>
            )}
          </div>
        )}

        {/* Shared job status (Owner1 view: shows who the job is shared to) */}
        {sharedStatus && sharedStatus.length > 0 && (
          <div className="card border-blue-200">
            <h3 className="font-semibold text-blue-700 flex items-center gap-2 mb-3">
              <Share2 className="w-5 h-5" /> {t("jobs.sharedJobStatus")}
            </h3>
            <div className="space-y-3">
              {sharedStatus.map((s) => (
                <div key={s._id} className={`p-3 rounded-lg border ${
                  s.status === "rejected"
                    ? "bg-red-50 border-red-200"
                    : "bg-blue-50 border-blue-100"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {s.status === "rejected"
                        ? <>
                            <AlertTriangle className="w-4 h-4 text-red-500 inline mr-1" />
                            {t("jobs.rejectedBy", { name: s.toCompanyName })}
                          </>
                        : <>{t("jobs.sharedTo", { name: s.toCompanyName })}</>
                      }
                    </span>
                    <span className={`badge ${
                      s.status === "completed" ? "bg-green-100 text-green-700" :
                      s.status === "in_progress" ? "bg-yellow-100 text-yellow-700" :
                      s.status === "accepted" ? "bg-blue-100 text-blue-700" :
                      s.status === "rejected" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {s.status === "completed" ? t("status.completed") :
                       s.status === "in_progress" ? t("status.inProgress") :
                       s.status === "accepted" ? t("status.accepted") :
                       s.status === "rejected" ? t("status.declined") : t("status.pending")}
                    </span>
                  </div>

                  {/* Rejected: timestamp + action panel */}
                  {s.status === "rejected" && (
                    <>
                      {s.respondedAt && (
                        <p className="text-xs text-red-500 mt-1">
                          {t("jobs.declinedOn")} {new Date(s.respondedAt).toLocaleString()}
                        </p>
                      )}
                      {job.status === "cancelled" ? (
                        <p className="text-sm text-gray-500 mt-2">
                          {t("jobs.cancelledNoReassign")}
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-red-600 mt-2">
                            {t("jobs.partnerDeclinedDesc")}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => setShowShare(true)}
                              className="btn-secondary flex items-center gap-1.5 text-sm"
                            >
                              <Share2 className="w-4 h-4" /> {t("jobs.shareToPartner")}
                            </button>
                            <button
                              onClick={() => setShowReassign(true)}
                              className="btn-primary flex items-center gap-1.5 text-sm"
                            >
                              <Users className="w-4 h-4" /> {t("jobs.assignToMyCleaner")}
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {s.completedAt && (
                    <p className="text-xs text-gray-500 mt-1">
                      Completed {new Date(s.completedAt).toLocaleString()}
                    </p>
                  )}

                  {/* Completion package */}
                  {s.sharePackage && s.status === "completed" && (
                    <div className="mt-2">
                      <button
                        onClick={() => setExpandPackage(!expandPackage)}
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <Package className="w-4 h-4" />
                        {expandPackage ? t("jobs.hidePackage") : t("jobs.viewPackage")} {t("jobs.completionPackage")}
                        {expandPackage ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {expandPackage && (
                        <div className="mt-2 p-3 bg-white rounded border border-blue-100 space-y-2">
                          {s.checklistSummary && (
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">{t("jobs.checklist")}:</span> {s.checklistSummary}
                            </p>
                          )}
                          {s.completionNotes && (
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">{t("jobs.completionNotes")}:</span> {s.completionNotes}
                            </p>
                          )}
                          {s.photoStorageIds && s.photoStorageIds.length > 0 ? (
                            <p className="text-sm text-gray-500">{t("jobs.photosShared", { count: s.photoStorageIds.length })}</p>
                          ) : (
                            <p className="text-sm text-gray-400">{t("jobs.noPhotosShared")}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {s.sharePackage && s.status !== "completed" && s.status !== "rejected" && (
                    <p className="text-xs text-gray-400 mt-1">{t("jobs.packageWhenDone")}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Partner Settlement card (Owner1 view: when job has an accepted/completed partner) */}
        {sharedStatus && sharedStatus.some((s) => s.status === "accepted" || s.status === "completed" || s.status === "in_progress") && (
          <div className="card border-amber-200">
            <h3 className="font-semibold text-amber-700 flex items-center gap-2 mb-3">
              <DollarSign className="w-5 h-5" /> {t("jobs.partnerSettlement")}
            </h3>

            {settlement === undefined ? (
              <p className="text-sm text-gray-400">Loading...</p>
            ) : settlement === null ? (
              /* No settlement yet — create */
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  {t("jobs.createSettlementDesc")}
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input-field max-w-xs"
                    placeholder="0.00"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                  />
                </div>
                <button
                  disabled={settlementSaving || !settlementAmount || Number(settlementAmount) <= 0}
                  onClick={async () => {
                    const uid = requireUserId(user);
                    const partner = sharedStatus!.find((s) => s.status === "accepted" || s.status === "completed" || s.status === "in_progress");
                    if (!uid || !partner) return;
                    setSettlementSaving(true);
                    try {
                      await upsertSettlement({
                        userId: uid,
                        originalJobId: params.id as Id<"jobs">,
                        toCompanyId: partner.toCompanyId,
                        amountCents: Math.round(Number(settlementAmount) * 100),
                      });
                      setToast({ message: t("jobs.settlementCreated"), type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? t("common.failed"), type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setSettlementSaving(false);
                    }
                  }}
                  className="btn-primary text-sm"
                >
                  {settlementSaving ? t("requests.creating") : t("jobs.createSettlement")}
                </button>
              </div>
            ) : settlement.status === "open" ? (
              /* Open settlement — show amount, update, mark paid */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{t("jobs.amountOwedTo", { name: settlement.toCompanyName })}</p>
                    <p className="text-xl font-bold text-gray-900">${(settlement.amountCents / 100).toFixed(2)}</p>
                  </div>
                  <span className="badge bg-amber-100 text-amber-700">Open</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input-field max-w-[120px] text-sm"
                    placeholder={(settlement.amountCents / 100).toFixed(2)}
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                  />
                  <button
                    disabled={settlementSaving || !settlementAmount || Number(settlementAmount) <= 0}
                    onClick={async () => {
                      const uid = requireUserId(user);
                      if (!uid) return;
                      setSettlementSaving(true);
                      try {
                        await upsertSettlement({
                          userId: uid,
                          originalJobId: params.id as Id<"jobs">,
                          toCompanyId: settlement.toCompanyId,
                          amountCents: Math.round(Number(settlementAmount) * 100),
                        });
                        setSettlementAmount("");
                        setToast({ message: t("jobs.amountUpdated"), type: "success" });
                        setTimeout(() => setToast(null), 3000);
                      } catch (err: any) {
                        setToast({ message: err.message ?? t("common.failed"), type: "error" });
                        setTimeout(() => setToast(null), 3000);
                      } finally {
                        setSettlementSaving(false);
                      }
                    }}
                    className="btn-secondary text-sm"
                  >
                    {t("common.update")}
                  </button>
                  <button
                    disabled={stripePayLoading}
                    onClick={async () => {
                      const uid = requireUserId(user);
                      if (!uid || !settlement) return;
                      setStripePayLoading(true);
                      try {
                        const result = await createSettlementCheckout({
                          userId: uid,
                          settlementId: settlement._id,
                        });
                        if (result?.url) window.location.href = result.url;
                      } catch (err: any) {
                        console.error("Checkout error:", err);
                        setToast({ message: toFriendlyMessage(err, t("common.paymentDidNotGoThrough")), type: "error" });
                        setTimeout(() => setToast(null), 5000);
                      } finally {
                        setStripePayLoading(false);
                      }
                    }}
                    className="btn-primary text-sm flex items-center gap-1"
                  >
                    <CreditCard className="w-4 h-4" />
                    {stripePayLoading ? t("common.loading") : t("jobs.payViaScrub")}
                  </button>
                  <button
                    onClick={() => setShowSettlementPay(true)}
                    className="btn-secondary text-sm flex items-center gap-1"
                  >
                    <CheckCircle className="w-4 h-4" /> {t("jobs.markPaid")}
                  </button>
                </div>
              </div>
            ) : (
              /* Paid settlement */
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{t("jobs.paidTo", { name: settlement.toCompanyName })}</p>
                    <p className="text-xl font-bold text-gray-900">${(settlement.amountCents / 100).toFixed(2)}</p>
                  </div>
                  <span className="badge bg-green-100 text-green-700">Paid</span>
                </div>
                {settlement.paidAt && (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    {t("payments.paidOn")} {new Date(settlement.paidAt).toLocaleDateString()}
                    {settlement.paidMethod === "scrubadub_stripe" ? (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <CreditCard className="w-3 h-3" /> via Scrubadub
                      </span>
                    ) : settlement.paidMethod ? (
                      <span> via {settlement.paidMethod}</span>
                    ) : null}
                  </p>
                )}
                {settlement.note && (
                  <p className="text-xs text-gray-500">Note: {settlement.note}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mark settlement paid dialog */}
        {showSettlementPay && settlement && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
              <h3 className="text-lg font-semibold mb-4">{t("jobs.markSettlementPaid")}</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.paymentMethod")}</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder={t("jobs.paymentMethodPlaceholder")}
                    value={settlementPayMethod}
                    onChange={(e) => setSettlementPayMethod(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => { setShowSettlementPay(false); setSettlementPayMethod(""); }} className="btn-secondary">{t("common.cancel")}</button>
                <button
                  disabled={settlementSaving}
                  onClick={async () => {
                    const uid = requireUserId(user);
                    if (!uid) return;
                    setSettlementSaving(true);
                    try {
                      await markSettlementPaid({
                        userId: uid,
                        settlementId: settlement._id,
                        paidMethod: settlementPayMethod || undefined,
                      });
                      setShowSettlementPay(false);
                      setSettlementPayMethod("");
                      setToast({ message: t("jobs.settlementPaid"), type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? t("common.failed"), type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setSettlementSaving(false);
                    }
                  }}
                  className="btn-primary"
                >
                  {settlementSaving ? t("common.saving") : t("jobs.confirmPaid")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Owner self-execution controls — only when owner is explicitly self-assigned */}
      {user?.role === "owner" && (job as any).assignedManagerId === user._id && (
        <div className="card border-primary-200 mt-6">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <CheckCircle className="w-5 h-5 text-primary-600" /> {t("jobs.ownerExecution")}
          </h3>
          <p className="text-xs text-gray-400 mb-4">{t("jobs.ownerExecutionDesc")}</p>

          {/* Clean workflow actions */}
          {job.type !== "maintenance" && (
            <div className="space-y-2 mb-4">
              <p className="text-sm font-medium text-gray-700">{t("jobs.cleanWorkflow")}</p>
              {(job.status === "scheduled" || job.status === "confirmed" || job.status === "rework_requested") && (
                <button
                  onClick={async () => {
                    const uid = requireUserId(user);
                    if (!uid) return;
                    try {
                      await ownerStartJobMut({ jobId: job._id, userId: uid });
                      setToast({ message: t("jobs.cleanStarted"), type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? t("common.failed"), type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    }
                  }}
                  className="btn-primary text-sm flex items-center gap-2"
                >
                  <Play className="w-4 h-4" /> {t("jobs.startClean")}
                </button>
              )}
              {job.status === "in_progress" && (
                <button
                  onClick={async () => {
                    const uid = requireUserId(user);
                    if (!uid) return;
                    try {
                      await ownerCompleteJobMut({ jobId: job._id, userId: uid });
                      setToast({ message: t("jobs.cleanCompleted"), type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? t("common.failed"), type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    }
                  }}
                  className="btn-primary text-sm flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" /> {t("jobs.completeClean")}
                </button>
              )}
              {job.status === "approved" && (
                <span className="text-sm text-green-600 font-medium">{t("jobs.cleanDone")}</span>
              )}
            </div>
          )}

          {/* House check / inspection actions */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">{t("jobs.houseCheckWorkflow")}</p>
            {!ownerInspectionSubmitted ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">{t("jobs.readinessScore")}:</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={ownerInspScore}
                    onChange={(e) => setOwnerInspScore(parseInt(e.target.value) || 1)}
                    className="input-field w-16 text-sm py-1"
                  />
                  <span className="text-xs text-gray-400">/10</span>
                </div>
                <div>
                  <select
                    value={ownerInspSeverity}
                    onChange={(e) => setOwnerInspSeverity(e.target.value)}
                    className="input-field text-sm py-1"
                  >
                    <option value="none">{t("jobs.noIssues")}</option>
                    <option value="low">{t("severity.low")}</option>
                    <option value="medium">{t("severity.medium")}</option>
                    <option value="high">{t("severity.high")}</option>
                    <option value="critical">{t("severity.critical")}</option>
                  </select>
                </div>
                <textarea
                  className="input-field text-sm"
                  rows={2}
                  value={ownerInspNotes}
                  onChange={(e) => setOwnerInspNotes(e.target.value)}
                  placeholder={t("jobs.inspectionNotesPlaceholder")}
                />
                <button
                  disabled={ownerInspSubmitting}
                  onClick={async () => {
                    const uid = requireUserId(user);
                    if (!uid) return;
                    setOwnerInspSubmitting(true);
                    try {
                      await ownerSubmitInspectionMut({
                        userId: uid,
                        jobId: job._id,
                        readinessScore: ownerInspScore,
                        severity: ownerInspSeverity as any,
                        notes: ownerInspNotes || undefined,
                      });
                      setOwnerInspectionSubmitted(true);
                      setToast({ message: t("jobs.inspectionSubmittedSuccess"), type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? t("common.failed"), type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setOwnerInspSubmitting(false);
                    }
                  }}
                  className="btn-secondary text-sm flex items-center gap-2"
                >
                  <Flag className="w-4 h-4" /> {ownerInspSubmitting ? t("common.saving") : t("jobs.submitHouseCheck")}
                </button>
              </div>
            ) : (
              <span className="text-sm text-green-600 font-medium">{t("jobs.houseCheckDone")}</span>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        title={t("jobs.cancelJob")}
        description={t("jobs.cancelJobConfirm")}
        confirmLabel={t("jobs.cancelJob")}
        confirmVariant="danger"
        onConfirm={async () => {
          const uid = requireUserId(user);
          if (!uid) return;
          await cancelJob({ jobId: job._id, userId: uid });
          setShowCancel(false);
        }}
      />

      {/* Stripe Connect invite modal */}
      {showConnectStripeModal && cleanerPaymentData && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">{t("jobs.connectCleanerToStripe")}</h3>
            {cleanerPaymentData.cleanerEmail ? (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  {t("jobs.connectCleanerToStripeDesc", { name: cleanerPaymentData.cleanerName })}
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4 text-sm text-gray-700">
                  {cleanerPaymentData.cleanerEmail}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowConnectStripeModal(false)}
                    className="btn-secondary text-sm"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    disabled={connectStripeLoading}
                    onClick={async () => {
                      const uid = requireUserId(user);
                      if (!uid || !cleanerPaymentData.cleanerUserId) return;
                      setConnectStripeLoading(true);
                      try {
                        await sendStripeConnectInviteMut({
                          userId: uid,
                          cleanerUserId: cleanerPaymentData.cleanerUserId,
                        });
                        setShowConnectStripeModal(false);
                        setToast({ message: t("jobs.stripeInviteSent"), type: "success" });
                        setTimeout(() => setToast(null), 3000);
                      } catch (err: any) {
                        setToast({ message: toFriendlyMessage(err, t("jobs.stripeInviteFailed")), type: "error" });
                        setTimeout(() => setToast(null), 4000);
                      } finally {
                        setConnectStripeLoading(false);
                      }
                    }}
                    className="btn-primary text-sm"
                  >
                    {connectStripeLoading ? t("common.loading") : t("jobs.sendInvite")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  {t("jobs.connectCleanerNoEmail")}
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowConnectStripeModal(false)}
                    className="btn-secondary text-sm"
                  >
                    {t("common.close")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Rework dialog */}
      {showRework && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t("jobs.requestRework")}</h3>
            <textarea
              className="input-field mb-4"
              rows={3}
              value={reworkNotes}
              onChange={(e) => setReworkNotes(e.target.value)}
              placeholder={t("jobs.reworkPlaceholder")}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRework(false)} className="btn-secondary">{t("common.cancel")}</button>
              <button
                onClick={async () => {
                  const uid = requireUserId(user);
                  if (!uid || !reworkNotes.trim() || !job.form) return;
                  try {
                    await requestFormRework({ formId: job.form._id, notes: reworkNotes, userId: uid });
                    setShowRework(false);
                    setReworkNotes("");
                    setToast({ message: t("jobs.reworkRequested"), type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  } catch (err: any) {
                    setToast({ message: err.message ?? t("common.failedToRequestRework"), type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  }
                }}
                disabled={!reworkNotes.trim()}
                className="btn-primary"
              >
                {t("jobs.sendReworkRequest")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Job dialog */}
      {showShare && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t("jobs.shareJob")}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("jobs.selectPartner")}</label>
                <select
                  className="input-field"
                  value={shareToCompany}
                  onChange={(e) => setShareToCompany(e.target.value)}
                >
                  <option value="">{t("jobs.choosePartner")}</option>
                  {connections?.map((c) => (
                    <option key={c.companyId} value={c.companyId}>{c.companyName}</option>
                  ))}
                </select>
                {connections?.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">{t("jobs.noConnections")}</p>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sharePackage}
                  onChange={(e) => setSharePackage(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">{t("jobs.shareCompletionPackage")}</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setShowShare(false); setShareToCompany(""); setSharePackage(false); }} className="btn-secondary">
                {t("common.cancel")}
              </button>
              <button
                disabled={!shareToCompany || sharing}
                onClick={async () => {
                  const uid = requireUserId(user);
                  if (!uid || !shareToCompany) return;
                  setSharing(true);
                  try {
                    await shareJobMut({
                      userId: uid,
                      jobId: job._id,
                      toCompanyId: shareToCompany as Id<"companies">,
                      sharePackage,
                    });
                    setShowShare(false);
                    setShareToCompany("");
                    setSharePackage(false);
                    setToast({ message: t("jobs.jobShared"), type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  } catch (err: any) {
                    setToast({ message: err.message ?? t("common.failedToShareJob"), type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setSharing(false);
                  }
                }}
                className="btn-primary flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" /> {sharing ? t("jobs.sharing") : t("jobs.shareJob")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign dialog */}
      {showReassign && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t("jobs.reassignJob")}</h3>
            <select
              className="input-field mb-2"
              value={reassignCleanerId}
              onChange={(e) => setReassignCleanerId(e.target.value)}
            >
              <option value="">{t("jobs.selectCleaner")}</option>
              {cleaners
                ?.filter((c) => !job.cleanerIds.includes(c._id))
                .map((c) => {
                  const isOff = cleanerAvailability?.find((a: any) => a._id === c._id)?.isUnavailable;
                  return (
                    <option key={c._id} value={c._id} disabled={!!isOff}>
                      {c.name} ({c.email}){isOff ? " — Unavailable" : ""}
                    </option>
                  );
                })}
            </select>
            {reassignCleanerId && cleanerAvailability?.find((a: any) => a._id === reassignCleanerId)?.isUnavailable && (
              <p className="text-xs text-amber-600 mb-4">This cleaner is marked unavailable for {job.scheduledDate}.</p>
            )}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setShowReassign(false); setReassignCleanerId(""); }} className="btn-secondary">{t("common.cancel")}</button>
              <button
                disabled={!reassignCleanerId || reassigning || !!cleanerAvailability?.find((a: any) => a._id === reassignCleanerId)?.isUnavailable}
                onClick={async () => {
                  const uid = requireUserId(user);
                  if (!reassignCleanerId || !uid) return;
                  setReassigning(true);
                  try {
                    await reassignJob({
                      jobId: job._id,
                      newCleanerId: reassignCleanerId as Id<"users">,
                      userId: uid,
                    });
                    setShowReassign(false);
                    setReassignCleanerId("");
                    setToast({ message: t("jobs.jobReassigned"), type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  } catch (err: any) {
                    setToast({ message: err.message ?? t("common.failedToReassign"), type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setReassigning(false);
                  }
                }}
                className="btn-primary"
              >
                {reassigning ? t("jobs.reassigning") : t("jobs.reassign")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
