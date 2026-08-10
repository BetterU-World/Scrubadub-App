import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  ClipboardCheck,
  Flag,
  Bell,
  Briefcase,
  ScrollText,
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
  Clock,
  Banknote,
  Package,
  Receipt,
  Tags,
  ClipboardList,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  mobile?: boolean;
  mobileOrder?: number;
  activePrefixes?: string[];
}

export interface NavSection {
  titleKey: string;
  items: NavItem[];
}

type NavigationRole = "owner" | "manager" | "affiliate" | "worker";

export const ownerSections: NavSection[] = [
  {
    titleKey: "nav.dashboard",
    items: [
      { href: "/", labelKey: "nav.overview", icon: LayoutDashboard, mobile: true, mobileOrder: 1 },
      { href: "/properties", labelKey: "nav.properties", icon: Building2, mobile: true, mobileOrder: 4 },
      { href: "/inventory-templates", labelKey: "nav.inventoryTemplates", icon: Package },
      { href: "/employees", labelKey: "nav.employees", icon: Users },
      { href: "/jobs", labelKey: "nav.jobs", icon: ClipboardCheck, mobile: true, mobileOrder: 2 },
      { href: "/jobs/requests", labelKey: "nav.jobRequests", icon: ClipboardList },
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
      { href: "/requests", labelKey: "nav.requests", icon: Inbox, mobile: true, mobileOrder: 3 },
      { href: "/clients", labelKey: "nav.clients", icon: Users },
      { href: "/commercial-accounts", labelKey: "nav.commercialAccounts", icon: Briefcase },
      { href: "/commercial-invoices", labelKey: "nav.commercialInvoices", icon: Receipt },
      { href: "/feedback", labelKey: "nav.feedback", icon: MessageSquare },
      { href: "/cleaner-leads", labelKey: "nav.cleanerLeads", icon: UserPlus },
      {
        href: "/owner/payments",
        labelKey: "nav.payments",
        icon: Banknote,
        activePrefixes: ["/owner/cleaner-payments", "/owner/settlements"],
      },
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
      { href: "/owner/settings/add-ons", labelKey: "nav.addOns", icon: Tags },
      { href: "/owner/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
];

export const managerSections: NavSection[] = [
  {
    titleKey: "nav.dashboard",
    items: [
      { href: "/", labelKey: "nav.overview", icon: LayoutDashboard, mobile: true, mobileOrder: 1 },
      { href: "/jobs", labelKey: "nav.jobs", icon: ClipboardCheck, mobile: true, mobileOrder: 2 },
      { href: "/jobs/requests", labelKey: "nav.jobRequests", icon: ClipboardList },
      { href: "/red-flags", labelKey: "nav.redFlags", icon: Flag, mobile: true, mobileOrder: 4 },
      { href: "/calendar", labelKey: "nav.calendar", icon: Calendar, mobile: true, mobileOrder: 3 },
    ],
  },
  {
    titleKey: "nav.hub",
    items: [
      { href: "/affiliate", labelKey: "nav.affiliate", icon: Share2 },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
    ],
  },
  {
    titleKey: "nav.company",
    items: [
      { href: "/manuals", labelKey: "nav.manuals", icon: BookOpen },
      { href: "/owner/settings/add-ons", labelKey: "nav.addOns", icon: Tags },
    ],
  },
];

export const affiliateSections: NavSection[] = [
  {
    titleKey: "nav.hub",
    items: [
      { href: "/affiliate", labelKey: "nav.affiliate", icon: Share2 },
    ],
  },
];

export const workerSections: NavSection[] = [
  {
    titleKey: "nav.dashboard",
    items: [
      { href: "/", labelKey: "nav.home", icon: LayoutDashboard, mobile: true, mobileOrder: 1 },
      { href: "/jobs", labelKey: "nav.jobs", icon: ClipboardCheck, mobile: true, mobileOrder: 2 },
      { href: "/calendar", labelKey: "nav.calendar", icon: Calendar },
      { href: "/availability", labelKey: "nav.availability", icon: Clock, mobile: true, mobileOrder: 3 },
    ],
  },
  {
    titleKey: "nav.hub",
    items: [
      { href: "/payments", labelKey: "nav.payments", icon: Banknote },
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

export const adminSection: NavSection = {
  titleKey: "nav.admin",
  items: [
    { href: "/admin", labelKey: "nav.admin", icon: Shield },
    { href: "/admin/assessments", labelKey: "nav.assessmentResults", icon: ClipboardList },
    { href: "/admin/affiliates", labelKey: "nav.affiliateInvites", icon: UserPlus },
  ],
};

export function getNavSectionsForRole(role?: string, canManageConfiguration = false, canManageSchedule = false): NavSection[] {
  let sections: NavSection[];
  switch (role as NavigationRole | undefined) {
    case "owner":
      sections = ownerSections;
      break;
    case "manager":
      sections = managerSections;
      break;
    case "affiliate":
      sections = affiliateSections;
      break;
    default:
      sections = workerSections;
  }
  if (role !== "manager") return sections;
  return sections.map((section) => ({ ...section, items: section.items.filter((item) => (canManageConfiguration || item.href !== "/owner/settings/add-ons") && (canManageSchedule || (item.href !== "/jobs/requests" && item.href !== "/calendar"))) }));
}

export function getMobileNavItemsForRole(role?: string, canManageConfiguration = false, canManageSchedule = false): NavItem[] {
  return getNavSectionsForRole(role, canManageConfiguration, canManageSchedule).flatMap((section) =>
    section.items.filter((item) => item.mobile)
  ).sort((a, b) => (a.mobileOrder ?? 0) - (b.mobileOrder ?? 0));
}

export function getMoreNavItemsForRole(role?: string, canManageConfiguration = false, canManageSchedule = false): NavItem[] {
  return getNavSectionsForRole(role, canManageConfiguration, canManageSchedule).flatMap((section) =>
    section.items.filter((item) => !item.mobile)
  );
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/jobs" && pathname.startsWith("/jobs/requests")) return false;
  return [item.href, ...(item.activePrefixes ?? [])].some((prefix) =>
    matchesPathPrefix(pathname, prefix)
  );
}

export function isMoreNavActive(
  pathname: string,
  role?: string,
  canManageConfiguration = false,
  isSuperadmin = false
): boolean {
  const mobileItems = getMobileNavItemsForRole(role, canManageConfiguration);
  if (mobileItems.some((item) => isNavItemActive(item, pathname))) return false;

  const moreItems = getMoreNavItemsForRole(role, canManageConfiguration);
  if (moreItems.some((item) => isNavItemActive(item, pathname))) return true;

  return isSuperadmin && adminSection.items.some((item) => isNavItemActive(item, pathname));
}
