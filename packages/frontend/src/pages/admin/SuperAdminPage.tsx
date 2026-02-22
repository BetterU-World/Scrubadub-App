import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import {
  Building2,
  Users,
  ClipboardCheck,
  Flag,
  Wrench,
  Activity,
} from "lucide-react";

export function SuperAdminPage() {
  const { user } = useAuth();

  const stats = useQuery(
    api.queries.admin.getPlatformStats,
    user ? { userId: user._id } : "skip"
  );

  if (!user) return <PageLoader />;

  if (stats === undefined) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Super Admin" description="Platform-wide analytics" />

      {/* Overview tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Tile icon={Building2} label="Companies" value={stats.totalCompanies} />
        <Tile icon={Users} label="Total Users" value={stats.totalUsers} sub={`${stats.activeUsers} active · ${stats.usersActive7d} active 7d`} />
        <Tile icon={ClipboardCheck} label="Jobs Created" value={stats.jobsCreated30d} sub={`${stats.jobsCreated7d} last 7d`} />
        <Tile icon={Flag} label="Red Flags" value={stats.redFlags30d} sub={`${stats.redFlags7d} last 7d`} variant="danger" />
      </div>

      {/* Completion stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Tile icon={ClipboardCheck} label="Jobs Completed (30d)" value={stats.jobsCompleted30d} sub={`${stats.jobsCompleted7d} last 7d`} />
        <Tile icon={Wrench} label="Maintenance Completed (30d)" value={stats.maintenanceCompleted30d} sub={`${stats.maintenanceCompleted7d} last 7d`} />
        <Tile icon={Activity} label="Active Workers (7d)" value={stats.usersActive7d} sub="Workers with jobs in last 7 days" />
      </div>

      {/* Top companies */}
      <div className="card max-w-xl">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-gray-400" /> Top Companies by Jobs (30d)
        </h3>
        {stats.topCompanies.length === 0 ? (
          <p className="text-sm text-gray-500">No job data in the last 30 days</p>
        ) : (
          <div className="space-y-2">
            {stats.topCompanies.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 truncate">{c.name}</span>
                <span className="font-medium text-primary-600 flex-shrink-0 ml-2">{c.count} jobs</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  variant = "default",
}: {
  icon: any;
  label: string;
  value: number;
  sub?: string;
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
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
