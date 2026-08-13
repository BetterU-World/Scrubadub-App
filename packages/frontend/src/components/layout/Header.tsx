import { Menu, LogOut } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { useTranslation } from "react-i18next";

interface HeaderProps {
  onMenuToggle?: (trigger: HTMLButtonElement) => void;
  menuOpen?: boolean;
}

export function Header({ onMenuToggle, menuOpen = false }: HeaderProps) {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <header className="flex min-w-0 max-w-full items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={(event) => onMenuToggle?.(event.currentTarget)}
          aria-label={menuOpen ? t("nav.closeNavigation") : t("nav.openNavigation")}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          className="touch-target rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 md:hidden"
        >
          <Menu aria-hidden="true" className="w-5 h-5" />
        </button>
        <Link href="/" className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80 md:hidden">
          <img src="/logo-icon.png" alt="SCRUB" className="w-8 h-8" />
          <img src="/logo-word.png" alt="SCRUB" className="h-9 min-w-0 w-auto max-w-full" />
        </Link>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <LanguageSwitcher />
        <NotificationBell />
        <button
          type="button"
          onClick={signOut}
          aria-label={t("auth.signOut")}
          className="touch-target rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 md:hidden"
          title={t("auth.signOut")}
        >
          <LogOut aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
