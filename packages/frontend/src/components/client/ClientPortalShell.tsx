import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronDown, Menu } from "lucide-react";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

const routes = [
  { href: "/client/home", key: "home" },
  { href: "/client/services", key: "services" },
  { href: "/client/documents", key: "documents" },
  { href: "/client/billing", key: "billing" },
  { href: "/client/locations", key: "locations" },
  { href: "/client/account", key: "account" },
] as const;

function ClientPortalNavigation({ mobile = false }: { mobile?: boolean }) {
  const { t } = useTranslation();
  const [pathname] = useLocation();
  return (
    <nav aria-label={t("clientPortal.navigationLabel")} className={mobile ? "grid gap-1 p-2" : "flex flex-wrap gap-1 pb-3"}>
      {routes.map((route) => {
        const active = pathname === route.href;
        return (
          <Link
            key={route.href}
            href={route.href}
            aria-current={active ? "page" : undefined}
            className={`touch-target rounded-lg px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              active ? "bg-primary-50 text-primary-800" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {t(`clientPortal.navigation.${route.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}

export function ClientPortalShell({
  children,
  clientName,
  onSignOut,
  pageTitle,
  contentClassName = "max-w-6xl",
}: {
  children: ReactNode;
  clientName?: string;
  onSignOut?: () => void;
  pageTitle?: string;
  contentClassName?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh overflow-x-hidden bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className={`mx-auto ${contentClassName} px-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 sm:py-4">
            <Link href="/client/home" className="touch-target flex min-w-0 flex-1 items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 sm:flex-none" aria-label={t("clientPortal.homeLabel")}>
              <img src="/logo-icon.png" alt="" className="h-9 w-9" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-gray-900">{t("clientPortal.title")}</p>
                {clientName && <p className="break-words text-sm text-gray-500">{clientName}</p>}
              </div>
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <LanguageSwitcher />
              {onSignOut && <button type="button" onClick={onSignOut} className="btn-secondary touch-target text-sm">{t("auth.signOut")}</button>}
            </div>
          </div>
          <div className="hidden sm:block"><ClientPortalNavigation /></div>
          <details className="group pb-3 sm:hidden">
            <summary className="touch-target flex cursor-pointer list-none items-center justify-between rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500">
              <span className="flex min-w-0 items-center gap-2"><Menu className="h-4 w-4" aria-hidden="true" /><span className="break-words">{pageTitle ?? t("clientPortal.menu")}</span></span>
              <ChevronDown className="h-4 w-4 flex-none transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-2 rounded-lg border border-gray-200 bg-white shadow-sm"><ClientPortalNavigation mobile /></div>
          </details>
        </div>
      </header>
      <div className={`mx-auto ${contentClassName}`}>{children}</div>
    </div>
  );
}
