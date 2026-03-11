import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  ClipboardCheck,
  Flag,
  Bell,
  ScrollText,
  LogOut,
  BarChart3,
  TrendingUp,
  Shield,
  Settings,
  BookOpen,
  Handshake,
  Inbox,
  Globe,
  UserPlus,
  Share2,
  MessageSquare,
  ChevronDown,
  Clock,
  Banknote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

const ownerSections: NavSection[] = [
  {
    titleKey: "nav.dashboard",
    items: [
      { href: "/", labelKey: "nav.overview", icon: LayoutDashboard },
      { href: "/properties", labelKey: "nav.properties", icon: Building2 },
      { href: "/employees", labelKey: "nav.employees", icon: Users },
      { href: "/jobs", labelKey: "nav.jobs", icon: ClipboardCheck },
      { href: "/calendar", labelKey: "nav.calendar", icon: Calendar },
      { href: "/red-flags", labelKey: "nav.redFlags", icon: Flag },
      { href: "/performance", labelKey: "nav.performance", icon: BarChart3 },
      { href: "/analytics", labelKey: "nav.analytics", icon: TrendingUp },
      { href: "/partners", labelKey: "nav.partners", icon: Handshake },
    ],
  },
  {
    titleKey: "nav.hub",
    items: [
      { href: "/requests", labelKey: "nav.requests", icon: Inbox },
      { href: "/feedback", labelKey: "nav.feedback", icon: MessageSquare },
      { href: "/cleaner-leads", labelKey: "nav.cleanerLeads", icon: UserPlus },
      { href: "/owner/payments", labelKey: "nav.payments", icon: Banknote },
      { href: "/affiliate", labelKey: "nav.affiliate", icon: Share2 },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
    ],
  },
  {
    titleKey: "nav.company",
    items: [
      { href: "/site", labelKey: "nav.mySite", icon: Globe },
      { href: "/manuals", labelKey: "nav.manuals", icon: BookOpen },
      { href: "/audit-log", labelKey: "nav.auditLog", icon: ScrollText },
      { href: "/owner/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
];

const managerSections: NavSection[] = [
  {
    titleKey: "nav.dashboard",
    items: [
      { href: "/", labelKey: "nav.overview", icon: LayoutDashboard },
    ],
  },
  {
    titleKey: "nav.hub",
    items: [
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
    ],
  },
  {
    titleKey: "nav.company",
    items: [
      { href: "/manuals", labelKey: "nav.manuals", icon: BookOpen },
    ],
  },
];

const workerSections: NavSection[] = [
  {
    titleKey: "nav.dashboard",
    items: [
      { href: "/", labelKey: "nav.myJobs", icon: ClipboardCheck },
      { href: "/calendar", labelKey: "nav.calendar", icon: Calendar },
      { href: "/availability", labelKey: "nav.myAvailability", icon: Clock },
    ],
  },
  {
    titleKey: "nav.hub",
    items: [
      { href: "/payments", labelKey: "nav.payments", icon: Banknote },
      { href: "/affiliate", labelKey: "nav.affiliate", icon: Share2 },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
    ],
  },
  {
    titleKey: "nav.company",
    items: [
      { href: "/manuals", labelKey: "nav.manuals", icon: BookOpen },
      { href: "/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
];

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
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
      >
        {title}
        <ChevronDown
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
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
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

  const isSuperAdmin = useQuery(
    api.queries.admin.isSuperAdmin,
    user?._id ? { userId: user._id } : "skip"
  );

  const sections = user?.role === "owner"
    ? ownerSections
    : user?.role === "manager"
      ? managerSections
      : workerSections;

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
        <div className="flex items-center gap-2">
          <img src="/favicon-96x96.png" alt="SCRUB" className="w-7 h-7" />
          <h1 className="text-2xl font-extrabold text-primary-700 font-logo tracking-[0.06em]">SCRUB</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">{user?.companyName}</p>
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
                  <item.icon className="w-5 h-5" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </CollapsibleSection>
        ))}
        {isSuperAdmin && (
          <CollapsibleSection
            title={t("nav.admin")}
            isOpen={!!openSections["nav.admin"]}
            onToggle={() => toggleSection("nav.admin")}
          >
            <Link
              href="/admin"
              onClick={handleNavClick}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150",
                location.startsWith("/admin")
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Shield className="w-5 h-5" />
              {t("nav.admin")}
            </Link>
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
            onClick={signOut}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title={t("auth.signOut")}
          >
            <LogOut className="w-4 h-4" />
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

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onMobileClose}
          />
          <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 z-50 flex flex-col md:hidden">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
