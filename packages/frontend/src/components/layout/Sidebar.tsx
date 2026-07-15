import { RefObject, useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useLocation, Link } from "wouter";
import {
  LogOut,
  ChevronDown,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";
import { adminSection, getNavSectionsForRole } from "./navigation";

const SECTIONS_STORAGE_KEY = "scrubadub.sidebar.sections";
const DEFAULT_SECTIONS: Record<string, boolean> = { "nav.dashboard": true };

function loadSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old keys (plain English titles) to new i18n keys
      const migrated: Record<string, boolean> = {};
      const migration: Record<string, string> = {
        Dashboard: "nav.dashboard",
        Hub: "nav.hub",
        Company: "nav.company",
        Admin: "nav.admin",
      };
      for (const [key, val] of Object.entries(parsed)) {
        migrated[migration[key] ?? key] = val as boolean;
      }
      return migrated;
    }
  } catch {
    // ignore corrupt data
  }
  return DEFAULT_SECTIONS;
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
      >
        {title}
        <ChevronDown
          aria-hidden="true"
          className={clsx(
            "w-3.5 h-3.5 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>
      {isOpen && <div className="space-y-1">{children}</div>}
    </div>
  );
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  triggerRef?: RefObject<HTMLButtonElement>;
}

export function Sidebar({ mobileOpen = false, onMobileClose, triggerRef }: SidebarProps) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(loadSections);

  // Persist section state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(openSections));
    } catch {
      // storage full or unavailable
    }
  }, [openSections]);

  const isSuperAdmin = user?.isSuperadmin === true;

  const sections = getNavSectionsForRole(user?.role);

  const toggleSection = (titleKey: string) => {
    setOpenSections((prev) => ({ ...prev, [titleKey]: !prev[titleKey] }));
  };

  const handleNavClick = useCallback(() => {
    // Auto-close sidebar on mobile after navigation
    if (window.innerWidth < 768 && onMobileClose) {
      onMobileClose();
    }
  }, [onMobileClose]);

  const sidebarContent = (
    <>
      <div className="p-6 border-b border-gray-200">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <img src="/logo-icon.png" alt="SCRUB" className="w-10 h-10" />
          <img src="/logo-word.png" alt="SCRUB" className="h-12 w-auto" />
        </Link>
        <p className="text-sm text-gray-500 mt-1">{user?.companyName || (user?.role === "affiliate" ? "Affiliate Program" : "")}</p>
      </div>

      <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
        {sections.map((section) => (
          <CollapsibleSection
            key={section.titleKey}
            title={t(section.titleKey)}
            isOpen={!!openSections[section.titleKey]}
            onToggle={() => toggleSection(section.titleKey)}
          >
            {section.items.map((item) => {
              const isActive =
                item.href === "/"
                  ? location === "/"
                  : location.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon aria-hidden="true" className="w-5 h-5" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </CollapsibleSection>
        ))}
        {isSuperAdmin && (
          <CollapsibleSection
            title={t(adminSection.titleKey)}
            isOpen={!!openSections[adminSection.titleKey]}
            onToggle={() => toggleSection(adminSection.titleKey)}
          >
            {adminSection.items.map((item) => {
              const isActive =
                item.href === "/admin"
                  ? location === "/admin"
                  : location.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon aria-hidden="true" className="w-5 h-5" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </CollapsibleSection>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium text-sm">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.name}
            </p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label={t("auth.signOut")}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title={t("auth.signOut")}
          >
            <LogOut aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — always visible at md+ */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200 min-h-screen">
        {sidebarContent}
      </aside>

      <Dialog.Root open={mobileOpen} onOpenChange={(open) => !open && onMobileClose?.()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 md:hidden" />
          <Dialog.Content
            id="mobile-navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white shadow-xl focus:outline-none md:hidden"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              triggerRef?.current?.focus();
            }}
          >
            <Dialog.Title className="sr-only">{t("nav.openNavigation")}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t("nav.closeNavigation")}
                className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </Dialog.Close>
            {sidebarContent}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
