import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { OwnerGuideLink } from "@/components/owner/OwnerGuideLink";

const linkClass = "inline-flex min-h-11 items-center text-sm font-medium text-primary-700 underline underline-offset-4";

export function OwnerLearningLinks() {
  const { t } = useTranslation();

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <section id="getting-started" className="card scroll-mt-4 sm:col-span-2">
        <h2 className="text-lg font-semibold">{t("learningCenter.gettingStarted")}</h2>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link className="btn-primary touch-target" href="/jobs/quick">{t("learningCenter.schedule")}</Link>
          <Link className="btn-secondary touch-target" href="/employees?invite=true">{t("learningCenter.invite")}</Link>
          <Link className="btn-secondary touch-target" href="/properties/new">{t("learningCenter.property")}</Link>
        </div>
        <Link href="/jobs/new" className={linkClass}>{t("learningCenter.fullScheduling")}</Link>
      </section>
      <section className="card min-w-0">
        <h2 className="text-lg font-semibold">{t("learningCenter.explore")}</h2>
        <ul>
          <li><Link href="/calendar" className={linkClass}>{t("learningCenter.calendar")}</Link></li>
          <li><Link href="/jobs" className={linkClass}>{t("learningCenter.jobs")}</Link></li>
          {import.meta.env.VITE_ENABLE_DEMO_MODE === "true" && (
            <li><a href="/showcase" className={linkClass}>{t("learningCenter.showcase")}</a></li>
          )}
        </ul>
      </section>
      <section className="card min-w-0">
        <h2 className="text-lg font-semibold">{t("learningCenter.support")}</h2>
        <ul>
          <li><OwnerGuideLink topic="troubleshooting" /></li>
          <li><Link href="/contact" className={linkClass}>{t("learningCenter.contact")}</Link></li>
        </ul>
      </section>
    </div>
  );
}
