import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "wouter";
import { Bell, CheckCheck } from "lucide-react";

export function NotificationsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const notifications = useQuery(
    api.queries.notifications.list,
    user ? { userId: user._id } : "skip"
  );
  const markAsRead = useMutation(api.mutations.notifications.markAsRead);
  const markAllAsRead = useMutation(api.mutations.notifications.markAllAsRead);
  const markReadUpTo = useMutation(api.mutations.notifications.markReadUpTo);

  // Auto-mark notifications as read after they render (delayed so user sees them)
  const autoMarkRef = useRef(false);
  useEffect(() => {
    if (autoMarkRef.current || !user || !notifications || notifications.length === 0) return;
    const hasUnread = notifications.some((n) => !n.read);
    if (!hasUnread) return;
    // notifications are sorted desc by _creationTime; first item is the latest
    const latestTs = notifications[0]._creationTime;
    const timer = setTimeout(() => {
      autoMarkRef.current = true;
      markReadUpTo({ userId: user._id, seenThroughTs: latestTs });
    }, 1000);
    return () => clearTimeout(timer);
  }, [user, notifications, markReadUpTo]);

  if (!user || notifications === undefined) return <PageLoader />;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title={t("notifications.title")}
        description={unreadCount > 0 ? t("notifications.unreadCount", { count: unreadCount }) : t("notifications.allCaughtUp")}
        action={
          unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead({ userId: user._id })}
              className="btn-secondary flex items-center gap-2"
            >
              <CheckCheck className="w-4 h-4" /> {t("notifications.markAllRead")}
            </button>
          )
        }
      />

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title={t("notifications.noNotifications")} description={t("notifications.allCaughtUpDesc")} />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n._id}
              onClick={() => {
                if (!n.read) markAsRead({ notificationId: n._id, userId: user._id });
              }}
              className={`card cursor-pointer transition-all duration-500 ease-out ${
                n.read ? "opacity-60 border-transparent bg-white" : "border-primary-200 bg-primary-50/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 transition-opacity duration-500 ease-out ${n.read ? "opacity-0" : "opacity-100 bg-primary-500"}`} />
                <div className="flex-1">
                  <p className="font-medium text-sm">{n.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(n._creationTime).toLocaleString()}
                  </p>
                </div>
                {n.relatedJobId && (
                  <Link href={user.role === "manager" ? `/manager/jobs/${n.relatedJobId}` : `/jobs/${n.relatedJobId}`} className="text-xs text-primary-600 hover:text-primary-700 whitespace-nowrap">
                      {t("notifications.viewJob")}
                  </Link>
                )}
                {n.relatedClientRequestId && user.role !== "manager" && (
                  <Link href={`/requests/${n.relatedClientRequestId}`} className="text-xs text-primary-600 hover:text-primary-700 whitespace-nowrap">
                      {t("notifications.viewRequest")}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
