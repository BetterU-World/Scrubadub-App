import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import { Wrench, Calendar, MapPin, Clock, Search, ArrowUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { matchesDateRange, sortJobs, type JobSort } from "@/lib/jobBrowsing";

const DATE_RANGES = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
] as const;

export function MaintenanceJobListPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<"all" | "today" | "week">("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<JobSort>("created_desc");
  const jobs = useQuery(
    api.queries.jobs.getForCleaner,
    user?.companyId ? { cleanerId: user._id, companyId: user.companyId, userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  );

  if (!user || jobs === undefined) return <PageLoader />;

  const searchLower = search.toLowerCase();
  const filtered = sortJobs(jobs.filter((job) => {
    if (job.type !== "maintenance") return false;
    if (!matchesDateRange(job.scheduledDate, dateRange)) return false;
    if (statusFilter !== "all" && job.status !== statusFilter) return false;
    if (searchLower) {
      if (!job.propertyName?.toLowerCase().includes(searchLower)) return false;
    }
    return true;
  }), sort);

  const activeJobs = filtered.filter((j) => !["cancelled", "approved"].includes(j.status));
  const pastJobs = filtered.filter((j) => ["approved", "cancelled"].includes(j.status));
  const hasFilters = dateRange !== "all" || statusFilter !== "all" || search;

  return (
    <div>
      <PageHeader title="Maintenance Jobs" description={`${activeJobs.length} active jobs`} />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="grid grid-cols-3 rounded-lg border border-gray-200 overflow-hidden sm:inline-flex">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={`touch-target px-3 text-sm font-medium transition-colors ${
                dateRange === r.value
                  ? "bg-primary-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search property…"
            className="input-field pl-8 py-1.5 text-sm w-full"
          />
        </div>
        <select aria-label={t("jobs.statusFilter")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field py-1.5 text-sm sm:w-40"><option value="all">{t("requests.all")}</option>{(["scheduled", "confirmed", "in_progress", "submitted", "approved", "rework_requested", "cancelled"] as const).map((status) => <option key={status} value={status}>{t(`status.${status === "in_progress" ? "inProgress" : status === "rework_requested" ? "reworkRequested" : status}`)}</option>)}</select>
        <div className="relative sm:w-48"><ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><select aria-label={t("jobs.sortBy")} value={sort} onChange={(e) => setSort(e.target.value as JobSort)} className="input-field w-full py-1.5 pl-8 text-sm"><option value="created_desc">{t("jobs.recentlyCreated")}</option><option value="soonest">{t("jobs.soonestScheduled")}</option><option value="updated_desc">{t("jobs.recentlyUpdated")}</option><option value="created_asc">{t("jobs.oldestCreated")}</option></select></div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={hasFilters ? "No jobs found" : "No maintenance jobs assigned"}
          description={hasFilters ? "No jobs match your filters." : "You'll see your assigned maintenance jobs here"}
        />
      ) : (
        <div className="space-y-6">
          {activeJobs.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wider">Active</h3>
              <div className="space-y-3">
                {activeJobs.map((job) => (
                  <Link key={job._id} href={`/jobs/${job._id}`} className="card block hover:shadow-md transition-shadow">
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
                      <div className="min-w-0 w-full">
                        <h3 className="font-semibold text-gray-900 break-words">{job.propertyName}</h3>
                        {(job as any).assignedTeamName && <p className="text-xs text-blue-600 mt-0.5">Team: {(job as any).assignedTeamName}</p>}
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" /> {job.scheduledDate}
                          </span>
                          {job.startTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" /> {job.startTime}
                            </span>
                          )}
                          <span className="flex min-w-0 items-start gap-1">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> <span className="break-words">{job.propertyAddress}</span>
                          </span>
                        </div>
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {pastJobs.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wider">Completed</h3>
              <div className="space-y-3">
                {pastJobs.map((job) => (
                  <Link key={job._id} href={`/jobs/${job._id}`} className="card block opacity-75">
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 w-full">
                        <h3 className="font-medium text-gray-700 break-words">{job.propertyName}</h3>
                        {(job as any).assignedTeamName && <p className="text-xs text-blue-600 mt-0.5">Team: {(job as any).assignedTeamName}</p>}
                        <p className="text-sm text-gray-400">{job.scheduledDate}</p>
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
