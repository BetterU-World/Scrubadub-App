import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { LeadsHeader } from "@/components/ui/LeadsHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Inbox, Calendar, MapPin, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTimeAgo } from "@/hooks/useTimeAgo";

export function RequestListPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();
  const [statusFilter, setStatusFilter] = useState("");

  const statusOptions = [
    { value: "", label: t("requests.all") },
    { value: "new", label: t("status.new") },
    { value: "contacted", label: t("status.contacted") },
    { value: "accepted", label: t("status.accepted") },
    { value: "declined", label: t("status.declined") },
    { value: "converted", label: t("status.converted") },
    { value: "archived", label: t("status.archived") },
  ];

  const requests = useQuery(
    api.queries.clientRequests.getCompanyRequests,
    user?.companyId
      ? {
          companyId: user.companyId,
          userId: user._id,
          status: (statusFilter as any) || undefined,
        }
      : "skip"
  );

  if (!user || requests === undefined) return <PageLoader />;

  const sorted = [...requests].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <LeadsHeader />

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={
              statusFilter === opt.value
                ? "badge bg-primary-100 text-primary-800 cursor-pointer"
                : "badge bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200"
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t("requests.noRequests")}
          description={
            statusFilter
              ? t("requests.noRequestsFilter")
              : t("requests.noRequestsEmpty")
          }
          action={
            !statusFilter && (
              <Link href="/site" className="btn-primary">
                {t("requests.shareBookingLink")}
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((req) => (
            <Link
              key={req._id}
              href={`/requests/${req._id}`}
              className="card block hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">
                      {req.requesterName}
                    </h3>
                    <StatusBadge status={req.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                    {(req.propertySnapshot?.address) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {req.propertySnapshot.address}
                      </span>
                    )}
                    {req.requestedDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {req.requestedDate}
                      </span>
                    )}
                    {(req as any).requestedService && (
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        {(req as any).requestedService}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {timeAgo(req.createdAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
