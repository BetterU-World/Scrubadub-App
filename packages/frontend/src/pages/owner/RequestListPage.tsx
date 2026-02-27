import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { LeadsHeader } from "@/components/ui/LeadsHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Inbox, Calendar, MapPin } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "converted", label: "Converted" },
  { value: "archived", label: "Archived" },
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function RequestListPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("");

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
        {STATUS_OPTIONS.map((opt) => (
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
          title="No requests"
          description={
            statusFilter
              ? "No requests match this filter."
              : "Requests from your public link will appear here."
          }
          action={
            !statusFilter && (
              <Link href="/site" className="btn-primary">
                Share your booking link
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
