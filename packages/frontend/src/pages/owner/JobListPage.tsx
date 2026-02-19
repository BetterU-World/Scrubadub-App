import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import { ClipboardCheck, Plus, Calendar, MapPin, Users } from "lucide-react";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rework_requested", label: "Rework" },
  { value: "cancelled", label: "Cancelled" },
];

export function JobListPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("");
  const jobs = useQuery(
    api.queries.jobs.list,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id, status: statusFilter || undefined }
      : "skip"
  );

  if (!user || jobs === undefined) return <PageLoader />;

  const sortedJobs = [...jobs].sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Manage cleaning jobs"
        action={
          <Link href="/jobs/new">
            <a className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Schedule Job
            </a>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? "bg-primary-100 text-primary-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {sortedJobs.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No jobs found"
          description={statusFilter ? "No jobs match the selected filter" : "Schedule your first cleaning job"}
          action={
            !statusFilter && (
              <Link href="/jobs/new">
                <a className="btn-primary">Schedule Job</a>
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {sortedJobs.map((job) => (
            <Link key={job._id} href={`/jobs/${job._id}`}>
              <a className="card block hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{job.propertyName}</h3>
                      <StatusBadge status={job.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {job.scheduledDate}
                      </span>
                      {job.startTime && <span>{job.startTime}</span>}
                      <span className="capitalize">{job.type.replace(/_/g, " ")}</span>
                      <span>{job.durationMinutes}min</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Users className="w-3.5 h-3.5" />
                    {(job.cleaners as any[]).map((c: any) => c.name).join(", ") || "Unassigned"}
                  </div>
                </div>
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
