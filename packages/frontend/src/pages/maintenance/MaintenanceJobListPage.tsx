import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import { Wrench, Calendar, MapPin, Clock, Search } from "lucide-react";

const DATE_RANGES = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
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

export function MaintenanceJobListPage() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<"all" | "today" | "week">("all");
  const [search, setSearch] = useState("");
  const jobs = useQuery(
    api.queries.jobs.getForCleaner,
    user ? { cleanerId: user._id, companyId: user.companyId, userId: user._id } : "skip"
  );

  if (!user || jobs === undefined) return <PageLoader />;

  const searchLower = search.toLowerCase();
  const filtered = jobs.filter((job) => {
    if (job.type !== "maintenance") return false;
    if (dateRange === "today") {
      if (job.scheduledDate !== getToday()) return false;
    } else if (dateRange === "week") {
      const [mon, sun] = getWeekRange();
      if (job.scheduledDate < mon || job.scheduledDate > sun) return false;
    }
    if (searchLower) {
      if (!job.propertyName?.toLowerCase().includes(searchLower)) return false;
    }
    return true;
  });

  const activeJobs = filtered.filter((j) => !["cancelled", "approved"].includes(j.status));
  const pastJobs = filtered.filter((j) => ["approved"].includes(j.status));
  const hasFilters = dateRange !== "all" || search;

  return (
    <div>
      <PageHeader title="Maintenance Jobs" description={`${activeJobs.length} active jobs`} />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
              {r.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search property…"
            className="input-field pl-8 py-1.5 text-sm w-full"
          />
        </div>
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
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{job.propertyName}</h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" /> {job.scheduledDate}
                          </span>
                          {job.startTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" /> {job.startTime}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> {job.propertyAddress}
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
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-gray-700">{job.propertyName}</h3>
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
