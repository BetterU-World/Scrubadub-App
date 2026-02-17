import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Link } from "wouter";
import {
  Building2,
  Users,
  ClipboardCheck,
  Flag,
  Calendar,
  ArrowRight,
} from "lucide-react";

export function DashboardPage() {
  const { user } = useAuth();
  const stats = useQuery(
    api.queries.dashboard.getStats,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  if (!user) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={user.companyName}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DashCard
          icon={Building2}
          label="Properties"
          value={stats?.propertyCount ?? "—"}
          href="/properties"
        />
        <DashCard
          icon={Users}
          label="Team Members"
          value={stats?.employeeCount ?? "—"}
          href="/employees"
        />
        <DashCard
          icon={ClipboardCheck}
          label="Active Jobs"
          value={stats?.activeJobCount ?? "—"}
          href="/jobs"
        />
        <DashCard
          icon={Flag}
          label="Open Red Flags"
          value={stats?.openRedFlagCount ?? "—"}
          href="/red-flags"
          variant="danger"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Upcoming Jobs</h3>
            <Link href="/jobs">
              <a className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
                View all <ArrowRight className="w-4 h-4" />
              </a>
            </Link>
          </div>
          {stats?.upcomingJobs && stats.upcomingJobs.length > 0 ? (
            <div className="space-y-3">
              {stats.upcomingJobs.map((job) => (
                <Link key={job._id} href={`/jobs/${job._id}`}>
                  <a className="block p-3 rounded-lg border border-gray-100 hover:border-primary-200 hover:bg-primary-50/30 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">
                          {job.propertyName}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {job.scheduledDate} · {job.type.replace(/_/g, " ")}
                        </p>
                      </div>
                      <span className="badge bg-blue-100 text-blue-800 capitalize text-xs">
                        {job.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No upcoming jobs scheduled</p>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Recent Red Flags</h3>
            <Link href="/red-flags">
              <a className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
                View all <ArrowRight className="w-4 h-4" />
              </a>
            </Link>
          </div>
          {stats?.recentRedFlags && stats.recentRedFlags.length > 0 ? (
            <div className="space-y-3">
              {stats.recentRedFlags.map((flag) => (
                <div
                  key={flag._id}
                  className="p-3 rounded-lg border border-red-100 bg-red-50/30"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{flag.note}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {flag.category} · {flag.severity}
                      </p>
                    </div>
                    <span className="badge bg-red-100 text-red-800 capitalize text-xs">
                      {flag.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No open red flags</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DashCard({
  icon: Icon,
  label,
  value,
  href,
  variant = "default",
}: {
  icon: any;
  label: string;
  value: number | string;
  href: string;
  variant?: "default" | "danger";
}) {
  return (
    <Link href={href}>
      <a className="card hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              variant === "danger"
                ? "bg-red-100 text-red-600"
                : "bg-primary-100 text-primary-600"
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500">{label}</p>
          </div>
        </div>
      </a>
    </Link>
  );
}
