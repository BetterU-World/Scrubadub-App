import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useParams, Link, useLocation } from "wouter";
import { Calendar, Clock, MapPin, Key, CheckCircle, XCircle, Play, ClipboardCheck, MapPinCheck, Send } from "lucide-react";

export function CleanerJobDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
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

  const [showDeny, setShowDeny] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [completing, setCompleting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [denying, setDenying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  if (job === undefined) return <PageLoader />;
  if (job === null) return <div className="text-center py-12 text-gray-500">Job not found</div>;

  const acceptance = job.acceptanceStatus ?? "pending";
  const canAccept = job.status === "scheduled" && acceptance === "pending";
  const canArrive = (job.status === "confirmed" || job.status === "scheduled") && !job.arrivedAt;
  const hasArrived = !!job.arrivedAt;
  const canStart = (job.status === "confirmed" || job.status === "rework_requested");
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
      <PageHeader title={job.property?.name ?? "Job Details"} />

      <div className="space-y-4">
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} />
            <span className="text-sm text-gray-500 capitalize">{job.type.replace(/_/g, " ")}</span>
            {hasArrived && (
              <span className="badge bg-green-100 text-green-700 flex items-center gap-1">
                <MapPinCheck className="w-3 h-3" /> Arrived
              </span>
            )}
          </div>

          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" /> {job.scheduledDate}
              {job.startTime && ` at ${job.startTime}`}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" /> {job.durationMinutes} minutes
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" /> {job.property?.address}
            </div>
          </div>

          {job.property?.accessInstructions && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm font-medium text-yellow-800 flex items-center gap-1">
                <Key className="w-4 h-4" /> Access Instructions
              </p>
              <p className="text-sm text-yellow-700 mt-1">{job.property.accessInstructions}</p>
            </div>
          )}

          {job.notes && <p className="text-sm text-gray-600 border-t pt-3">{job.notes}</p>}

          {job.form?.ownerNotes && (
            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-sm font-medium text-orange-800">Rework notes from owner:</p>
              <p className="text-sm text-orange-700 mt-1">{job.form.ownerNotes}</p>
            </div>
          )}
        </div>

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
            {acceptance === "accepted" ? "You accepted this job" : "You denied this job"}
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
                    setToast({ message: "Job accepted", type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  } catch (err: any) {
                    setToast({ message: err.message ?? "Failed to accept", type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setAccepting(false);
                  }
                }}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> {accepting ? "Accepting..." : "Accept Job"}
              </button>
              <button
                onClick={() => setShowDeny(true)}
                className="btn-danger flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> Deny
              </button>
            </div>
          )}

          {canArrive && !canAccept && (
            <button
              onClick={async () => { await arriveJob({ jobId: job._id, userId: user!._id }); }}
              className="btn-secondary w-full flex items-center justify-center gap-2 py-3"
            >
              <MapPinCheck className="w-5 h-5" /> I've Arrived
            </button>
          )}

          {canStart && (
            <button
              onClick={handleStartJob}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg"
            >
              <Play className="w-5 h-5" /> Start Cleaning
            </button>
          )}

          {isInProgress && hasForm && (
            <Link href={`/jobs/${job._id}/form`} className="btn-secondary w-full flex items-center justify-center gap-2 py-3 text-lg">
              <ClipboardCheck className="w-5 h-5" /> Continue Checklist
            </Link>
          )}

          {isInProgress && (
            <button
              onClick={() => setShowComplete(true)}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg"
            >
              <CheckCircle className="w-5 h-5" /> Complete Clean
            </button>
          )}

          {job.status === "submitted" && (
            <div className="text-center text-sm text-gray-500 py-2">
              Waiting for owner review...
            </div>
          )}

          {job.status === "approved" && (
            <div className="text-center text-sm text-green-600 font-medium py-2">
              Job approved! Great work.
            </div>
          )}
        </div>
      </div>

      {/* Deny dialog */}
      {showDeny && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Deny Job</h3>
            <textarea
              className="input-field mb-4"
              rows={3}
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Reason for denying (optional)"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeny(false)} className="btn-secondary">Cancel</button>
              <button
                disabled={denying}
                onClick={async () => {
                  if (!user) return;
                  setDenying(true);
                  try {
                    await denyJob({ jobId: job._id, reason: denyReason || undefined, userId: user._id });
                    setShowDeny(false);
                    setToast({ message: "Job denied", type: "success" });
                    setTimeout(() => setToast(null), 3000);
                  } catch (err: any) {
                    setToast({ message: err.message ?? "Failed to deny", type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setDenying(false);
                  }
                }}
                className="btn-danger"
              >
                {denying ? "Denying..." : "Deny Job"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete dialog */}
      {showComplete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Complete Clean</h3>
            <p className="text-sm text-gray-500 mb-3">Add any notes about the cleaning (optional).</p>
            <textarea
              className="input-field mb-4"
              rows={3}
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Notes about the cleaning..."
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowComplete(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleCompleteJob}
                disabled={completing}
                className="btn-primary flex items-center gap-2"
              >
                {completing && <LoadingSpinner size="sm" />}
                <Send className="w-4 h-4" /> Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
