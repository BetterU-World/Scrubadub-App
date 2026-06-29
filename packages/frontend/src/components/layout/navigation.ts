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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  mobile?: boolean;
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
      { href: "/", labelKey: "nav.overview", icon: LayoutDashboard, mobile: true },
      { href: "/properties", labelKey: "nav.properties", icon: Building2 },
      { href: "/inventory-templates", labelKey: "nav.inventoryTemplates", icon: Package },
      { href: "/employees", labelKey: "nav.employees", icon: Users },
      { href: "/jobs", labelKey: "nav.jobs", icon: ClipboardCheck, mobile: true },
      { href: "/calendar", labelKey: "nav.calendar", icon: Calendar, mobile: true },
      { href: "/red-flags", labelKey: "nav.redFlags", icon: Flag, mobile: true },
      { href: "/performance", labelKey: "nav.performance", icon: BarChart3 },
      { href: "/analytics", labelKey: "nav.analytics", icon: TrendingUp },
      { href: "/partners", labelKey: "nav.partners", icon: Handshake },
    ],
  },
  {
    titleKey: "nav.hub",
    items: [
      { href: "/requests", labelKey: "nav.requests", icon: Inbox },
      { href: "/clients", labelKey: "nav.clients", icon: Users },
      { href: "/commercial-accounts", labelKey: "nav.commercialAccounts", icon: Briefcase },
      { href: "/commercial-invoices", labelKey: "nav.commercialInvoices", icon: Receipt },
      { href: "/feedback", labelKey: "nav.feedback", icon: MessageSquare },
      { href: "/cleaner-leads", labelKey: "nav.cleanerLeads", icon: UserPlus },
      { href: "/owner/payments", labelKey: "nav.payments", icon: Banknote },
      { href: "/affiliate", labelKey: "nav.affiliate", icon: Share2, mobile: true },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell, mobile: true },
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

export const managerSections: NavSection[] = [
  {
    titleKey: "nav.dashboard",
    items: [
      { href: "/", labelKey: "nav.overview", icon: LayoutDashboard, mobile: true },
      { href: "/jobs", labelKey: "nav.jobs", icon: ClipboardCheck, mobile: true },
      { href: "/red-flags", labelKey: "nav.redFlags", icon: Flag },
      { href: "/calendar", labelKey: "nav.calendar", icon: Calendar, mobile: true },
    ],
  },
  {
    titleKey: "nav.hub",
    items: [
      { href: "/affiliate", labelKey: "nav.affiliate", icon: Share2 },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell, mobile: true },
    ],
  },
  {
    titleKey: "nav.company",
    items: [
      { href: "/manuals", labelKey: "nav.manuals", icon: BookOpen },
    ],
  },
];

export const affiliateSections: NavSection[] = [
  {
    titleKey: "nav.hub",
    items: [
      { href: "/affiliate", labelKey: "nav.affiliate", icon: Share2, mobile: true },
    ],
  },
];

export const workerSections: NavSection[] = [
  {
    titleKey: "nav.dashboard",
    items: [
      { href: "/", labelKey: "nav.home", icon: LayoutDashboard, mobile: true },
      { href: "/jobs", labelKey: "nav.jobs", icon: ClipboardCheck, mobile: true },
      { href: "/calendar", labelKey: "nav.calendar", icon: Calendar, mobile: true },
      { href: "/availability", labelKey: "nav.availability", icon: Clock, mobile: true },
    ],
  },
  {
    titleKey: "nav.hub",
    items: [
      { href: "/payments", labelKey: "nav.payments", icon: Banknote, mobile: true },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell, mobile: true },
    ],
  },
  {
    titleKey: "nav.company",
    items: [
      { href: "/manuals", labelKey: "nav.manuals", icon: BookOpen, mobile: true },
      { href: "/settings", labelKey: "nav.settings", icon: Settings, mobile: true },
    ],
  },
];

export const adminSection: NavSection = {
  titleKey: "nav.admin",
  items: [
    { href: "/admin", labelKey: "nav.admin", icon: Shield },
    { href: "/admin/affiliates", labelKey: "nav.affiliateInvites", icon: UserPlus },
  ],
};

export function getNavSectionsForRole(role?: string): NavSection[] {
  switch (role as NavigationRole | undefined) {
    case "owner":
      return ownerSections;
    case "manager":
      return managerSections;
    case "affiliate":
      return affiliateSections;
    default:
      return workerSections;
  }
}

export function getMobileNavItemsForRole(role?: string): NavItem[] {
  return getNavSectionsForRole(role).flatMap((section) =>
    section.items.filter((item) => item.mobile)
  );
}
