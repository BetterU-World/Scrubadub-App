import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { requireUserId } from "@/lib/requireUserId";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Link } from "wouter";
import { ClipboardCheck, Plus, Calendar, MapPin, Users, Trash2, Search } from "lucide-react";

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

export function JobListPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("");
  const [dateRange, setDateRange] = useState<"all" | "today" | "week">("all");
  const [search, setSearch] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const resetOps = useMutation(api.mutations.devReset.resetCompanyOpsData);
  const jobs = useQuery(
    api.queries.jobs.list,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id, status: statusFilter || undefined }
      : "skip"
  );

  if (!user || jobs === undefined) return <PageLoader />;

  const searchLower = search.toLowerCase();
  const filteredJobs = [...jobs]
    .filter((job) => {
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
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  const hasFilters = statusFilter || dateRange !== "all" || search;

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Manage cleaning jobs"
        action={
          <div className="flex gap-2">
            {import.meta.env.DEV && (
              <button
                onClick={() => setShowReset(true)}
                className="btn-secondary flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" /> Reset Test Run
              </button>
            )}
            <Link href="/jobs/new" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Schedule Job
            </Link>
          </div>
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
            placeholder="Search property or cleaner…"
            className="input-field pl-8 py-1.5 text-sm w-full"
          />
        </div>
      </div>

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
            {f.label}
          </button>
        ))}
      </div>

      {filteredJobs.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No jobs found"
          description={hasFilters ? "No jobs match your filters." : "Schedule your first cleaning job"}
          action={
            !hasFilters && (
              <Link href="/jobs/new" className="btn-primary">Schedule Job</Link>
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
            </Link>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={showReset}
        onOpenChange={setShowReset}
        title="Reset Test Run"
        description="This will delete all jobs, forms, notifications, red flags, and audit logs for your company. Properties and employees will be preserved."
        confirmLabel={resetting ? "Resetting..." : "Delete Test Data"}
        confirmVariant="danger"
        onConfirm={async () => {
          const uid = requireUserId(user);
          if (!uid) return;
          setResetting(true);
          try {
            const result = await resetOps({ userId: uid });
            console.log("Reset complete:", result);
            setShowReset(false);
          } catch (err: any) {
            console.error("Reset failed:", err);
          } finally {
            setResetting(false);
          }
        }}
      />
    </div>
  );
}
