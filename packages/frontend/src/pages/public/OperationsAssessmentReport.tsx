import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { OperationsAssessmentRoadmap, type AssessmentRoadmap } from "./OperationsAssessmentRoadmap";

type Localized = { en: string; es: string };
type Finding = { id: string; sectionKey: string; title: Localized; observation: Localized; whyItMatters: Localized; readiness: string };
export type AssessmentReport = {
  reportVersion: number; generatedAt: number; operationsScore: number; maturityKey: string; confidenceKey: string;
  executiveSummary: Localized[];
  scorecard: Array<{ sectionKey: string; score: number; statusKey: string; title: Localized; interpretation: Localized; observations: number }>;
  strengths: Finding[]; opportunities: Finding[];
  roadmap: { status: string; message: Localized };
};

export function OperationsAssessmentReport({ report, roadmap }: { report: AssessmentReport; roadmap: AssessmentRoadmap }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === "es" ? "es" : "en";
  const heading = useRef<HTMLHeadingElement>(null);
  const text = (value: Localized) => value[language];
  useEffect(() => { heading.current?.focus(); }, []);
  const date = new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", { dateStyle: "long" }).format(report.generatedAt);
  return <main className="mx-auto max-w-5xl space-y-12 pb-16 print:bg-white">
    <header className="border-b border-gray-200 pb-8">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">{t("assessment.report.identity")}</p>
      <h1 ref={heading} tabIndex={-1} className="mt-3 text-3xl font-bold text-gray-900 outline-none sm:text-5xl">{t("assessment.report.title")}</h1>
      <p className="mt-3 text-sm text-gray-500">{t("assessment.report.completed", { date })} · {t("assessment.report.version", { version: report.reportVersion })}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric label={t("assessment.completion.score")} value={`${report.operationsScore} / 100`} />
        <Metric label={t("assessment.completion.maturity")} value={t(`assessment.maturity.${report.maturityKey}`)} />
        <Metric label={t("assessment.completion.confidence")} value={t(`assessment.confidence.${report.confidenceKey}`)} />
      </div>
    </header>
    <ReportSection title={t("assessment.report.executiveSummary")}><div className="space-y-4 text-base leading-7 text-gray-700">{report.executiveSummary.map((paragraph, index) => <p key={index}>{text(paragraph)}</p>)}</div></ReportSection>
    <ReportSection title={t("assessment.report.scorecard")}><div className="grid gap-4 md:grid-cols-2">{report.scorecard.map((item) => <article key={item.sectionKey} className="rounded-2xl border border-gray-200 bg-white p-5"><div className="flex items-start justify-between gap-4"><h3 className="font-semibold text-gray-900">{text(item.title)}</h3><span className="font-bold text-gray-900">{item.score}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200" role="img" aria-label={t("assessment.report.scoreAria", { section: text(item.title), score: item.score })}><div className="h-full bg-primary-600" style={{ width: `${item.score}%` }} /></div><p className="mt-3 text-sm font-medium text-primary-800">{t(`assessment.report.bands.${item.statusKey}`)}</p><p className="mt-2 text-sm leading-6 text-gray-600">{text(item.interpretation)}.</p></article>)}</div></ReportSection>
    <Findings title={t("assessment.report.strengths")} empty={t("assessment.report.emptyStrengths")} findings={report.strengths} text={text} />
    <Findings title={t("assessment.report.opportunities")} empty={t("assessment.report.emptyOpportunities")} findings={report.opportunities} text={text} />
    <OperationsAssessmentRoadmap roadmap={roadmap} />
    <ReportSection title={t("assessment.report.nextSteps")}><p className="leading-7 text-gray-700">{t("assessment.report.nextCopy")}</p></ReportSection>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-xl font-bold text-gray-900">{value}</p></div>; }
function ReportSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h2 className="text-2xl font-bold text-gray-900">{title}</h2><div className="mt-5">{children}</div></section>; }
function Findings({ title, empty, findings, text }: { title: string; empty: string; findings: Finding[]; text: (value: Localized) => string }) { return <ReportSection title={title}>{findings.length ? <div className="grid gap-4 md:grid-cols-2">{findings.map((item) => <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-6"><h3 className="text-lg font-semibold text-gray-900">{text(item.title)}</h3><p className="mt-3 leading-7 text-gray-700">{text(item.observation)}</p><p className="mt-3 text-sm leading-6 text-gray-600">{text(item.whyItMatters)}</p></article>)}</div> : <p className="rounded-2xl bg-gray-50 p-5 text-gray-600">{empty}</p>}</ReportSection>; }
