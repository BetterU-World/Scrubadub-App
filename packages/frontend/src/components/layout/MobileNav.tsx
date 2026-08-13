import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";
import { Ellipsis } from "lucide-react";
import {
  getMobileNavItemsForRole,
  getMoreNavItemsForRole,
  isMoreNavActive,
  isNavItemActive,
} from "./navigation";

interface MobileNavProps {
  menuOpen: boolean;
  onMoreOpen: (trigger: HTMLButtonElement) => void;
}

export function MobileNav({ menuOpen, onMoreOpen }: MobileNavProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();

  const capabilities = [
    user?.canManageClients === true,
    user?.canManageSalesAndCommercial === true,
    user?.canManageTeam === true,
    user?.canManageDocuments === true,
    user?.canViewFinancials === true,
    user?.canManageInvoices === true,
    user?.canViewAnalytics === true,
  ] as const;
  const nav = getMobileNavItemsForRole(user?.role, user?.canManageBusinessConfiguration === true, user?.canManageSchedule === true, ...capabilities);
  const hasMoreItems =
    getMoreNavItemsForRole(
      user?.role,
      user?.canManageBusinessConfiguration === true,
      user?.canManageSchedule === true,
      ...capabilities,
    ).length > 0 || user?.isSuperadmin === true;
  const moreIsActive = isMoreNavActive(
    location,
    user?.role,
    user?.canManageBusinessConfiguration === true,
    user?.isSuperadmin === true,
    user?.canManageSchedule === true,
    ...capabilities,
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-[var(--safe-area-bottom)] md:hidden">
      <div className="flex h-[var(--mobile-nav-height)] gap-1 px-2 py-2">
        {nav.map((item) => {
          const isActive = isNavItemActive(item, location);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={clsx(
                "flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1 text-xs",
                isActive ? "text-primary-600" : "text-gray-500"
              )}
            >
              <item.icon aria-hidden="true" className="w-5 h-5" />
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
        {hasMoreItems && (
          <button
            type="button"
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
            aria-current={moreIsActive ? "page" : undefined}
            onClick={(event) => onMoreOpen(event.currentTarget)}
            className={clsx(
              "flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1 text-xs",
              moreIsActive ? "text-primary-600" : "text-gray-500"
            )}
          >
            <Ellipsis aria-hidden="true" className="h-5 w-5" />
            <span className="max-w-full truncate">{t("nav.more")}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
