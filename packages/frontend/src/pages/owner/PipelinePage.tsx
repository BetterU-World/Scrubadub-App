import { Link } from "wouter";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { LeadsHeader } from "@/components/ui/LeadsHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Inbox,
  MapPin,
  Calendar,
  Clock,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

const STAGES = [
  { value: "new", label: "New", color: "bg-blue-50 border-blue-200" },
  { value: "contacted", label: "Contacted", color: "bg-indigo-50 border-indigo-200" },
  { value: "quoted", label: "Quoted", color: "bg-yellow-50 border-yellow-200" },
  { value: "won", label: "Won", color: "bg-green-50 border-green-200" },
  { value: "lost", label: "Lost", color: "bg-gray-50 border-gray-200" },
] as const;

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

function FollowUpBadge({ nextFollowUpAt }: { nextFollowUpAt: number }) {
  const now = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  if (nextFollowUpAt <= now) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 rounded-full px-2 py-0.5">
        <AlertCircle className="w-3 h-3" /> Overdue
      </span>
    );
  }
  if (nextFollowUpAt <= todayEnd.getTime()) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
        <Clock className="w-3 h-3" /> Today
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
      <Calendar className="w-3 h-3" />
      {new Date(nextFollowUpAt).toLocaleDateString()}
    </span>
  );
}

function FollowUpsWidget({ userId }: { userId: any }) {
  const followUps = useQuery(
    api.queries.clientRequests.listFollowUps,
    { userId, limit: 5 }
  );

  if (!followUps || followUps.length === 0) return null;

  return (
    <div className="card mb-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-gray-500" />
        Upcoming Follow-ups
      </h3>
      <div className="space-y-2">
        {followUps.map((req) => (
          <Link
            key={req._id}
            href={`/requests/${req._id}`}
            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {req.requesterName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {req.propertySnapshot?.address || "No address"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <FollowUpBadge nextFollowUpAt={(req as any).nextFollowUpAt} />
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function PipelinePage() {
  const { user } = useAuth();

  const allRequests = useQuery(
    api.queries.clientRequests.listRequestsForPipeline,
    user ? { userId: user._id } : "skip"
  );

  if (!user || allRequests === undefined) return <PageLoader />;

  // Group by stage
  const byStage: Record<string, typeof allRequests> = {};
  for (const stage of STAGES) {
    byStage[stage.value] = [];
  }
  for (const req of allRequests) {
    const stage = (req as any).leadStage ?? "new";
    if (byStage[stage]) {
      byStage[stage].push(req);
    }
  }

  return (
    <div>
      <LeadsHeader />

      <FollowUpsWidget userId={user._id} />

      {allRequests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests yet"
          description="Requests from your public booking link will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {STAGES.map((stage) => {
            const items = byStage[stage.value];
            return (
              <div key={stage.value}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {stage.label}
                  </h3>
                  <span className="badge bg-gray-100 text-gray-600">
                    {items.length}
                  </span>
                </div>
                <div className={`rounded-xl border p-2 ${stage.color} min-h-[120px] space-y-2`}>
                  {items.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">
                      No leads
                    </p>
                  ) : (
                    items.map((req) => (
                      <Link
                        key={req._id}
                        href={`/requests/${req._id}`}
                        className="block bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {req.requesterName}
                        </p>
                        {req.propertySnapshot?.address && (
                          <p className="flex items-center gap-1 text-xs text-gray-500 mt-1 truncate">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {req.propertySnapshot.address}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-400">
                            {timeAgo(req.createdAt)}
                          </span>
                          {(req as any).nextFollowUpAt && (
                            <FollowUpBadge
                              nextFollowUpAt={(req as any).nextFollowUpAt}
                            />
                          )}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
