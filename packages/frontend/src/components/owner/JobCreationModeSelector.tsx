import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export function JobCreationModeSelector({ mode }: { mode: "standard" | "quick" }) {
  const { t } = useTranslation();
  return <nav aria-label={t("quick.creationMode")} className="mb-4 flex flex-wrap gap-2">
    {(["standard", "quick"] as const).map(value => {
      const active = mode === value;
      return <Link key={value} href={value === "standard" ? "/jobs/new" : "/jobs/quick"}
        aria-current={active ? "page" : undefined}
        className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${active ? "border-primary-600 bg-primary-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
        {t(value === "standard" ? "quick.standardJob" : "quick.quickJob")}
      </Link>;
    })}
  </nav>;
}
