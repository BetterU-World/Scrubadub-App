import { useState } from "react";
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
  Clock,
  Wrench,
  Calendar,
  ArrowRight,
  CheckCircle,
  Circle,
  Rocket,
  BookOpen,
} from "lucide-react";

const LS_MANUAL_READ = "scrubadub_onboarding_manual_read";

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

      <GettingStartedCard stats={stats} />

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
        <DashCard
          icon={Clock}
          label="Awaiting Approval"
          value={stats?.awaitingApprovalCount ?? "—"}
          href="/jobs?status=submitted"
          variant="warning"
        />
        <DashCard
          icon={Wrench}
          label="Open Maintenance"
          value={stats?.openMaintenanceCount ?? "—"}
          href="/jobs?type=maintenance"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Upcoming Jobs</h3>
            <Link href="/jobs" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {stats?.upcomingJobs && stats.upcomingJobs.length > 0 ? (
            <div className="space-y-3">
              {stats.upcomingJobs.map((job) => (
                <Link key={job._id} href={`/jobs/${job._id}`} className="block p-3 rounded-lg border border-gray-100 hover:border-primary-200 hover:bg-primary-50/30 transition-colors">
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
            <Link href="/red-flags" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
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

function GettingStartedCard({ stats }: { stats: any }) {
  const [manualRead, setManualRead] = useState(
    () => localStorage.getItem(LS_MANUAL_READ) === "1"
  );

  const steps = [
    {
      label: "Create your first property",
      href: "/properties",
      done: (stats?.propertyCount ?? 0) > 0,
    },
    {
      label: "Add your first team member",
      href: "/employees",
      done: (stats?.employeeCount ?? 0) > 1,
    },
    {
      label: "Schedule your first job",
      href: "/jobs/new",
      done: (stats?.totalJobCount ?? 0) > 0,
    },
    {
      label: "Read the Gold Standard manual",
      href: "/manuals",
      done: manualRead,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const allDone = completed === steps.length;

  if (allDone) {
    return (
      <div className="card mb-6 bg-primary-50 border-primary-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary-100 text-primary-600">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Onboarding complete! 🎉
              </p>
              <p className="text-sm text-gray-500">
                You're all set up and ready to go.
              </p>
            </div>
          </div>
          {import.meta.env.DEV && (
            <button
              onClick={() => {
                localStorage.removeItem(LS_MANUAL_READ);
                setManualRead(false);
              }}
              className="text-xs text-red-500 hover:text-red-700 underline"
            >
              Reset onboarding
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-100 text-primary-600">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Getting Started</h3>
            <p className="text-sm text-gray-500">
              {completed} of {steps.length} complete
            </p>
          </div>
        </div>
        {import.meta.env.DEV && (
          <button
            onClick={() => {
              localStorage.removeItem(LS_MANUAL_READ);
              setManualRead(false);
            }}
            className="text-xs text-red-500 hover:text-red-700 underline"
          >
            Reset onboarding
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-100 rounded-full mb-4">
        <div
          className="h-1.5 bg-primary-500 rounded-full transition-all"
          style={{ width: `${(completed / steps.length) * 100}%` }}
        />
      </div>

      <div className="space-y-1">
        {steps.map((step) => (
          <Link
            key={step.label}
            href={step.href}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {step.done ? (
              <CheckCircle className="w-5 h-5 text-primary-500 flex-shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-gray-300 flex-shrink-0" />
            )}
            <span
              className={`text-sm ${
                step.done
                  ? "text-gray-400 line-through"
                  : "text-gray-700 font-medium"
              }`}
            >
              {step.label}
            </span>
          </Link>
        ))}
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
  variant?: "default" | "danger" | "warning";
}) {
  return (
    <Link href={href} className="card hover:shadow-md transition-shadow cursor-pointer block">
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-lg ${
            variant === "danger"
              ? "bg-red-100 text-red-600"
              : variant === "warning"
                ? "bg-amber-100 text-amber-600"
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
    </Link>
  );
}
