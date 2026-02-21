import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useParams, Link } from "wouter";
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
  const approveJob = useMutation(api.mutations.jobs.approveJob);
  const requestRework = useMutation(api.mutations.jobs.requestRework);

  const [showCancel, setShowCancel] = useState(false);
  const [showRework, setShowRework] = useState(false);
  const [reworkNotes, setReworkNotes] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [expandForm, setExpandForm] = useState(false);

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

      <div className="space-y-6">
        {/* Job info card */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} />
            <span className="text-sm text-gray-500 capitalize">{job.type.replace(/_/g, " ")}</span>
            {job.reworkCount > 0 && (
              <span className="badge bg-orange-100 text-orange-700">Rework #{job.reworkCount}</span>
            )}
          </div>

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
                    await approveJob({ jobId: job._id, notes: approveNotes || undefined, userId: user!._id });
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
      </div>

      <ConfirmDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        title="Cancel Job"
        description="Are you sure you want to cancel this job? Assigned cleaners will be notified."
        confirmLabel="Cancel Job"
        confirmVariant="danger"
        onConfirm={async () => {
          await cancelJob({ jobId: job._id, userId: user!._id });
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
                  if (!reworkNotes.trim()) return;
                  await requestRework({ jobId: job._id, notes: reworkNotes, userId: user!._id });
                  setShowRework(false);
                  setReworkNotes("");
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
    </div>
  );
}
