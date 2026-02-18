import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useParams, Link, useLocation } from "wouter";
import { Calendar, Clock, MapPin, Key, CheckCircle, XCircle, Play, ClipboardCheck } from "lucide-react";

export function CleanerJobDetailPage() {
  const params = useParams<{ id: string }>();
  const { user, sessionToken } = useAuth();
  const [, setLocation] = useLocation();
  const job = useQuery(api.queries.jobs.get,
    sessionToken ? { sessionToken, jobId: params.id as Id<"jobs"> } : "skip"
  );
  const confirmJob = useMutation(api.mutations.jobs.confirmJob);
  const denyJob = useMutation(api.mutations.jobs.denyJob);
  const startJob = useMutation(api.mutations.jobs.startJob);
  const createForm = useMutation(api.mutations.forms.createFromTemplate);

  const [showDeny, setShowDeny] = useState(false);
  const [denyReason, setDenyReason] = useState("");

  if (job === undefined) return <PageLoader />;
  if (job === null) return <div className="text-center py-12 text-gray-500">Job not found</div>;

  const canConfirm = job.status === "scheduled";
  const canStart = job.status === "confirmed" || job.status === "rework_requested";
  const isInProgress = job.status === "in_progress";

  const handleStartJob = async () => {
    if (!user) return;
    await startJob({ sessionToken: sessionToken!, jobId: job._id });
    const formId = await createForm({
      sessionToken: sessionToken!,
      jobId: job._id,
    });
    setLocation(`/jobs/${job._id}/form`);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title={job.property?.name ?? "Job Details"} />

      <div className="space-y-4">
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} />
            <span className="text-sm text-gray-500 capitalize">{job.type.replace(/_/g, " ")}</span>
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

        {/* Action buttons */}
        <div className="card">
          {canConfirm && (
            <div className="flex gap-3">
              <button
                onClick={async () => { await confirmJob({ sessionToken: sessionToken!, jobId: job._id }); }}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Confirm Job
              </button>
              <button
                onClick={() => setShowDeny(true)}
                className="btn-danger flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> Deny
              </button>
            </div>
          )}

          {canStart && (
            <button
              onClick={handleStartJob}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg"
            >
              <Play className="w-5 h-5" /> Start Cleaning
            </button>
          )}

          {isInProgress && (
            <Link href={`/jobs/${job._id}/form`}>
              <a className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg">
                <ClipboardCheck className="w-5 h-5" /> Continue Checklist
              </a>
            </Link>
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
                onClick={async () => {
                  await denyJob({ sessionToken: sessionToken!, jobId: job._id, reason: denyReason || undefined });
                  setShowDeny(false);
                }}
                className="btn-danger"
              >
                Deny Job
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
