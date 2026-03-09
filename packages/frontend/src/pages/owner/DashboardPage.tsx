import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { SuccessModal, shouldShowSuccessModal } from "@/components/owner/SuccessModal";
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
import { useTranslation } from "react-i18next";

const LS_MANUAL_READ = "scrubadub_onboarding_manual_read";

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const stats = useQuery(
    api.queries.dashboard.getStats,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  // Success modal for first-time owners
  const [showSuccess, setShowSuccess] = useState(shouldShowSuccessModal);
  const mySite = useQuery(
    api.queries.companySites.getMySite,
    user?.companyId && user?.role === "owner" && showSuccess
      ? { companyId: user.companyId, userId: user._id }
      : "skip"
  );

  if (!user) return <PageLoader />;

  return (
    <div>
      {showSuccess && mySite && (
        <SuccessModal
          slug={mySite.slug}
          publicRequestToken={mySite.publicRequestToken}
          onDismiss={() => setShowSuccess(false)}
        />
      )}

      <PageHeader
        title={t("dashboard.welcomeBack", { name: user.name.split(" ")[0] })}
        description={user.companyName}
      />

      <GettingStartedCard stats={stats} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DashCard
          icon={Building2}
          label={t("dashboard.properties")}
          value={stats?.propertyCount ?? "—"}
          href="/properties"
        />
        <DashCard
          icon={Users}
          label={t("dashboard.teamMembers")}
          value={stats?.employeeCount ?? "—"}
          href="/employees"
        />
        <DashCard
          icon={ClipboardCheck}
          label={t("dashboard.activeJobs")}
          value={stats?.activeJobCount ?? "—"}
          href="/jobs"
        />
        <DashCard
          icon={Flag}
          label={t("dashboard.openRedFlags")}
          value={stats?.openRedFlagCount ?? "—"}
          href="/red-flags"
          variant="danger"
        />
        <DashCard
          icon={Clock}
          label={t("dashboard.awaitingApproval")}
          value={stats?.awaitingApprovalCount ?? "—"}
          href="/jobs?status=submitted"
          variant="warning"
        />
        <DashCard
          icon={Wrench}
          label={t("dashboard.openMaintenance")}
          value={stats?.openMaintenanceCount ?? "—"}
          href="/jobs?type=maintenance"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{t("dashboard.upcomingJobs")}</h3>
            <Link href="/jobs" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              {t("common.viewAll")} <ArrowRight className="w-4 h-4" />
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
                        {job.scheduledDate} · {t(`jobTypes.${job.type}`, job.type.replace(/_/g, " "))}
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
            <p className="text-sm text-gray-500">{t("dashboard.noUpcomingJobs")}</p>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{t("dashboard.recentRedFlags")}</h3>
            <Link href="/red-flags" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              {t("common.viewAll")} <ArrowRight className="w-4 h-4" />
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
            <p className="text-sm text-gray-500">{t("dashboard.noOpenRedFlags")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function GettingStartedCard({ stats }: { stats: any }) {
  const { t } = useTranslation();
  const [manualRead, setManualRead] = useState(
    () => localStorage.getItem(LS_MANUAL_READ) === "1"
  );

  const steps = [
    {
      label: t("dashboard.createFirstProperty"),
      href: "/properties",
      done: (stats?.propertyCount ?? 0) > 0,
    },
    {
      label: t("dashboard.addFirstTeamMember"),
      href: "/employees",
      done: (stats?.employeeCount ?? 0) > 1,
    },
    {
      label: t("dashboard.scheduleFirstJob"),
      href: "/jobs/new",
      done: (stats?.totalJobCount ?? 0) > 0,
    },
    {
      label: t("dashboard.readGoldStandard"),
      href: "/manuals",
      done: manualRead,
    },
  ];

  const completed = steps.filter((s) => s.done).length;

  // Hide widget once manuals are marked as read (persists via localStorage)
  if (manualRead) return null;

  const handleMarkManualsRead = () => {
    localStorage.setItem(LS_MANUAL_READ, "1");
    setManualRead(true);
  };

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-100 text-primary-600">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{t("dashboard.gettingStarted")}</h3>
            <p className="text-sm text-gray-500">
              {t("dashboard.ofComplete", { completed, total: steps.length })}
            </p>
          </div>
        </div>
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

      {/* Mark all manuals as read CTA */}
      <div className="mt-4 pt-3 border-t">
        <button
          onClick={handleMarkManualsRead}
          className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
        >
          <BookOpen className="w-4 h-4" /> {t("dashboard.markManualsRead")}
        </button>
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
