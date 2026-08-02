import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle,
  Circle,
  ClipboardCheck,
  Clock,
  Flag,
  Rocket,
  Users,
  Wrench,
} from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/ui/PageHeader";
import type {
  OwnerDashboardInteractionMode,
  OwnerDashboardMetric,
  OwnerDashboardMetricKey,
  OwnerDashboardViewModel,
} from "./ownerDashboardViewModel";

interface OwnerDashboardPresentationProps {
  model: OwnerDashboardViewModel;
  interactionMode: OwnerDashboardInteractionMode;
  onMarkManualsRead?: () => void;
}

const metricPresentation: Record<OwnerDashboardMetricKey, { icon: LucideIcon; labelKey: string }> = {
  properties: { icon: Building2, labelKey: "dashboard.properties" },
  teamMembers: { icon: Users, labelKey: "dashboard.teamMembers" },
  activeJobs: { icon: ClipboardCheck, labelKey: "dashboard.activeJobs" },
  openRedFlags: { icon: Flag, labelKey: "dashboard.openRedFlags" },
  awaitingApproval: { icon: Clock, labelKey: "dashboard.awaitingApproval" },
  openMaintenance: { icon: Wrench, labelKey: "dashboard.openMaintenance" },
};

export function OwnerDashboardPresentation({
  model,
  interactionMode,
  onMarkManualsRead,
}: OwnerDashboardPresentationProps) {
  const { t } = useTranslation();
  const production = interactionMode === "production";

  return (
    <div data-owner-dashboard-presentation>
      <PageHeader
        title={t("dashboard.welcomeBack", { name: model.viewer.firstName })}
        description={model.viewer.companyName}
      />

      {model.onboarding && (
        <GettingStartedCard
          onboarding={model.onboarding}
          interactionMode={interactionMode}
          onMarkManualsRead={onMarkManualsRead}
        />
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {model.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} interactionMode={interactionMode} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="upcoming-jobs-heading">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 id="upcoming-jobs-heading" className="font-semibold text-gray-900">
              {t("dashboard.upcomingJobs")}
            </h3>
            {production && (
              <Link href="/jobs" className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700">
                {t("common.viewAll")} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          {model.upcomingJobs.length > 0 ? (
            <div className="space-y-3">
              {model.upcomingJobs.map((job) => {
                const content = (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{job.propertyName}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {job.scheduleLabel} · {t(`jobTypes.${job.type}`, job.type.replace(/_/g, " "))}
                      </p>
                    </div>
                    <span className="badge flex-shrink-0 bg-blue-100 text-xs capitalize text-blue-800">
                      {job.status.replace(/_/g, " ")}
                    </span>
                  </div>
                );

                return production && job.destination ? (
                  <Link
                    key={job.id}
                    href={job.destination}
                    className="block rounded-lg border border-gray-100 p-3 transition-colors hover:border-primary-200 hover:bg-primary-50/30"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={job.id} className="rounded-lg border border-gray-100 p-3">
                    {content}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t("dashboard.noUpcomingJobs")}</p>
          )}
        </section>

        <section className="card" aria-labelledby="recent-red-flags-heading">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 id="recent-red-flags-heading" className="font-semibold text-gray-900">
              {t("dashboard.recentRedFlags")}
            </h3>
            {production && (
              <Link href="/red-flags" className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700">
                {t("common.viewAll")} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          {model.recentRedFlags.length > 0 ? (
            <div className="space-y-3">
              {model.recentRedFlags.map((flag) => (
                <div key={flag.id} className="rounded-lg border border-red-100 bg-red-50/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{flag.note}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {flag.category} · {flag.severity}
                      </p>
                    </div>
                    <span className="badge flex-shrink-0 bg-red-100 text-xs capitalize text-red-800">
                      {flag.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t("dashboard.noOpenRedFlags")}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function GettingStartedCard({
  onboarding,
  interactionMode,
  onMarkManualsRead,
}: {
  onboarding: NonNullable<OwnerDashboardViewModel["onboarding"]>;
  interactionMode: OwnerDashboardInteractionMode;
  onMarkManualsRead?: () => void;
}) {
  const { t } = useTranslation();
  const production = interactionMode === "production";

  return (
    <section className="card mb-6" aria-labelledby="getting-started-heading">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary-100 p-2 text-primary-600">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h3 id="getting-started-heading" className="font-semibold text-gray-900">
              {t("dashboard.gettingStarted")}
            </h3>
            <p className="text-sm text-gray-500">
              {t("dashboard.ofComplete", { completed: onboarding.completed, total: onboarding.total })}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 h-1.5 w-full rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-primary-500 transition-all"
          style={{ width: `${(onboarding.completed / onboarding.total) * 100}%` }}
        />
      </div>

      <div className="space-y-1">
        {onboarding.steps.map((step) => {
          const content = (
            <>
              {step.completed ? (
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-primary-500" />
              ) : (
                <Circle className="h-5 w-5 flex-shrink-0 text-gray-300" />
              )}
              <span className={`text-sm ${step.completed ? "text-gray-400 line-through" : "font-medium text-gray-700"}`}>
                {t(step.labelKey)}
              </span>
            </>
          );

          return production && step.destination ? (
            <Link key={step.id} href={step.destination} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-gray-50">
              {content}
            </Link>
          ) : (
            <div key={step.id} className="flex items-center gap-3 rounded-lg p-2">
              {content}
            </div>
          );
        })}
      </div>

      {production && onMarkManualsRead && (
        <div className="mt-4 border-t pt-3">
          <button onClick={onMarkManualsRead} className="btn-primary flex w-full items-center justify-center gap-2 text-sm">
            <BookOpen className="h-4 w-4" /> {t("dashboard.markManualsRead")}
          </button>
        </div>
      )}
    </section>
  );
}

function MetricCard({ metric, interactionMode }: { metric: OwnerDashboardMetric; interactionMode: OwnerDashboardInteractionMode }) {
  const { t } = useTranslation();
  const presentation = metricPresentation[metric.key];
  const Icon = presentation.icon;
  const content = (
    <div className="flex items-center gap-3">
      <div
        className={`rounded-lg p-2 ${
          metric.tone === "danger"
            ? "bg-red-100 text-red-600"
            : metric.tone === "warning"
              ? "bg-amber-100 text-amber-600"
              : "bg-primary-100 text-primary-600"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
        <p className="text-sm text-gray-500">{t(presentation.labelKey)}</p>
      </div>
    </div>
  );

  return interactionMode === "production" && metric.destination ? (
    <Link href={metric.destination} className="card block cursor-pointer transition-shadow hover:shadow-md">
      {content}
    </Link>
  ) : (
    <div className="card" data-demo-static-card>
      {content}
    </div>
  );
}
