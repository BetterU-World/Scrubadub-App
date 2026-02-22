import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import {
  CheckCircle,
  RotateCcw,
  Flag,
  Building2,
  Users,
  TrendingUp,
} from "lucide-react";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const today = daysAgo(0);
const sevenAgo = daysAgo(7);
const thirtyAgo = daysAgo(30);

function completionDate(j: { completedAt?: number; scheduledDate: string }): string {
  if (j.completedAt) return new Date(j.completedAt).toISOString().slice(0, 10);
  return j.scheduledDate;
}

export function AnalyticsPage() {
  const { user } = useAuth();

  const allJobs = useQuery(
    api.queries.jobs.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  const allFlags = useQuery(
    api.queries.redFlags.listByCompany,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id }
      : "skip"
  );

  const metrics = useMemo(() => {
    if (!allJobs || !allFlags) return null;

    const completed = allJobs.filter((j) => j.status === "approved");
    const completedToday = completed.filter((j) => completionDate(j) === today).length;
    const completed7 = completed.filter((j) => completionDate(j) >= sevenAgo).length;
    const completed30 = completed.filter((j) => completionDate(j) >= thirtyAgo).length;

    // Rework rate (last 30 days): jobs that ever had rework requested
    const jobs30 = allJobs.filter(
      (j) => j.scheduledDate >= thirtyAgo && j.status !== "cancelled"
    );
    const reworked30 = jobs30.filter((j) => j.reworkCount > 0).length;
    const reworkRate = jobs30.length > 0 ? Math.round((reworked30 / jobs30.length) * 100) : 0;

    // Red flags opened last 30 days
    const flags30 = allFlags.filter((f) => {
      // Use _creationTime as proxy since we don't have a date field
      const created = new Date(f._creationTime).toISOString().slice(0, 10);
      return created >= thirtyAgo;
    });

    // Top 5 properties by red flags (last 30 days)
    const propFlagCounts: Record<string, { name: string; count: number }> = {};
    for (const f of flags30) {
      const key = f.propertyId;
      if (!propFlagCounts[key]) {
        propFlagCounts[key] = { name: f.propertyName ?? "Unknown", count: 0 };
      }
      propFlagCounts[key].count++;
    }
    const topProperties = Object.values(propFlagCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top cleaners by completed jobs (last 30 days)
    const cleanerCompleted: Record<string, { name: string; count: number }> = {};
    for (const j of completed.filter((j) => completionDate(j) >= thirtyAgo)) {
      for (const c of j.cleaners as { _id: string; name: string }[]) {
        if (!cleanerCompleted[c._id]) {
          cleanerCompleted[c._id] = { name: c.name, count: 0 };
        }
        cleanerCompleted[c._id].count++;
      }
    }
    const topCleaners = Object.values(cleanerCompleted)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Best quality: cleaners with most jobs but lowest rework rate (last 30 days)
    const cleanerQuality: Record<string, { name: string; total: number; reworks: number }> = {};
    for (const j of jobs30) {
      for (const c of j.cleaners as { _id: string; name: string }[]) {
        if (!cleanerQuality[c._id]) {
          cleanerQuality[c._id] = { name: c.name, total: 0, reworks: 0 };
        }
        cleanerQuality[c._id].total++;
        if (j.reworkCount > 0) cleanerQuality[c._id].reworks++;
      }
    }
    const bestQuality = Object.values(cleanerQuality)
      .filter((c) => c.total >= 2) // need at least 2 jobs to rank
      .sort((a, b) => {
        const rateA = a.reworks / a.total;
        const rateB = b.reworks / b.total;
        return rateA - rateB || b.total - a.total;
      })
      .slice(0, 5);

    return {
      completedToday,
      completed7,
      completed30,
      reworkRate,
      reworked30,
      jobs30Count: jobs30.length,
      flagsOpened30: flags30.length,
      topProperties,
      topCleaners,
      bestQuality,
    };
  }, [allJobs, allFlags]);

  if (!user || allJobs === undefined || allFlags === undefined) return <PageLoader />;

  if (!metrics) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Analytics" description="Key operations metrics (last 30 days)" />

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Tile
          icon={CheckCircle}
          label="Jobs Completed"
          value={
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-gray-900">{metrics.completed30}</span>
              <span className="text-sm text-gray-500">30d</span>
              <span className="text-lg font-semibold text-gray-700">{metrics.completed7}</span>
              <span className="text-sm text-gray-500">7d</span>
              <span className="text-lg font-semibold text-gray-700">{metrics.completedToday}</span>
              <span className="text-sm text-gray-500">today</span>
            </div>
          }
        />
        <Tile
          icon={RotateCcw}
          label="Rework Rate (30d)"
          value={
            <div>
              <span className={`text-2xl font-bold ${metrics.reworkRate > 20 ? "text-red-600" : metrics.reworkRate > 10 ? "text-orange-600" : "text-green-600"}`}>
                {metrics.reworkRate}%
              </span>
              <span className="text-sm text-gray-500 ml-2">
                {metrics.reworked30} of {metrics.jobs30Count} jobs
              </span>
            </div>
          }
        />
        <Tile
          icon={Flag}
          label="Red Flags Opened (30d)"
          value={<span className="text-2xl font-bold text-gray-900">{metrics.flagsOpened30}</span>}
          variant={metrics.flagsOpened30 > 0 ? "danger" : "default"}
        />
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Properties by Red Flags */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-gray-400" /> Top Properties by Red Flags
          </h3>
          {metrics.topProperties.length === 0 ? (
            <p className="text-sm text-gray-500">No red flags in the last 30 days</p>
          ) : (
            <div className="space-y-2">
              {metrics.topProperties.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{p.name}</span>
                  <span className="font-medium text-red-600 flex-shrink-0 ml-2">{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Cleaners by Completed Jobs */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-gray-400" /> Top Workers by Jobs
          </h3>
          {metrics.topCleaners.length === 0 ? (
            <p className="text-sm text-gray-500">No completed jobs in the last 30 days</p>
          ) : (
            <div className="space-y-2">
              {metrics.topCleaners.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{c.name}</span>
                  <span className="font-medium text-primary-600 flex-shrink-0 ml-2">{c.count} jobs</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Best Quality */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-gray-400" /> Best Quality (Lowest Rework)
          </h3>
          {metrics.bestQuality.length === 0 ? (
            <p className="text-sm text-gray-500">Not enough data yet</p>
          ) : (
            <div className="space-y-2">
              {metrics.bestQuality.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{c.name}</span>
                  <span className="flex-shrink-0 ml-2">
                    <span className="font-medium text-green-600">
                      {c.reworks === 0 ? "0%" : `${Math.round((c.reworks / c.total) * 100)}%`}
                    </span>
                    <span className="text-gray-400 ml-1">({c.total} jobs)</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  variant = "default",
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  variant?: "default" | "danger";
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`p-1.5 rounded-lg ${
            variant === "danger"
              ? "bg-red-100 text-red-600"
              : "bg-primary-100 text-primary-600"
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
      {value}
    </div>
  );
}
