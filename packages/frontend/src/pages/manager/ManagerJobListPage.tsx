import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import { MapPin, Clock, Users, Search, Eye, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { matchesDateRange, sortJobs, type JobDateRange, type JobSort } from "@/lib/jobBrowsing";
import { filterByManagerJobScope, getEffectiveManagerJobScope, type ManagerJobScope } from "@/lib/managerJobScope";

type StatusFilter = "all" | "scheduled" | "confirmed" | "in_progress" | "submitted" | "approved" | "cancelled";

export function ManagerJobListPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<JobDateRange>("all");
  const [sort, setSort] = useState<JobSort>("created_desc");
  const [requestedScope, setRequestedScope] = useState<ManagerJobScope>("all");

  const jobs = useQuery(
    api.queries.jobs.getForManager,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id, sessionToken: getStaffSessionToken() }
      : "skip"
  );

  const today = format(new Date(), "yyyy-MM-dd");

  const filtered = useMemo(() => {
    if (!jobs) return [];
    let result = filterByManagerJobScope([...jobs], requestedScope, user?.canSeeAllJobs === true);
    if (statusFilter !== "all") {
      result = result.filter((j) => j.status === statusFilter);
    }
    result = result.filter((job) => matchesDateRange(job.scheduledDate, dateRange));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.propertyName.toLowerCase().includes(q) ||
          j.cleaners.some((c: any) => c.name.toLowerCase().includes(q))
      );
    }
    return sortJobs(result, sort);
  }, [jobs, requestedScope, user?.canSeeAllJobs, statusFilter, search, dateRange, sort]);

  if (!user) return <PageLoader />;
  if (jobs === undefined) return <PageLoader />;

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: t("requests.all") },
    { value: "scheduled", label: t("status.scheduled") },
    { value: "cancelled", label: t("status.cancelled") },
    { value: "confirmed", label: t("status.confirmed") },
    { value: "in_progress", label: t("status.inProgress") },
    { value: "submitted", label: t("status.submitted") },
    { value: "approved", label: t("status.approved") },
  ];
  const scope = getEffectiveManagerJobScope(requestedScope, user.canSeeAllJobs === true);

  return (
    <div>
      <PageHeader
        title="Jobs"
        description={user.canCreateJobs ? "Job oversight and scheduling" : "Assigned and permitted job oversight"}
        action={user.canCreateJobs ? <Link href="/jobs/new" className="btn-primary">Create Job</Link> : undefined}
      />

      {user.canSeeAllJobs && (
        <div className="mb-4 flex w-fit items-center gap-1 rounded-lg bg-gray-100 p-1" aria-label="Job scope">
          {(["all", "my"] as ManagerJobScope[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRequestedScope(option)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${scope === option ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
            >
              {option === "all" ? "All Jobs" : "My Jobs"}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {(["all", "today", "week"] as const).map((range) => <button key={range} onClick={() => setDateRange(range)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${dateRange === range ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600"}`}>{t(range === "all" ? "requests.all" : range === "today" ? "calendar.today" : "jobs.thisWeek")}</button>)}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
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
        <div className="relative sm:w-48"><ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><select aria-label={t("jobs.sortBy")} value={sort} onChange={(e) => setSort(e.target.value as JobSort)} className="input-field w-full py-2 pl-8 text-sm"><option value="created_desc">{t("jobs.recentlyCreated")}</option><option value="soonest">{t("jobs.soonestScheduled")}</option><option value="updated_desc">{t("jobs.recentlyUpdated")}</option><option value="created_asc">{t("jobs.oldestCreated")}</option></select></div>
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
      </div>

      {/* Job count */}
      <p className="text-xs text-gray-500 mb-3">
        {filtered.length} job{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Jobs list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No jobs found"
          description="Try adjusting your search or status filter."
        />
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
