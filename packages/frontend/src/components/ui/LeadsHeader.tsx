import { useLocation, Link } from "wouter";
import { List, Kanban } from "lucide-react";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";

export function LeadsHeader() {
  const [location] = useLocation();
  const { t } = useTranslation();

  const views = [
    { href: "/requests", label: t("requests.listView"), icon: List },
    { href: "/requests/pipeline", label: t("requests.pipelineView"), icon: Kanban },
  ] as const;

  return (
    <div className="mb-6 flex w-full min-w-0 max-w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold text-gray-900">{t("requests.leads")}</h1>
        <p className="mt-1 break-words text-sm text-gray-500">
          {t("guidance.owner.requests")}
        </p>
      </div>
      <div className="grid w-full min-w-0 max-w-full grid-cols-2 overflow-hidden rounded-lg border border-gray-200 sm:flex sm:w-auto sm:flex-shrink-0">
        {views.map((v) => {
          const isActive =
            v.href === "/requests"
              ? location === "/requests"
              : location.startsWith(v.href);
          return (
            <Link
              key={v.href}
              href={v.href}
              className={clsx(
                "touch-target flex min-w-0 items-center justify-center gap-1.5 px-2 text-center text-sm font-medium transition-colors sm:px-3",
                isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <v.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{v.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
