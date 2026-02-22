import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";

export function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
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

  const [showCancel, setShowCancel] = useState(false);
  const [showRework, setShowRework] = useState(false);
  const [reworkNotes, setReworkNotes] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
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

  if (job === undefined) return <PageLoader />;
  if (job === null) return <div className="text-center py-12 text-gray-500">Job not found</div>;

  const canReview = job.status === "submitted";
  const canCancel = ["scheduled", "confirmed"].includes(job.status);

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={job.property?.name ?? "Job Details"}
        action={
          <div className="flex gap-2">
            {!job.sharedFromJobId && canCancel && (
              <button onClick={() => setShowShare(true)} className="btn-secondary flex items-center gap-2">
                <Share2 className="w-4 h-4" /> Share Job
              </button>
            )}
            {((job as any).acceptanceStatus === "denied" || (job as any).acceptanceStatus === "pending") && (
              <button onClick={() => setShowReassign(true)} className="btn-secondary flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Reassign
              </button>
            )}
            {canCancel && (
              <>
                <Link href={`/jobs/${job._id}/edit`} className="btn-secondary flex items-center gap-2">
                  <Pencil className="w-4 h-4" /> Edit
                </Link>
                <button onClick={() => setShowCancel(true)} className="btn-danger flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> Cancel
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
            <span className="text-sm text-gray-500 capitalize">{job.type.replace(/_/g, " ")}</span>
            {job.reworkCount > 0 && (
              <span className="badge bg-orange-100 text-orange-700">Rework #{job.reworkCount}</span>
            )}
            {(job as any).sharedFromCompanyName && (
              <span className="badge bg-blue-100 text-blue-700">Shared from {(job as any).sharedFromCompanyName}</span>
            )}
          </div>

          {(job as any).acceptanceStatus === "denied" && (job as any).denyReason && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm font-medium text-red-800">Deny reason:</p>
              <p className="text-sm text-red-700 mt-1">{(job as any).denyReason}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" /> {job.scheduledDate}
              {job.startTime && ` at ${job.startTime}`}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" /> {job.durationMinutes} minutes
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400" /> {job.property?.address}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Users className="w-4 h-4 text-gray-400" />
              {(job.cleaners as any[]).map((c: any) => c.name).join(", ") || "Unassigned"}
            </div>
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
                  <Share2 className="w-5 h-5" /> Shared Job from {incomingShared.fromCompanyName}
                </h3>
                <p className="text-sm text-blue-600 mt-1">
                  Accept to assign cleaners and start work, or reject to decline.
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
                      setToast({ message: "Shared job accepted!", type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? "Failed", type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setSharedJobAction(false);
                    }
                  }}
                  className="btn-primary flex items-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" /> Accept
                </button>
                <button
                  disabled={sharedJobAction}
                  onClick={async () => {
                    const uid = requireUserId(user);
                    if (!uid) return;
                    setSharedJobAction(true);
                    try {
                      await rejectSharedJobMut({ userId: uid, sharedJobId: incomingShared._id });
                      setToast({ message: "Shared job rejected", type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? "Failed", type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    } finally {
                      setSharedJobAction(false);
                    }
                  }}
                  className="btn-secondary flex items-center gap-1 text-red-600 border-red-200 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {incomingShared && incomingShared.status === "rejected" && (
          <div className="card border-red-200 bg-red-50/50">
            <p className="text-sm font-medium text-red-700">
              This shared job was rejected. It has been cancelled.
            </p>
          </div>
        )}

        {incomingShared && incomingShared.status === "accepted" && (
          <div className="card border-green-200 bg-green-50/50">
            <p className="text-sm font-medium text-green-700">
              Shared job accepted from {incomingShared.fromCompanyName}. You can now assign cleaners and start work.
            </p>
          </div>
        )}

        {/* Red flags section - shown FIRST for review */}
        {job.redFlags.length > 0 && (
          <div className="card border-red-200">
            <h3 className="font-semibold text-red-700 flex items-center gap-2 mb-4">
              <Flag className="w-5 h-5" /> Red Flags ({job.redFlags.length})
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

        {/* Form review section */}
        {job.form && (
          <div className="card">
            <button
              onClick={() => setExpandForm(!expandForm)}
              className="flex items-center justify-between w-full"
            >
              <h3 className="font-semibold text-gray-900">Cleaning Form</h3>
              {expandForm ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {job.form.cleanerScore !== undefined && (
              <p className="text-sm text-gray-500 mt-1">Self-score: {job.form.cleanerScore}/10</p>
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

            {((job.form as any).maintenanceCost != null || (job.form as any).maintenanceVendor) && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-1">Maintenance Details</p>
                <div className="flex gap-6 text-sm text-gray-600">
                  {(job.form as any).maintenanceCost != null && (
                    <span>Cost: <span className="font-medium">${(job.form as any).maintenanceCost.toFixed(2)}</span></span>
                  )}
                  {(job.form as any).maintenanceVendor && (
                    <span>Vendor: <span className="font-medium">{(job.form as any).maintenanceVendor}</span></span>
                  )}
                </div>
              </div>
            )}

            {job.form.ownerNotes && (
              <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm font-medium text-yellow-800">Review notes:</p>
                <p className="text-sm text-yellow-700">{job.form.ownerNotes}</p>
              </div>
            )}
          </div>
        )}

        {/* Review actions */}
        {canReview && (
          <div className="card border-primary-200 bg-primary-50/30">
            <h3 className="font-semibold text-gray-900 mb-4">Review Submission</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Feedback for the cleaner"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    const uid = requireUserId(user);
                    if (!uid || !job.form) return;
                    try {
                      await approveForm({ formId: job.form._id, notes: approveNotes || undefined, userId: uid });
                      setToast({ message: "Job approved!", type: "success" });
                      setTimeout(() => setToast(null), 3000);
                    } catch (err: any) {
                      setToast({ message: err.message ?? "Failed to approve", type: "error" });
                      setTimeout(() => setToast(null), 3000);
                    }
                  }}
                  className="btn-primary flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
                {job.reworkCount < 2 && (
                  <button
                    onClick={() => setShowRework(true)}
                    className="btn-secondary flex items-center gap-2 text-orange-600 border-orange-300 hover:bg-orange-50"
                  >
                    <RotateCcw className="w-4 h-4" /> Request Rework
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Shared job status (Owner1 view: shows who the job is shared to) */}
        {sharedStatus && sharedStatus.length > 0 && (
          <div className="card border-blue-200">
            <h3 className="font-semibold text-blue-700 flex items-center gap-2 mb-3">
              <Share2 className="w-5 h-5" /> Shared Job Status
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
                            Rejected by {s.toCompanyName}
                          </>
                        : <>Shared to: {s.toCompanyName}</>
                      }
                    </span>
                    <span className={`badge ${
                      s.status === "completed" ? "bg-green-100 text-green-700" :
                      s.status === "in_progress" ? "bg-yellow-100 text-yellow-700" :
                      s.status === "accepted" ? "bg-blue-100 text-blue-700" :
                      s.status === "rejected" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {s.status === "completed" ? "Completed" :
                       s.status === "in_progress" ? "In Progress" :
                       s.status === "accepted" ? "Accepted" :
                       s.status === "rejected" ? "Rejected" : "Pending"}
                    </span>
                  </div>

                  {/* Rejected: timestamp + action panel */}
                  {s.status === "rejected" && (
                    <>
                      {s.respondedAt && (
                        <p className="text-xs text-red-500 mt-1">
                          Declined on {new Date(s.respondedAt).toLocaleString()}
                        </p>
                      )}
                      <p className="text-sm text-red-600 mt-2">
                        This partner declined the job. Choose a new partner or assign internally.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => setShowShare(true)}
                          className="btn-secondary flex items-center gap-1.5 text-sm"
                        >
                          <Share2 className="w-4 h-4" /> Share to another partner
                        </button>
                        <button
                          onClick={() => setShowReassign(true)}
                          className="btn-primary flex items-center gap-1.5 text-sm"
                        >
                          <Users className="w-4 h-4" /> Assign to my cleaner
                        </button>
                      </div>
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
                        {expandPackage ? "Hide" : "View"} completion package
                        {expandPackage ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {expandPackage && (
                        <div className="mt-2 p-3 bg-white rounded border border-blue-100 space-y-2">
                          {s.checklistSummary && (
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Checklist:</span> {s.checklistSummary}
                            </p>
                          )}
                          {s.completionNotes && (
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Notes:</span> {s.completionNotes}
                            </p>
                          )}
                          {s.photoStorageIds && s.photoStorageIds.length > 0 ? (
                            <p className="text-sm text-gray-500">{s.photoStorageIds.length} photo(s) shared</p>
                          ) : (
                            <p className="text-sm text-gray-400">No photos shared</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {s.sharePackage && s.status !== "completed" && s.status !== "rejected" && (
                    <p className="text-xs text-gray-400 mt-1">Completion package will be shared when done</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        title="Cancel Job"
        description="Are you sure you want to cancel this job? Assigned cleaners will be notified."
        confirmLabel="Cancel Job"
        confirmVariant="danger"
        onConfirm={async () => {
          const uid = requireUserId(user);
          if (!uid) return;
          await cancelJob({ jobId: job._id, userId: uid });
          setShowCancel(false);
        }}
      />

      {/* Rework dialog */}
      {showRework && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Request Rework</h3>
            <textarea
              className="input-field mb-4"
              rows={3}
              value={reworkNotes}
              onChange={(e) => setReworkNotes(e.target.value)}
              placeholder="Describe what needs to be redone..."
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRework(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={async () => {
                  const uid = requireUserId(user);
                  if (!uid || !reworkNotes.trim() || !job.form) return;
                  try {
                    await requestFormRework({ formId: job.form._id, notes: reworkNotes, userId: uid });
                    setShowRework(false);
                    setReworkNotes("");
                    setToast({ message: "Rework requested", type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  } catch (err: any) {
                    setToast({ message: err.message ?? "Failed to request rework", type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  }
                }}
                disabled={!reworkNotes.trim()}
                className="btn-primary"
              >
                Send Rework Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Job dialog */}
      {showShare && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Share Job</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select partner company</label>
                <select
                  className="input-field"
                  value={shareToCompany}
                  onChange={(e) => setShareToCompany(e.target.value)}
                >
                  <option value="">Choose a connected partner...</option>
                  {connections?.map((c) => (
                    <option key={c.companyId} value={c.companyId}>{c.companyName}</option>
                  ))}
                </select>
                {connections?.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No active connections. Connect with a partner (must be accepted) before sharing jobs.</p>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sharePackage}
                  onChange={(e) => setSharePackage(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Share completion package (checklists/photos)</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setShowShare(false); setShareToCompany(""); setSharePackage(false); }} className="btn-secondary">
                Cancel
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
                    setToast({ message: "Job shared successfully!", type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  } catch (err: any) {
                    setToast({ message: err.message ?? "Failed to share job", type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setSharing(false);
                  }
                }}
                className="btn-primary flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" /> {sharing ? "Sharing..." : "Share Job"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign dialog */}
      {showReassign && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Reassign Job</h3>
            <select
              className="input-field mb-4"
              value={reassignCleanerId}
              onChange={(e) => setReassignCleanerId(e.target.value)}
            >
              <option value="">Select a cleaner...</option>
              {cleaners
                ?.filter((c) => !job.cleanerIds.includes(c._id))
                .map((c) => (
                  <option key={c._id} value={c._id}>{c.name} ({c.email})</option>
                ))}
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowReassign(false); setReassignCleanerId(""); }} className="btn-secondary">Cancel</button>
              <button
                disabled={!reassignCleanerId || reassigning}
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
                  } catch (err: any) {
                    console.error(err);
                  } finally {
                    setReassigning(false);
                  }
                }}
                className="btn-primary"
              >
                {reassigning ? "Reassigning..." : "Reassign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
