import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "wouter";
import { Bell, CheckCheck } from "lucide-react";

export function NotificationsPage() {
  const { user } = useAuth();
  const notifications = useQuery(
    api.queries.notifications.list,
    user ? { userId: user._id } : "skip"
  );
  const markAsRead = useMutation(api.mutations.notifications.markAsRead);
  const markAllAsRead = useMutation(api.mutations.notifications.markAllAsRead);

  if (!user || notifications === undefined) return <PageLoader />;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        action={
          unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead({ userId: user._id })}
              className="btn-secondary flex items-center gap-2"
            >
              <CheckCheck className="w-4 h-4" /> Mark all read
            </button>
          )
        }
      />

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n._id}
              onClick={() => {
                if (!n.read) markAsRead({ notificationId: n._id, userId: user._id });
              }}
              className={`card cursor-pointer transition-colors ${
                n.read ? "opacity-60" : "border-primary-200 bg-primary-50/20"
              }`}
            >
              <div className="flex items-start gap-3">
                {!n.read && <div className="w-2 h-2 rounded-full bg-primary-500 mt-2 flex-shrink-0" />}
                <div className="flex-1">
                  <p className="font-medium text-sm">{n.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(n._creationTime).toLocaleString()}
                  </p>
                </div>
                {n.relatedJobId && (
                  <Link href={`/jobs/${n.relatedJobId}`} className="text-xs text-primary-600 hover:text-primary-700 whitespace-nowrap">
                      View Job
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
