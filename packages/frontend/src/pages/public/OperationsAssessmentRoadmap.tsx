import { useTranslation } from "react-i18next";
type L = { en: string; es: string };
type Item = {
  id: string;
  sectionKey: string;
  title: L;
  currentState: L;
  targetState: L;
  whyItMatters: L;
  recommendedActions: L[];
  successIndicators: L[];
  sequencing?: L;
  scrubSupport?: L;
};
export type AssessmentRoadmap = {
  roadmapVersion: number;
  stageOrder: string[];
  stages: Record<string, Item[]>;
};
export function OperationsAssessmentRoadmap({
  roadmap,
}: {
  roadmap: AssessmentRoadmap;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === "es" ? "es" : "en";
  const text = (x: L) => x[lang];
  return (
    <section aria-labelledby="growth-roadmap-heading">
      <h2
        id="growth-roadmap-heading"
        className="text-3xl font-bold text-gray-900"
      >
        {t("assessment.report.roadmap")}
      </h2>
      <p className="mt-3 max-w-3xl leading-7 text-gray-600">
        {t("assessment.roadmap.introduction")}
      </p>
      <div className="mt-8 space-y-10">
        {roadmap.stageOrder.map((stage, index) => (
          <section key={stage} aria-labelledby={`roadmap-${stage}`}>
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-semibold text-primary-700">
                {index + 1}
              </span>
              <h3
                id={`roadmap-${stage}`}
                className="text-2xl font-bold text-gray-900"
              >
                {t(`assessment.roadmap.stages.${stage}.title`)}
              </h3>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {t(`assessment.roadmap.stages.${stage}.description`)}
            </p>
            {roadmap.stages[stage]?.length ? (
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                {roadmap.stages[stage].map((item, order) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-gray-200 bg-white p-6 print:break-inside-avoid"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                      {t("assessment.roadmap.priority", { number: order + 1 })}
                    </p>
                    <h4 className="mt-2 text-xl font-semibold text-gray-900">
                      {text(item.title)}
                    </h4>
                    <dl className="mt-5 space-y-4">
                      <div>
                        <dt className="text-sm font-semibold text-gray-900">
                          {t("assessment.roadmap.current")}
                        </dt>
                        <dd className="mt-1 leading-6 text-gray-700">
                          {text(item.currentState)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-semibold text-gray-900">
                          {t("assessment.roadmap.target")}
                        </dt>
                        <dd className="mt-1 leading-6 text-gray-700">
                          {text(item.targetState)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-semibold text-gray-900">
                          {t("assessment.roadmap.why")}
                        </dt>
                        <dd className="mt-1 leading-6 text-gray-700">
                          {text(item.whyItMatters)}
                        </dd>
                      </div>
                    </dl>
                    <h5 className="mt-5 font-semibold text-gray-900">
                      {t("assessment.roadmap.actions")}
                    </h5>
                    <ul className="mt-2 list-disc space-y-2 pl-5 text-gray-700">
                      {item.recommendedActions.map((x, i) => (
                        <li key={i}>{text(x)}</li>
                      ))}
                    </ul>
                    <h5 className="mt-5 font-semibold text-gray-900">
                      {t("assessment.roadmap.success")}
                    </h5>
                    <ul className="mt-2 list-disc space-y-2 pl-5 text-gray-700">
                      {item.successIndicators.map((x, i) => (
                        <li key={i}>{text(x)}</li>
                      ))}
                    </ul>
                    {item.sequencing && (
                      <p className="mt-5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
                        {text(item.sequencing)}
                      </p>
                    )}
                    {item.scrubSupport && (
                      <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-500">
                        {text(item.scrubSupport)}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                {t("assessment.roadmap.sparse")}
              </p>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
