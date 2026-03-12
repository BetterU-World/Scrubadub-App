import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import { MapPin, Clock, Users, Search, Eye } from "lucide-react";
import { format } from "date-fns";

type StatusFilter = "all" | "scheduled" | "confirmed" | "in_progress" | "submitted" | "approved";

export function ManagerJobListPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const jobs = useQuery(
    api.queries.jobs.getForManager,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id }
      : "skip"
  );

  const today = format(new Date(), "yyyy-MM-dd");

  const filtered = useMemo(() => {
    if (!jobs) return [];
    let result = [...jobs];
    if (statusFilter !== "all") {
      result = result.filter((j) => j.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.propertyName.toLowerCase().includes(q) ||
          j.cleaners.some((c: any) => c.name.toLowerCase().includes(q))
      );
    }
    return result;
  }, [jobs, statusFilter, search]);

  if (!user) return <PageLoader />;
  if (jobs === undefined) return <PageLoader />;

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "scheduled", label: "Scheduled" },
    { value: "confirmed", label: "Confirmed" },
    { value: "in_progress", label: "In Progress" },
    { value: "submitted", label: "Submitted" },
    { value: "approved", label: "Approved" },
  ];

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Read-only job oversight"
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by property or cleaner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 py-2 text-sm w-full"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                statusFilter === opt.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Job count */}
      <p className="text-xs text-gray-500 mb-3">
        {filtered.length} job{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Jobs list */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          No jobs found
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((job) => (
            <Link
              key={job._id}
              href={`/jobs/${job._id}`}
              className="card flex items-center gap-4 hover:shadow-md transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="font-medium text-gray-900 truncate">
                    {job.propertyName}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {job.scheduledDate === today ? "Today" : job.scheduledDate}
                    {job.startTime && ` at ${job.startTime}`}
                  </span>
                  <span>{job.durationMinutes} min</span>
                  {job.cleaners.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {job.cleaners.map((c: any) => c.name).join(", ")}
                    </span>
                  )}
                  {job.formStatus && (
                    <span className="text-xs">
                      Form: <span className="capitalize">{job.formStatus}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <StatusBadge status={job.status} className="text-[10px]" />
                {job.acceptanceStatus && job.acceptanceStatus !== "pending" && (
                  <StatusBadge status={job.acceptanceStatus} className="text-[10px]" />
                )}
                {(job as any).inspectionStatus === "submitted" && (
                  <span className="inline-flex items-center gap-0.5 badge bg-blue-100 text-blue-700 text-[10px]">
                    <Eye className="w-3 h-3" /> Inspection Submitted
                  </span>
                )}
                {(job as any).inspectionStatus === "reinspection_requested" && (
                  <span className="inline-flex items-center gap-0.5 badge bg-amber-100 text-amber-700 text-[10px]">
                    <Eye className="w-3 h-3" /> Re-Inspection Requested
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
