import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { TableScrollRegion } from "@/components/ui/TableScrollRegion";
import { BarChart3, CheckCircle2, Clock3, Eye, Laptop, Mail, RotateCcw, Search, Sparkles, Target, Users } from "lucide-react";

type Localized = { en: string; es: string };
type Area = { sectionKey: string; title: Localized };
type Contact = {
  firstName?: string;
  businessName?: string;
  email: string;
  marketingConsent: boolean;
  scrubInterest: "interested" | "not_now" | "unspecified";
  deliveryStatus: "pending" | "delivered" | "failed";
};
type AssessmentResultRow = {
  attemptId: string;
  completedAt: number;
  language: "en" | "es";
  branchType: "solo" | "team";
  operationsScore: number;
  maturityKey: string;
  confidenceKey: "high" | "moderate" | "limited";
  strongestArea?: Area;
  priorityArea?: Area;
  nowPriorities: Area[];
  contact: Contact | null;
};

export function AssessmentResultsPage() {
  const { t, i18n } = useTranslation();
  const { user, sessionToken, isLoading } = useAuth();
  const canAccess = user?.isSuperadmin === true && Boolean(sessionToken);
  const data = useQuery(
    api.queries.assessmentAdmin.getAssessmentResults,
    canAccess ? { userId: user!._id, sessionToken } : "skip"
  );
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState<"all" | "solo" | "team">("all");
  const [interest, setInterest] = useState<"all" | "interested" | "captured" | "anonymous">("all");
  const language = i18n.resolvedLanguage === "es" ? "es" : "en";
  const areaText = (area?: Area) => area?.title?.[language] ?? t("assessmentAdmin.notAvailable");
  const dateLocale = language === "es" ? "es-US" : "en-US";

  const recent = (data?.recent ?? []) as AssessmentResultRow[];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return recent.filter((result) => {
      if (branch !== "all" && result.branchType !== branch) return false;
      if (interest === "interested" && result.contact?.scrubInterest !== "interested") return false;
      if (interest === "captured" && !result.contact) return false;
      if (interest === "anonymous" && result.contact) return false;
      if (!term) return true;
      return [
        result.contact?.firstName,
        result.contact?.businessName,
        result.contact?.email,
        result.strongestArea?.title.en,
        result.strongestArea?.title.es,
        result.priorityArea?.title.en,
        result.priorityArea?.title.es,
      ].some((value) => value?.toLowerCase().includes(term));
    });
  }, [recent, search, branch, interest]);

  if (isLoading || data === undefined) return <PageLoader />;
  if (!canAccess) return null;

  const stats = data.stats;
  const analytics = data.analytics;
  const duration = (milliseconds: number | null) => milliseconds === null
    ? t("assessmentAdmin.notAvailable")
    : t("assessmentAdmin.analytics.minutes", { count: Math.round(milliseconds / 6000) / 10 });
  return (
    <div className="min-w-0">
      <PageHeader
        title={t("assessmentAdmin.title")}
        description={t("assessmentAdmin.description")}
        back={{ href: "/admin", label: t("assessmentAdmin.backToAdmin") }}
      />

      {data.scanCapped && <div role="status" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t("assessmentAdmin.scanCapped")}</div>}

      <section aria-labelledby="assessment-overview-heading">
        <h2 id="assessment-overview-heading" className="sr-only">{t("assessmentAdmin.overview")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Users} label={t("assessmentAdmin.starts")} value={stats.starts} />
          <Metric icon={CheckCircle2} label={t("assessmentAdmin.completions")} value={stats.completions} detail={t("assessmentAdmin.completionRate", { rate: stats.completionRate })} />
          <Metric icon={BarChart3} label={t("assessmentAdmin.averageScore")} value={stats.averageScore ?? "—"} detail={t("assessmentAdmin.highConfidence", { rate: stats.highConfidenceRate })} />
          <Metric icon={Mail} label={t("assessmentAdmin.contactCaptured")} value={stats.contactCaptures} detail={t("assessmentAdmin.captureAndInterest", { rate: stats.contactCaptureRate, count: stats.scrubInterest })} />
        </div>
      </section>

      <div className="mt-8 space-y-6">
        <AnalyticsSection icon={BarChart3} title={t("assessmentAdmin.analytics.funnel")}>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AnalyticsFact label={t("assessmentAdmin.starts")} value={analytics.funnel.starts} />
            <AnalyticsFact label={t("assessmentAdmin.completions")} value={analytics.funnel.completions} detail={`${analytics.funnel.completionRate}%`} />
            <AnalyticsFact label={t("assessmentAdmin.analytics.abandoned")} value={analytics.funnel.abandoned} />
            <AnalyticsFact label={t("assessmentAdmin.analytics.inProgress")} value={analytics.funnel.inProgress} />
          </dl>
          {analytics.daily.length > 0 && <div className="mt-6 overflow-x-auto border-t border-gray-100 pt-5"><h3 className="mb-3 text-sm font-semibold text-gray-800">{t("assessmentAdmin.analytics.dailyActivity")}</h3><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-gray-500"><tr><th className="pb-2">{t("assessmentAdmin.analytics.day")}</th><th className="pb-2">{t("assessmentAdmin.starts")}</th><th className="pb-2">{t("assessmentAdmin.completions")}</th><th className="pb-2">{t("assessmentAdmin.analytics.rate")}</th></tr></thead><tbody className="divide-y divide-gray-100">{analytics.daily.map((row) => <tr key={row.day}><td className="py-2 font-medium text-gray-700">{row.day}</td><td>{row.starts}</td><td>{row.completions}</td><td>{row.completionRate}%</td></tr>)}</tbody></table></div>}
        </AnalyticsSection>

        <AnalyticsSection icon={Clock3} title={t("assessmentAdmin.analytics.completionBehavior")}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <dl className="grid grid-cols-2 gap-4">
              <AnalyticsFact label={t("assessmentAdmin.analytics.averageTime")} value={duration(analytics.completionBehavior.averageDurationMs)} />
              <AnalyticsFact label={t("assessmentAdmin.analytics.medianTime")} value={duration(analytics.completionBehavior.medianDurationMs)} />
            </dl>
            <div className="grid gap-5 sm:grid-cols-2">
              <RankedList title={t("assessmentAdmin.analytics.abandonmentQuestions")} rows={analytics.completionBehavior.abandonmentByQuestion.map((row) => ({ ...row, label: t(`assessment.questions.${row.key}.prompt`, { defaultValue: row.key }) }))} empty={t("assessmentAdmin.analytics.noTrackedData")} />
              <RankedList title={t("assessmentAdmin.analytics.abandonmentSections")} rows={analytics.completionBehavior.abandonmentBySection.map((row) => ({ ...row, label: t(`assessment.sections.${row.key}.title`, { defaultValue: row.key }) }))} empty={t("assessmentAdmin.analytics.noTrackedData")} />
            </div>
          </div>
        </AnalyticsSection>

        <div className="grid gap-6 xl:grid-cols-2">
          <AnalyticsSection icon={Laptop} title={t("assessmentAdmin.analytics.device")}>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-gray-500"><tr><th className="pb-3">{t("assessmentAdmin.analytics.device")}</th><th className="pb-3">{t("assessmentAdmin.starts")}</th><th className="pb-3">{t("assessmentAdmin.completions")}</th><th className="pb-3">{t("assessmentAdmin.analytics.rate")}</th></tr></thead><tbody className="divide-y divide-gray-100">{analytics.devices.map((row) => <tr key={row.deviceCategory}><td className="py-3 font-medium text-gray-800">{t(`assessmentAdmin.analytics.${row.deviceCategory}`)}</td><td>{row.starts}</td><td>{row.completions}</td><td>{row.completionRate}%</td></tr>)}</tbody></table></div>
          </AnalyticsSection>
          <AnalyticsSection icon={RotateCcw} title={t("assessmentAdmin.analytics.resumeReturn")}>
            <dl className="grid grid-cols-2 gap-4">
              <AnalyticsFact label={t("assessmentAdmin.analytics.resumed")} value={analytics.continuity.resumedAttempts} detail={t("assessmentAdmin.analytics.completedPercent", { rate: analytics.continuity.completedResumeRate })} />
              <AnalyticsFact label={t("assessmentAdmin.analytics.secureReturns")} value={analytics.continuity.secureReturnAttempts} detail={t("assessmentAdmin.analytics.completedPercent", { rate: analytics.continuity.secureReturnRate })} />
              <AnalyticsFact label={t("assessmentAdmin.analytics.averageSessions")} value={analytics.continuity.averageSessionsPerCompleted ?? t("assessmentAdmin.notAvailable")} detail={t("assessmentAdmin.analytics.trackedCompletions", { count: analytics.continuity.sessionTrackedCompletions })} />
            </dl>
          </AnalyticsSection>
        </div>

        <AnalyticsSection icon={Target} title={t("assessmentAdmin.analytics.scrubInterest")}>
          <dl className="grid gap-4 sm:grid-cols-3">
            <AnalyticsFact label={t("assessmentAdmin.analytics.ctaClicks")} value={analytics.conversion.ctaClickAttempts} detail={`${analytics.conversion.ctaClickThroughRate}% CTR`} />
            <AnalyticsFact label={t("assessmentAdmin.analytics.interestSubmissions")} value={analytics.conversion.interestSubmissions} detail={`${analytics.conversion.interestSubmissionRate}%`} />
            <AnalyticsFact label={t("assessmentAdmin.analytics.associatedInterest")} value={stats.scrubInterest} detail={t("assessmentAdmin.analytics.associatedInterestCopy")} />
          </dl>
        </AnalyticsSection>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <AreaSummary icon={Target} title={t("assessmentAdmin.commonPriorities")} areas={data.commonPriorityAreas} language={language} empty={t("assessmentAdmin.noCompleted")} />
        <AreaSummary icon={Sparkles} title={t("assessmentAdmin.commonStrengths")} areas={data.commonStrongestAreas} language={language} empty={t("assessmentAdmin.noCompleted")} />
      </div>

      <section className="mt-8" aria-labelledby="recent-assessments-heading">
        <div className="mb-4">
          <h2 id="recent-assessments-heading" className="text-xl font-bold text-gray-900">{t("assessmentAdmin.recentResults")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("assessmentAdmin.recentResultsCopy", { count: recent.length })}</p>
        </div>

        <div className="card mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="relative block">
            <span className="sr-only">{t("assessmentAdmin.search")}</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" aria-hidden="true" />
            <input className="input-field pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("assessmentAdmin.searchPlaceholder")} />
          </label>
          <label>
            <span className="sr-only">{t("assessmentAdmin.branchFilter")}</span>
            <select className="input-field min-w-36" value={branch} onChange={(event) => setBranch(event.target.value as typeof branch)}>
              <option value="all">{t("assessmentAdmin.allBranches")}</option>
              <option value="solo">{t("assessmentAdmin.solo")}</option>
              <option value="team">{t("assessmentAdmin.team")}</option>
            </select>
          </label>
          <label>
            <span className="sr-only">{t("assessmentAdmin.interestFilter")}</span>
            <select className="input-field min-w-40" value={interest} onChange={(event) => setInterest(event.target.value as typeof interest)}>
              <option value="all">{t("assessmentAdmin.allContacts")}</option>
              <option value="interested">{t("assessmentAdmin.interested")}</option>
              <option value="captured">{t("assessmentAdmin.contactCaptured")}</option>
              <option value="anonymous">{t("assessmentAdmin.anonymous")}</option>
            </select>
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="card text-center text-sm text-gray-500">{t("assessmentAdmin.noMatchingResults")}</div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filtered.map((result) => (
                <article key={result.attemptId} className="card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{result.contact?.businessName || result.contact?.firstName || t("assessmentAdmin.anonymous")}</p>
                      <p className="mt-1 text-xs text-gray-500">{new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" }).format(result.completedAt)}</p>
                    </div>
                    <span className="rounded-full bg-primary-50 px-3 py-1 text-sm font-bold text-primary-800">{result.operationsScore}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <ResultFact label={t("assessmentAdmin.firstPriority")} value={areaText(result.priorityArea)} />
                    <ResultFact label={t("assessmentAdmin.strongestArea")} value={areaText(result.strongestArea)} />
                    <ResultFact label={t("assessmentAdmin.branch")} value={t(`assessmentAdmin.${result.branchType}`)} />
                    <ResultFact label={t("assessmentAdmin.confidence")} value={t(`assessment.confidence.${result.confidenceKey}`)} />
                  </dl>
                  <Link href={`/admin/assessments/${result.attemptId}`} className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2">
                    <Eye className="h-4 w-4" aria-hidden="true" />{t("assessmentAdmin.viewReport")}
                  </Link>
                </article>
              ))}
            </div>

            <div className="card hidden p-0 md:block">
              <TableScrollRegion label={t("assessmentAdmin.resultsTableLabel")}>
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">{t("assessmentAdmin.completed")}</th>
                      <th className="px-4 py-3">{t("assessmentAdmin.business")}</th>
                      <th className="px-4 py-3">{t("assessmentAdmin.score")}</th>
                      <th className="px-4 py-3">{t("assessmentAdmin.operatingStage")}</th>
                      <th className="px-4 py-3">{t("assessmentAdmin.firstPriority")}</th>
                      <th className="px-4 py-3">{t("assessmentAdmin.contact")}</th>
                      <th className="px-4 py-3"><span className="sr-only">{t("assessmentAdmin.actions")}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((result) => (
                      <tr key={result.attemptId} className="align-top">
                        <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                          {new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(result.completedAt)}
                          <div className="mt-1 text-xs text-gray-400">{t(`assessmentAdmin.${result.branchType}`)} · {result.language.toUpperCase()}</div>
                        </td>
                        <td className="max-w-52 px-4 py-4">
                          <p className="truncate font-medium text-gray-900">{result.contact?.businessName || result.contact?.firstName || t("assessmentAdmin.anonymous")}</p>
                          {result.contact?.email && <p className="mt-1 truncate text-xs text-gray-500">{result.contact.email}</p>}
                        </td>
                        <td className="px-4 py-4 text-lg font-bold text-gray-900">{result.operationsScore}</td>
                        <td className="px-4 py-4 text-gray-700">{t(`assessment.maturity.${result.maturityKey}`)}<div className="mt-1 text-xs text-gray-500">{t(`assessment.confidence.${result.confidenceKey}`)} {t("assessmentAdmin.confidence").toLowerCase()}</div></td>
                        <td className="max-w-56 px-4 py-4 text-gray-700">{areaText(result.priorityArea)}</td>
                        <td className="px-4 py-4"><ContactBadge contact={result.contact} t={t} /></td>
                        <td className="px-4 py-4 text-right"><Link href={`/admin/assessments/${result.attemptId}`} className="font-semibold text-primary-700 hover:text-primary-900">{t("assessmentAdmin.view")}</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScrollRegion>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: number | string; detail?: string }) {
  return <div className="card">
    <div className="flex items-center gap-2 text-sm font-medium text-gray-500"><Icon className="h-4 w-4 text-primary-600" aria-hidden="true" />{label}</div>
    <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    {detail && <p className="mt-1 text-xs leading-5 text-gray-500">{detail}</p>}
  </div>;
}
function AnalyticsSection({ icon: Icon, title, children }: { icon: typeof Users; title: string; children: React.ReactNode }) {
  return <section className="card"><h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-gray-900"><Icon className="h-5 w-5 text-primary-600" aria-hidden="true" />{title}</h2>{children}</section>;
}
function AnalyticsFact({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt><dd className="mt-1 text-2xl font-bold text-gray-900">{value}</dd>{detail && <dd className="mt-1 text-xs text-gray-500">{detail}</dd>}</div>;
}
function RankedList({ title, rows, empty }: { title: string; rows: Array<{ key: string; label: string; count: number }>; empty: string }) {
  return <div><h3 className="text-sm font-semibold text-gray-800">{title}</h3>{rows.length ? <ol className="mt-3 space-y-2">{rows.map((row) => <li key={row.key} className="flex items-start justify-between gap-3 text-sm"><span className="text-gray-600">{row.label}</span><span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-700">{row.count}</span></li>)}</ol> : <p className="mt-3 text-sm text-gray-500">{empty}</p>}</div>;
}
function AreaSummary({ icon: Icon, title, areas, language, empty }: { icon: typeof Target; title: string; areas: Array<Area & { count: number }>; language: "en" | "es"; empty: string }) {
  return <section className="card">
    <h2 className="flex items-center gap-2 font-semibold text-gray-900"><Icon className="h-4 w-4 text-primary-600" aria-hidden="true" />{title}</h2>
    {areas.length ? <ol className="mt-4 space-y-3">{areas.map((area) => <li key={area.sectionKey} className="flex items-center justify-between gap-4 text-sm"><span className="text-gray-700">{area.title[language]}</span><span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-700">{area.count}</span></li>)}</ol> : <p className="mt-4 text-sm text-gray-500">{empty}</p>}
  </section>;
}
function ResultFact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-gray-500">{label}</dt><dd className="mt-1 text-gray-800">{value}</dd></div>;
}
function ContactBadge({ contact, t }: { contact: Contact | null; t: (key: string) => string }) {
  if (!contact) return <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{t("assessmentAdmin.anonymous")}</span>;
  if (contact.scrubInterest === "interested") return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">{t("assessmentAdmin.interested")}</span>;
  return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{t("assessmentAdmin.captured")}</span>;
}
