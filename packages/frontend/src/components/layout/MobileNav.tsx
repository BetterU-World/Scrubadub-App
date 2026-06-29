import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  ClipboardCheck,
  Flag,
  Bell,
  Share2,
  Clock,
  Banknote,
  BookOpen,
  Settings,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";

const ownerMobileNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: ClipboardCheck },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/red-flags", label: "Flags", icon: Flag },
  { href: "/affiliate", label: "Affiliate", icon: Share2 },
  { href: "/notifications", label: "Alerts", icon: Bell },
];

const managerMobileNav = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: ClipboardCheck },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/notifications", label: "Alerts", icon: Bell },
];

const affiliateMobileNav = [
  { href: "/affiliate", label: "Affiliate", icon: Share2 },
];

const workerMobileNav = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: ClipboardCheck },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/availability", label: "Availability", icon: Clock },
  { href: "/payments", label: "Payments", icon: Banknote },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/manuals", label: "Manuals", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  const nav = user?.role === "owner"
    ? ownerMobileNav
    : user?.role === "manager"
      ? managerMobileNav
      : user?.role === "affiliate"
        ? affiliateMobileNav
        : workerMobileNav;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex justify-around gap-1 overflow-x-auto px-2 py-2">
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
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
