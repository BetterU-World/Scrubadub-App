import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
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

export function AnalyticsPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();

  const metrics = useQuery(
    (api as any).queries.analytics.getOperationalSummary,
    user?.companyId ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip"
  );
  if (!user || metrics === undefined) return <PageLoader />;

  if (!metrics) return <PageLoader />;

  return (
    <div>
      <PageHeader title={t("analytics.title")} description={t("analytics.description")} />

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Tile
          icon={CheckCircle}
          label={t("analytics.jobsCompleted")}
          value={
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-gray-900">{metrics.completed30}</span>
              <span className="text-sm text-gray-500">{t("analytics.thirtyDays")}</span>
              <span className="text-lg font-semibold text-gray-700">{metrics.completed7}</span>
              <span className="text-sm text-gray-500">{t("analytics.sevenDays")}</span>
              <span className="text-lg font-semibold text-gray-700">{metrics.completedToday}</span>
              <span className="text-sm text-gray-500">{t("analytics.todayLabel")}</span>
            </div>
          }
        />
        <Tile
          icon={RotateCcw}
          label={t("analytics.reworkRate")}
          value={
            <div>
              <span className={`text-2xl font-bold ${metrics.reworkRate > 20 ? "text-red-600" : metrics.reworkRate > 10 ? "text-orange-600" : "text-green-600"}`}>
                {metrics.reworkRate}%
              </span>
              <span className="text-sm text-gray-500 ml-2">
                {t("analytics.ofJobs", { reworked: metrics.reworked30, total: metrics.jobs30Count })}
              </span>
            </div>
          }
        />
        <Tile
          icon={Flag}
          label={t("analytics.redFlagsOpened")}
          value={<span className="text-2xl font-bold text-gray-900">{metrics.flagsOpened30}</span>}
          variant={metrics.flagsOpened30 > 0 ? "danger" : "default"}
        />
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Properties by Red Flags */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-gray-400" /> {t("analytics.topPropertiesByRedFlags")}
          </h3>
          {metrics.topProperties.length === 0 ? (
            <p className="text-sm text-gray-500">{t("analytics.noRedFlags30")}</p>
          ) : (
            <div className="space-y-2">
              {metrics.topProperties.map((p: { name: string; count: number }, i: number) => (
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
            <Users className="w-4 h-4 text-gray-400" /> {t("analytics.topWorkersByJobs")}
          </h3>
          {metrics.topCleaners.length === 0 ? (
            <p className="text-sm text-gray-500">{t("analytics.noCompletedJobs30")}</p>
          ) : (
            <div className="space-y-2">
              {metrics.topCleaners.map((c: { name: string; count: number }, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{c.name}</span>
                  <span className="font-medium text-primary-600 flex-shrink-0 ml-2">{t("analytics.jobsCount", { count: c.count })}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Best Quality */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-gray-400" /> {t("analytics.bestQuality")}
          </h3>
          {metrics.bestQuality.length === 0 ? (
            <p className="text-sm text-gray-500">{t("analytics.notEnoughData")}</p>
          ) : (
            <div className="space-y-2">
              {metrics.bestQuality.map((c: { name: string; total: number; reworks: number }, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{c.name}</span>
                  <span className="flex-shrink-0 ml-2">
                    <span className="font-medium text-green-600">
                      {c.reworks === 0 ? "0%" : `${Math.round((c.reworks / c.total) * 100)}%`}
                    </span>
                    <span className="text-gray-400 ml-1">({t("analytics.jobsCount", { count: c.total })})</span>
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
