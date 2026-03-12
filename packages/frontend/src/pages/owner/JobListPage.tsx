import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import { ClipboardCheck, Plus, Calendar, Users, Search, ArrowUpDown, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";

const SORT_OPTIONS = [
  { value: "soonest", labelKey: "jobs.soonestScheduled" },
  { value: "updated_desc", labelKey: "jobs.recentlyUpdated" },
  { value: "created_desc", labelKey: "jobs.recentlyCreated" },
  { value: "created_asc", labelKey: "jobs.oldestCreated" },
] as const;

const STATUS_FILTERS = [
  { value: "", labelKey: "requests.all" },
  { value: "scheduled", labelKey: "status.scheduled" },
  { value: "confirmed", labelKey: "status.confirmed" },
  { value: "in_progress", labelKey: "status.inProgress" },
  { value: "submitted", labelKey: "status.submitted" },
  { value: "approved", labelKey: "status.approved" },
  { value: "rework_requested", labelKey: "jobs.rework" },
  { value: "cancelled", labelKey: "status.cancelled" },
];

const DATE_RANGES = [
  { value: "all", labelKey: "requests.all" },
  { value: "today", labelKey: "calendar.today" },
  { value: "week", labelKey: "jobs.thisWeek" },
] as const;

function getToday() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function getWeekRange(): [string, string] {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) =>
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return [fmt(mon), fmt(sun)];
}

export function JobListPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("status") || "";
  });
  const [typeFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("type") || "";
  });
  const [dateRange, setDateRange] = useState<"all" | "today" | "week">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("soonest");
  const jobs = useQuery(
    api.queries.jobs.list,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id, status: statusFilter || undefined, sort }
      : "skip"
  );

  if (!user || jobs === undefined) return <PageLoader />;

  const searchLower = search.toLowerCase();
  const filteredJobs = [...jobs]
    .filter((job) => {
      if (typeFilter && job.type !== typeFilter) return false;
      if (dateRange === "today") {
        if (job.scheduledDate !== getToday()) return false;
      } else if (dateRange === "week") {
        const [mon, sun] = getWeekRange();
        if (job.scheduledDate < mon || job.scheduledDate > sun) return false;
      }
      if (searchLower) {
        const propMatch = job.propertyName?.toLowerCase().includes(searchLower);
        const cleanerMatch = (job.cleaners as any[]).some((c: any) =>
          c.name?.toLowerCase().includes(searchLower)
        );
        if (!propMatch && !cleanerMatch) return false;
      }
      return true;
    })
;

  const hasFilters = statusFilter || typeFilter || dateRange !== "all" || search;

  return (
    <div>
      <PageHeader
        title={t("jobs.title")}
        description={t("jobs.description")}
        action={
          <Link href="/jobs/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t("jobs.scheduleJob")}
          </Link>
        }
      />

      {/* Date range + search controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                dateRange === r.value
                  ? "bg-primary-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t(r.labelKey)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("jobs.searchPlaceholder")}
            className="input-field pl-8 py-1.5 text-sm w-full"
          />
        </div>
        <div className="relative">
          <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="input-field pl-8 pr-3 py-1.5 text-sm appearance-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </div>
      </div>

      {typeFilter && (
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
            Type: {typeFilter.replace(/_/g, " ")}
          </span>
          <Link href="/jobs" className="text-xs text-gray-500 hover:text-gray-700 underline">
            {t("common.clear")}
          </Link>
        </div>
      )}

      {/* Status pills */}
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
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {filteredJobs.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t("jobs.noJobsFound")}
          description={hasFilters ? t("jobs.noJobsFilter") : t("jobs.scheduleFirst")}
          action={
            !hasFilters && (
              <Link href="/jobs/new" className="btn-primary">{t("jobs.scheduleJob")}</Link>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <Link key={job._id} href={`/jobs/${job._id}`} className="card block hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{job.propertyName}</h3>
                      <StatusBadge status={job.status} />
                      {(job as any).acceptanceStatus && (job as any).acceptanceStatus !== "accepted" && (
                        <StatusBadge status={(job as any).acceptanceStatus} className="text-[10px]" />
                      )}
                      {(job as any).acceptanceStatus === "accepted" && (
                        <span className="badge bg-green-100 text-green-800 text-[10px]">accepted</span>
                      )}
                      {(job as any).sharedFromCompanyName && (
                        <span className="badge bg-blue-100 text-blue-700 text-[10px]">
                          {t("jobs.sharedFrom", { name: (job as any).sharedFromCompanyName })}
                        </span>
                      )}
                      {(job as any).hasRejectedShare && (
                        <span className="badge bg-red-100 text-red-700 text-[10px]">
                          {t("jobs.partnerRejected")}
                        </span>
                      )}
                      {/* Inspection status badge */}
                      {(job as any).inspectionStatus === "submitted" && (
                        <span className="inline-flex items-center gap-0.5 badge bg-blue-100 text-blue-700 text-[10px]">
                          <Eye className="w-3 h-3" /> {t("jobs.inspectionSubmitted")}
                        </span>
                      )}
                      {(job as any).inspectionStatus === "reinspection_requested" && (
                        <span className="inline-flex items-center gap-0.5 badge bg-amber-100 text-amber-700 text-[10px]">
                          <Eye className="w-3 h-3" /> {t("jobs.reinspectionRequested")}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {job.scheduledDate}
                      </span>
                      {job.startTime && <span>{job.startTime}</span>}
                      <span className="capitalize">{t(`jobTypes.${job.type}`, job.type.replace(/_/g, " "))}</span>
                      <span>{job.durationMinutes}min</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Users className="w-3.5 h-3.5" />
                    {(job.cleaners as any[]).map((c: any) => c.name).join(", ") || t("common.unassigned")}
                  </div>
                </div>
            </Link>
          ))}
        </div>
      )}

    </div>
  );
}
