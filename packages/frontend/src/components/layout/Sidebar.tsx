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
  Receipt,
  BookOpen,
  Handshake,
  Inbox,
  Globe,
  UserPlus,
  Share2,
  MessageSquare,
  Kanban,
  ChevronDown,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const ownerSections: NavSection[] = [
  {
    title: "Dashboard",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/properties", label: "Properties", icon: Building2 },
      { href: "/employees", label: "Employees", icon: Users },
      { href: "/jobs", label: "Jobs", icon: ClipboardCheck },
      { href: "/calendar", label: "Calendar", icon: Calendar },
      { href: "/red-flags", label: "Red Flags", icon: Flag },
      { href: "/performance", label: "Performance", icon: BarChart3 },
      { href: "/analytics", label: "Analytics", icon: TrendingUp },
      { href: "/partners", label: "Partners", icon: Handshake },
    ],
  },
  {
    title: "Hub",
    items: [
      { href: "/requests", label: "Requests", icon: Inbox },
      { href: "/requests/pipeline", label: "Pipeline", icon: Kanban },
      { href: "/feedback", label: "Feedback", icon: MessageSquare },
      { href: "/cleaner-leads", label: "Cleaner Leads", icon: UserPlus },
      { href: "/affiliate", label: "Affiliate", icon: Share2 },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Company",
    items: [
      { href: "/site", label: "My Site", icon: Globe },
      { href: "/manuals", label: "Manuals", icon: BookOpen },
      { href: "/audit-log", label: "Audit Log", icon: ScrollText },
      { href: "/owner/settlements", label: "Settlements", icon: Receipt },
      { href: "/owner/settings", label: "Settings", icon: Settings },
    ],
  },
];

const workerSections: NavSection[] = [
  {
    title: "Dashboard",
    items: [
      { href: "/", label: "My Jobs", icon: ClipboardCheck },
      { href: "/calendar", label: "Calendar", icon: Calendar },
      { href: "/availability", label: "My Availability", icon: Clock },
    ],
  },
  {
    title: "Hub",
    items: [
      { href: "/affiliate", label: "Affiliate", icon: Share2 },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Company",
    items: [
      { href: "/manuals", label: "Manuals", icon: BookOpen },
    ],
  },
];

const SECTIONS_STORAGE_KEY = "scrubadub.sidebar.sections";
const DEFAULT_SECTIONS: Record<string, boolean> = { Dashboard: true };

function loadSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
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

  const sections = user?.role === "owner" ? ownerSections : workerSections;

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
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
        <h1 className="text-xl font-bold text-primary-700">ScrubaDub</h1>
        <p className="text-sm text-gray-500 mt-1">{user?.companyName}</p>
      </div>

      <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
        {sections.map((section) => (
          <CollapsibleSection
            key={section.title}
            title={section.title}
            isOpen={!!openSections[section.title]}
            onToggle={() => toggleSection(section.title)}
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
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </CollapsibleSection>
        ))}
        {isSuperAdmin && (
          <CollapsibleSection
            title="Admin"
            isOpen={!!openSections["Admin"]}
            onToggle={() => toggleSection("Admin")}
          >
            <Link
              href="/admin"
              onClick={handleNavClick}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                location.startsWith("/admin")
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Shield className="w-5 h-5" />
              Admin
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
            title="Sign out"
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
