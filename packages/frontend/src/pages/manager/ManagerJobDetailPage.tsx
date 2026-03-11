import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JobTimeline } from "@/components/JobTimeline";
import { useParams, Link } from "wouter";
import {
  Calendar,
  Clock,
  MapPin,
  Key,
  Users,
  ArrowLeft,
  FileText,
  Image,
} from "lucide-react";

export function ManagerJobDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const job = useQuery(
    api.queries.jobs.get,
    user ? { jobId: params.id as Id<"jobs">, userId: user._id } : "skip"
  );

  if (job === undefined) return <PageLoader />;
  if (job === null)
    return (
      <div className="text-center py-12 text-gray-500">Job not found</div>
    );

  const acceptance = job.acceptanceStatus ?? "pending";
  const property = job.property ?? (job as any).propertySnapshot;

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      <PageHeader title={property?.name ?? "Job Details"} />

      <div className="space-y-4">
        {/* Status & Type */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={job.status} />
            {acceptance !== "pending" && (
              <StatusBadge status={acceptance} />
            )}
            <span className="text-sm text-gray-500 capitalize">
              {job.type.replace(/_/g, " ")}
            </span>
          </div>

          {/* Schedule Info */}
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />{" "}
              {job.scheduledDate}
              {job.startTime && ` at ${job.startTime}`}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />{" "}
              {job.durationMinutes} minutes
            </div>
            {property?.address && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />{" "}
                {property.address}
              </div>
            )}
          </div>

          {/* Access Instructions */}
          {property?.accessInstructions && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm font-medium text-yellow-800 flex items-center gap-1">
                <Key className="w-4 h-4" /> Access Instructions
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                {property.accessInstructions}
              </p>
            </div>
          )}

          {/* Notes */}
          {job.notes && (
            <p className="text-sm text-gray-600 border-t pt-3">
              {job.notes}
            </p>
          )}
        </div>

        {/* Assigned Cleaners */}
        {job.cleaners.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" /> Assigned Cleaners
            </h3>
            <div className="space-y-1">
              {job.cleaners.map((c) => (
                <div key={c!._id} className="text-sm text-gray-600">
                  {c!.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <JobTimeline job={job as any} />

        {/* Form Submission Info */}
        {job.form && (
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Form Submission
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Status:</span>
                <StatusBadge
                  status={job.form.status}
                  className="text-[10px]"
                />
              </div>
              {job.form.cleanerScore !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Cleaner Score:</span>
                  <span className="font-medium">
                    {job.form.cleanerScore}%
                  </span>
                </div>
              )}
              {job.form.finalPass !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Final Pass:</span>
                  <span
                    className={
                      job.form.finalPass
                        ? "text-green-600 font-medium"
                        : "text-red-600 font-medium"
                    }
                  >
                    {job.form.finalPass ? "Yes" : "No"}
                  </span>
                </div>
              )}
              {/* Photos */}
              {job.form.photoUrls && job.form.photoUrls.length > 0 && (
                <div>
                  <p className="text-gray-500 flex items-center gap-1 mb-2">
                    <Image className="w-3.5 h-3.5" />{" "}
                    {job.form.photoUrls.length} photo
                    {job.form.photoUrls.length !== 1 ? "s" : ""}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {job.form.photoUrls.map((url: string, i: number) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Job photo ${i + 1}`}
                        className="w-full h-24 object-cover rounded-lg border"
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* Rework notes */}
              {job.form.ownerNotes && (
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-sm font-medium text-orange-800">
                    Rework Notes
                  </p>
                  <p className="text-sm text-orange-700 mt-1">
                    {job.form.ownerNotes}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Read-only notice */}
        <div className="text-center text-xs text-gray-400 py-2">
          Read-only view — manager actions coming in a future update
        </div>
      </div>
    </div>
  );
}
