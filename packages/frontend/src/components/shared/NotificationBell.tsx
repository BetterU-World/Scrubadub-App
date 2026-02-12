import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Bell } from "lucide-react";

export function NotificationBell() {
  const { user } = useAuth();
  const count = useQuery(
    api.queries.notifications.unreadCount,
    user ? { userId: user._id } : "skip"
  );

  return (
    <Link href="/notifications">
      <a className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 relative">
        <Bell className="w-5 h-5" />
        {count !== undefined && count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </a>
    </Link>
  );
}
