import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import {
  ClipboardCheck,
  Clock,
  Play,
  CheckCircle,
  Calendar,
  MapPin,
  Users,
} from "lucide-react";
import { format } from "date-fns";

export function ManagerHomePage() {
  const { user } = useAuth();

  const jobs = useQuery(
    api.queries.jobs.getForManager,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id }
      : "skip"
  );

  const today = format(new Date(), "yyyy-MM-dd");

  const stats = useMemo(() => {
    if (!jobs) return null;
    const todayJobs = jobs.filter((j) => j.scheduledDate === today);
    const upcoming = jobs.filter((j) => j.scheduledDate > today);
    const inProgress = jobs.filter((j) => j.status === "in_progress");
    const recentCompleted = jobs.filter(
      (j) => j.status === "approved" || j.status === "submitted"
    );
    return { todayJobs, upcoming, inProgress, recentCompleted };
  }, [jobs, today]);

  if (!user) return <PageLoader />;
  if (jobs === undefined) return <PageLoader />;

  const upcomingJobs = jobs
    .filter((j) => j.scheduledDate >= today && j.status !== "approved" && j.status !== "submitted")
    .slice(0, 8);

  const recentJobs = jobs
    .filter((j) => j.scheduledDate < today || j.status === "approved" || j.status === "submitted")
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title={`Operations Dashboard`}
        description={`Welcome back, ${user.name}`}
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Today"
          value={stats?.todayJobs.length ?? 0}
          icon={<ClipboardCheck className="w-5 h-5" />}
          color="text-blue-600 bg-blue-50"
        />
        <StatCard
          label="In Progress"
          value={stats?.inProgress.length ?? 0}
          icon={<Play className="w-5 h-5" />}
          color="text-purple-600 bg-purple-50"
        />
        <StatCard
          label="Upcoming"
          value={stats?.upcoming.length ?? 0}
          icon={<Clock className="w-5 h-5" />}
          color="text-amber-600 bg-amber-50"
        />
        <StatCard
          label="Completed"
          value={stats?.recentCompleted.length ?? 0}
          icon={<CheckCircle className="w-5 h-5" />}
          color="text-green-600 bg-green-50"
        />
      </div>

      {/* Quick Access */}
      <div className="flex gap-3 mb-6">
        <Link
          href="/jobs"
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <ClipboardCheck className="w-4 h-4" /> All Jobs
        </Link>
        <Link
          href="/calendar"
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Calendar className="w-4 h-4" /> Calendar
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming Jobs */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Upcoming Jobs
            </h2>
            <Link href="/jobs" className="text-xs text-primary-600 hover:text-primary-700">
              View all
            </Link>
          </div>
          {upcomingJobs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No upcoming jobs
            </p>
          ) : (
            <div className="space-y-2">
              {upcomingJobs.map((job) => (
                <Link
                  key={job._id}
                  href={`/jobs/${job._id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-primary-200 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {job.propertyName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{job.scheduledDate === today ? "Today" : job.scheduledDate}</span>
                      {job.startTime && <span>{job.startTime}</span>}
                      {job.cleaners.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {job.cleaners.map((c: any) => c.name).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={job.status} className="text-[10px] ml-2 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
            Recent Activity
          </h2>
          {recentJobs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No recent activity
            </p>
          ) : (
            <div className="space-y-2">
              {recentJobs.map((job) => (
                <Link
                  key={job._id}
                  href={`/jobs/${job._id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-primary-200 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-900 truncate block">
                      {job.propertyName}
                    </span>
                    <span className="text-xs text-gray-500">{job.scheduledDate}</span>
                  </div>
                  <StatusBadge status={job.status} className="text-[10px] ml-2 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}
