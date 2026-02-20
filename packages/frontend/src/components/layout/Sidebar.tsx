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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";

const ownerNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/jobs", label: "Jobs", icon: ClipboardCheck },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/red-flags", label: "Red Flags", icon: Flag },
  { href: "/performance", label: "Performance", icon: BarChart3 },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/audit-log", label: "Audit Log", icon: ScrollText },
];

const cleanerNav = [
  { href: "/", label: "My Jobs", icon: ClipboardCheck },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, signOut } = useAuth();

  const nav = user?.role === "owner" ? ownerNav : cleanerNav;

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200 min-h-screen">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-primary-700">ScrubaDub</h1>
        <p className="text-sm text-gray-500 mt-1">{user?.companyName}</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
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
    </aside>
  );
}
