import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import {
  ClipboardCheck,
  Calendar,
  MapPin,
  Clock,
  TrendingUp,
  Star,
  Zap,
} from "lucide-react";

export function CleanerJobListPage() {
  const { user, sessionToken } = useAuth();
  const jobs = useQuery(
    api.queries.jobs.getForCleaner,
    sessionToken ? { sessionToken } : "skip"
  );
  const stats = useQuery(
    api.queries.performance.getCleanerStats,
    sessionToken ? { sessionToken } : "skip"
  );

  if (!user || jobs === undefined) return <PageLoader />;

  const activeJobs = jobs.filter((j) => !["cancelled", "approved"].includes(j.status));
  const pastJobs = jobs.filter((j) => ["approved"].includes(j.status));

  return (
    <div>
      <PageHeader title="My Jobs" description={`${activeJobs.length} active jobs`} />

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-100 text-primary-600">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.jobsCompletedThisWeek}
                </p>
                <p className="text-sm text-gray-500">This Week</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100 text-yellow-600">
                <Star className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.averageScore > 0 ? stats.averageScore.toFixed(1) : "—"}
                </p>
                <p className="text-sm text-gray-500">Avg Score</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.currentStreak}
                </p>
                <p className="text-sm text-gray-500">Streak</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No jobs assigned"
          description="You'll see your assigned cleaning jobs here"
        />
      ) : (
        <div className="space-y-6">
          {activeJobs.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wider">Active</h3>
              <div className="space-y-3">
                {activeJobs.map((job) => (
                  <Link key={job._id} href={`/jobs/${job._id}`}>
                    <a className="card block hover:shadow-md transition-shadow">
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
                    </a>
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
                  <Link key={job._id} href={`/jobs/${job._id}`}>
                    <a className="card block opacity-75">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-gray-700">{job.propertyName}</h3>
                          <p className="text-sm text-gray-400">{job.scheduledDate}</p>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>
                    </a>
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
