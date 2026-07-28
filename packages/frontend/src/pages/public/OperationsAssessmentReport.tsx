import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { OperationsAssessmentRoadmap, type AssessmentRoadmap } from "./OperationsAssessmentRoadmap";
import { AssessmentContinuity } from "./AssessmentContinuity";

type Localized = { en: string; es: string };
type Finding = { id: string; sectionKey: string; title: Localized; observation: Localized; whyItMatters: Localized; readiness: string };
type ExecutiveDiagnosis = {
  headline: Localized;
  summary: Localized;
  strongestArea: { sectionKey: string; title: Localized; whyPreserve: Localized };
  priorityArea: { sectionKey: string; title: Localized; observation: Localized };
};
export type AssessmentReport = {
  reportVersion: number; generatedAt: number; operationsScore: number; maturityKey: string; confidenceKey: string;
  executiveDiagnosis?: ExecutiveDiagnosis;
  executiveSummary: Localized[];
  scorecard: Array<{ sectionKey: string; score: number; statusKey: string; title: Localized; interpretation: Localized; observations: number }>;
  strengths: Finding[]; opportunities: Finding[];
  roadmap: { status: string; message: Localized };
};

export function OperationsAssessmentReport({ report, roadmap, attemptId, capability }: { report: AssessmentReport; roadmap: AssessmentRoadmap; attemptId?: string; capability?: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === "es" ? "es" : "en";
  const heading = useRef<HTMLHeadingElement>(null);
  const text = (value: Localized) => value[language];
  useEffect(() => { heading.current?.focus(); }, []);
  const date = new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", { dateStyle: "long" }).format(report.generatedAt);
  const diagnosisHeadline = report.executiveDiagnosis?.headline ?? report.executiveSummary[1] ?? report.executiveSummary[0];
  const diagnosisSummary = report.executiveDiagnosis?.summary ?? report.executiveSummary[2] ?? report.executiveSummary[0];
  const hasNow = Boolean(roadmap.stages.now?.length);
  const followOnStages = ["next", "later"].filter((stage) => roadmap.stages[stage]?.length);
  const hasFollowOn = Boolean(followOnStages.length);
  const hasMaintain = Boolean(roadmap.stages.maintain?.length);

  return <main className="mx-auto max-w-5xl space-y-14 pb-16 print:bg-white">
    <header className="border-b border-gray-200 pb-8 print:border-gray-400">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">{t("assessment.report.identity")}</p>
      <h1 ref={heading} tabIndex={-1} className="mt-3 text-3xl font-bold text-gray-900 outline-none sm:text-5xl">{t("assessment.report.title")}</h1>
      <p className="mt-3 text-sm text-gray-500">{t("assessment.report.completed", { date })} · {t("assessment.report.version", { version: report.reportVersion })}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric label={t("assessment.completion.score")} value={`${report.operationsScore} / 100`} description={t("assessment.report.metricExplanations.score")} />
        <Metric label={t("assessment.completion.maturity")} value={t(`assessment.maturity.${report.maturityKey}`)} description={t("assessment.report.metricExplanations.stage")} />
        <Metric label={t("assessment.completion.confidence")} value={t(`assessment.confidence.${report.confidenceKey}`)} description={t(`assessment.report.confidenceExplanations.${report.confidenceKey}`)} />
      </div>
    </header>

    <ReportSection title={t("assessment.report.executiveDiagnosis")}>
      <div className="rounded-3xl bg-primary-50 p-6 sm:p-8 print:border print:border-gray-300 print:bg-white">
        <p className="text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">{text(diagnosisHeadline)}</p>
        <p className="mt-4 max-w-3xl text-base leading-7 text-gray-700">{text(diagnosisSummary)}</p>
        {report.executiveDiagnosis && <div className="mt-6 grid gap-4 border-t border-primary-100 pt-6 sm:grid-cols-2 print:border-gray-300">
          <DiagnosisFact label={t("assessment.report.strongestFoundation")} value={text(report.executiveDiagnosis.strongestArea.title)} />
          <DiagnosisFact label={t("assessment.report.firstPriority")} value={text(report.executiveDiagnosis.priorityArea.title)} />
        </div>}
      </div>
    </ReportSection>

    {hasNow && <ReportSection title={t("assessment.report.startHere")} intro={t("assessment.report.startHereCopy")}>
      <OperationsAssessmentRoadmap roadmap={roadmap} stages={["now"]} showHeading={false} />
    </ReportSection>}

    <ReportSection title={t("assessment.report.scorecard")} intro={t("assessment.report.scorecardCopy")}>
      <div className="grid gap-4 md:grid-cols-2">
        {report.scorecard.map((item) => <article key={item.sectionKey} className="rounded-2xl border border-gray-200 bg-white p-5 print:break-inside-avoid">
          <div className="flex items-start justify-between gap-4"><h3 className="font-semibold text-gray-900">{text(item.title)}</h3><span className="font-bold text-gray-900">{item.score}</span></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200" role="img" aria-label={t("assessment.report.scoreAria", { section: text(item.title), score: item.score })}><div className="h-full bg-primary-600" style={{ width: `${item.score}%` }} /></div>
          <p className="mt-3 text-sm font-medium text-primary-800">{t(`assessment.report.bands.${item.statusKey}`)}</p>
          <p className="mt-2 text-sm leading-6 text-gray-600">{text(item.interpretation)}.</p>
        </article>)}
      </div>
    </ReportSection>

    {hasFollowOn && <ReportSection title={t("assessment.report.whatComesNext")} intro={t("assessment.roadmap.introduction")}>
      <OperationsAssessmentRoadmap roadmap={roadmap} stages={followOnStages} showHeading={false} />
    </ReportSection>}

    <ReportSection title={t("assessment.report.strengthsToProtect")} intro={t("assessment.report.strengthsToProtectCopy")}>
      {hasMaintain
        ? <OperationsAssessmentRoadmap roadmap={roadmap} stages={["maintain"]} showHeading={false} />
        : report.executiveDiagnosis
          ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 print:border-gray-300 print:bg-white">
              <h3 className="text-lg font-semibold text-gray-900">{text(report.executiveDiagnosis.strongestArea.title)}</h3>
              <p className="mt-3 leading-7 text-gray-700">{text(report.executiveDiagnosis.strongestArea.whyPreserve)}</p>
            </div>
          : <p className="rounded-2xl bg-gray-50 p-5 text-gray-600">{t("assessment.report.emptyStrengths")}</p>}
    </ReportSection>

    <AssessmentContinuity attemptId={attemptId} capability={capability} />
  </main>;
}

function Metric({ label, value, description }: { label: string; value: string; description: string }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 print:break-inside-avoid">
    <p className="text-sm font-medium text-gray-600">{label}</p>
    <p className="mt-2 text-xl font-bold text-gray-900">{value}</p>
    <p className="mt-2 text-xs leading-5 text-gray-500">{description}</p>
  </div>;
}
function DiagnosisFact({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{label}</p><p className="mt-1 font-semibold text-gray-900">{value}</p></div>;
}
function ReportSection({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return <section>
    <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
    {intro && <p className="mt-2 max-w-3xl leading-7 text-gray-600">{intro}</p>}
    <div className="mt-5">{children}</div>
  </section>;
}
