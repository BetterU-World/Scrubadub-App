import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { OwnerGettingStarted } from "@/components/owner/OwnerOnboarding";
import { OwnerGuideLink } from "@/components/owner/OwnerGuideLink";

const linkClass = "inline-flex min-h-11 items-center text-sm font-medium text-primary-700 underline underline-offset-4";

export function OwnerLearningLinks() {
  const { t } = useTranslation();

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <OwnerGettingStarted surface="learningCenter" />
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
