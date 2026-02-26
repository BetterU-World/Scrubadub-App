import { useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import {
  Send,
  X,
  Copy,
  CheckCircle,
  Clock,
  XCircle,
  ArrowLeft,
} from "lucide-react";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPeriodKey(periodStart: number): string {
  const d = new Date(periodStart);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    submitted: "bg-purple-100 text-purple-800",
    approved: "bg-teal-100 text-teal-800",
    denied: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-800",
    completed: "bg-green-100 text-green-800",
    open: "bg-yellow-100 text-yellow-800",
    locked: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-800"}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function statusIcon(status: string) {
  switch (status) {
    case "submitted":
      return <Clock className="h-5 w-5 text-purple-500" />;
    case "approved":
      return <CheckCircle className="h-5 w-5 text-teal-500" />;
    case "denied":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "cancelled":
      return <X className="h-5 w-5 text-gray-500" />;
    case "completed":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    default:
      return <Send className="h-5 w-5 text-gray-500" />;
  }
}

export function PayoutRequestPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const { userId, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!userId || !requestId) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-500">Please sign in to view this payout request.</p>
      </div>
    );
  }

  return (
    <PayoutRequestInner
      userId={userId}
      requestId={requestId as Id<"affiliatePayoutRequests">}
    />
  );
}

function PayoutRequestInner({
  userId,
  requestId,
}: {
  userId: Id<"users">;
  requestId: Id<"affiliatePayoutRequests">;
}) {
  const request = useQuery(
    api.queries.affiliatePayoutRequests.getMyPayoutRequest,
    { userId, requestId }
  );
  const cancelRequest = useMutation(
    api.mutations.affiliatePayoutRequests.cancelMyPayoutRequest
  );

  const [showCancel, setShowCancel] = useState(false);
  const [cancelNotes, setCancelNotes] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [copied, setCopied] = useState(false);

  if (request === undefined) return <PageLoader />;

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelRequest({
        userId,
        requestId,
        notes: cancelNotes.trim() || undefined,
      });
      setShowCancel(false);
    } catch (err) {
      console.error("Failed to cancel request:", err);
    } finally {
      setCancelling(false);
    }
  }

  function copyLink() {
    const link = `${window.location.origin}/affiliate/payout-request/${requestId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <PageHeader title="Payout Request" />

      <a
        href="/affiliate"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Affiliate Portal
      </a>

      {/* Status card */}
      <div className="bg-white rounded-lg shadow p-6 max-w-2xl mb-6">
        <div className="flex items-center gap-3 mb-4">
          {statusIcon(request.status)}
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Request {statusBadge(request.status)}
            </h2>
            <p className="text-sm text-gray-500">
              Submitted {formatDate(request.createdAt)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div>
            <span className="text-gray-500">Total Commission:</span>{" "}
            <span className="font-bold text-gray-900">
              {formatCents(request.totalCommissionCents)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Total Revenue:</span>{" "}
            <span className="font-medium text-gray-900">
              {formatCents(request.totalRevenueCents)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Periods:</span>{" "}
            <span className="font-medium">{request.ledgerIds.length}</span>
          </div>
          {request.approvedAt && (
            <div>
              <span className="text-gray-500">Approved:</span>{" "}
              {formatDate(request.approvedAt)}
            </div>
          )}
          {request.deniedAt && (
            <div>
              <span className="text-gray-500">Denied:</span>{" "}
              {formatDate(request.deniedAt)}
            </div>
          )}
          {request.completedAt && (
            <div>
              <span className="text-gray-500">Completed:</span>{" "}
              {formatDate(request.completedAt)}
            </div>
          )}
          {request.cancelledAt && (
            <div>
              <span className="text-gray-500">Cancelled:</span>{" "}
              {formatDate(request.cancelledAt)}
            </div>
          )}
        </div>

        {request.notes && (
          <div className="text-sm mb-4">
            <span className="text-gray-500">Your notes:</span>{" "}
            <span className="text-gray-700">{request.notes}</span>
          </div>
        )}

        {request.adminNotes && (
          <div className="text-sm mb-4 bg-gray-50 rounded-md px-3 py-2">
            <span className="text-gray-500">Admin notes:</span>{" "}
            <span className="text-gray-700">{request.adminNotes}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            <Copy className="h-3 w-3" />
            {copied ? "Copied!" : "Copy link"}
          </button>

          {request.status === "submitted" && !showCancel && (
            <button
              onClick={() => setShowCancel(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
            >
              <X className="h-3 w-3" />
              Cancel request
            </button>
          )}
        </div>

        {showCancel && (
          <div className="border border-red-200 rounded-md p-3 mt-3">
            <p className="text-sm text-red-700 mb-2">
              Cancel this payout request? Your locked periods will become
              available for a new request.
            </p>
            <textarea
              value={cancelNotes}
              onChange={(e) =>
                setCancelNotes(e.target.value.slice(0, 280))
              }
              maxLength={280}
              rows={2}
              placeholder="Reason for cancelling (optional)"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowCancel(false)}
                disabled={cancelling}
                className="px-3 py-1 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                Keep
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-3 py-1 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ledger entries */}
      <div className="bg-white rounded-lg shadow overflow-hidden max-w-2xl">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-700">
            Included Periods ({request.ledgerRows.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                  Period
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                  Revenue
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                  Commission
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {request.ledgerRows.map((r) => (
                <tr key={r._id}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatPeriodKey(r.periodStart)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatCents(r.attributedRevenueCents)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatCents(r.commissionCents)}
                  </td>
                  <td className="px-4 py-2">{statusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
