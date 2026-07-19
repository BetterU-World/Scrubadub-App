import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Home } from "lucide-react";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

type NavigationItem = {
  href: string;
  label: string;
};

export function ClientPortalShell({
  children,
  clientName,
  onSignOut,
  navigation = [],
  contentClassName = "max-w-6xl",
}: {
  children: ReactNode;
  clientName?: string;
  onSignOut?: () => void;
  navigation?: NavigationItem[];
  contentClassName?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className={`mx-auto ${contentClassName} px-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 sm:py-4">
            <Link
              href="/client/home"
              className="touch-target flex min-w-0 flex-1 items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 sm:flex-none"
              aria-label={t("clientPortal.homeLabel")}
            >
              <img src="/logo-icon.png" alt="" className="h-9 w-9" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-gray-900">{t("clientPortal.title")}</p>
                {clientName && <p className="break-words text-sm text-gray-500">{clientName}</p>}
              </div>
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <LanguageSwitcher />
              {onSignOut && (
                <button type="button" onClick={onSignOut} className="btn-secondary touch-target text-sm">
                  {t("auth.signOut")}
                </button>
              )}
            </div>
          </div>

          {navigation.length > 0 && (
            <nav aria-label={t("clientPortal.sectionNavigation")} className="-mx-1 flex gap-1 overflow-x-auto pb-3">
              {navigation.map((item, index) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(event) => {
                    const target = document.querySelector(item.href);
                    if (!target) return;
                    event.preventDefault();
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                    window.history.replaceState(null, "", item.href);
                  }}
                  className="touch-target inline-flex flex-none items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {index === 0 && <Home className="h-4 w-4" aria-hidden="true" />}
                  {item.label}
                </a>
              ))}
            </nav>
          )}
        </div>
      </header>

      <div className={`mx-auto ${contentClassName}`}>{children}</div>
    </div>
  );
}
