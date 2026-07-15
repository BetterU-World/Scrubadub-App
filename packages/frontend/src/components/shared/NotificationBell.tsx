import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

export function NotificationBell() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const count = useQuery(
    api.queries.notifications.unreadCount,
    user ? { userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  );

  return (
    <Link
      href="/notifications"
      aria-label={t("nav.notifications")}
      className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
    >
        <Bell aria-hidden="true" className="w-5 h-5" />
        {count !== undefined && count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
    </Link>
  );
}
