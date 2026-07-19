import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";
import { getMobileNavItemsForRole } from "./navigation";

export function MobileNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();

  const nav = getMobileNavItemsForRole(user?.role, user?.canManageBusinessConfiguration === true);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-[var(--safe-area-bottom)] md:hidden">
      <div className="flex h-[var(--mobile-nav-height)] justify-around gap-1 overflow-x-auto px-2 py-2">
        {nav.map((item) => {
          const isActive =
            item.href === "/"
              ? location === "/"
              : location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex min-w-[4.5rem] flex-col items-center gap-1 px-2 py-1 text-xs",
                isActive ? "text-primary-600" : "text-gray-500"
              )}
            >
              <item.icon className="w-5 h-5" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
