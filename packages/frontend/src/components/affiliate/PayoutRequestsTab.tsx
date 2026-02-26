import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import {
  CheckCircle,
  XCircle,
  Package,
  X,
  AlertTriangle,
  Send,
} from "lucide-react";

/* ── Helpers ──────────────────────────────────────────────────────── */

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

const PAYOUT_METHODS = ["Zelle", "CashApp", "Venmo", "Cash", "Other"] as const;

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Submitted", value: "submitted" },
  { label: "Approved", value: "approved" },
  { label: "Denied", value: "denied" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
] as const;

/* ── Wrapper ──────────────────────────────────────────────────────── */

export function PayoutRequestsTab() {
  const { userId, isLoading, user } = useAuth();

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-4">Loading...</p>;
  }
  if (!userId || !user?.isSuperadmin) {
    return (
      <p className="text-sm text-gray-500 py-4">
        Super-admin access required.
      </p>
    );
  }

  return <PayoutRequestsInner userId={userId} />;
}

/* ── Request Detail Modal ─────────────────────────────────────────── */

function RequestDetailModal({
  userId,
  requestId,
  onClose,
}: {
  userId: Id<"users">;
  requestId: Id<"affiliatePayoutRequests">;
  onClose: () => void;
}) {
  const request = useQuery(
    api.queries.affiliatePayoutRequests.getPayoutRequestAdmin,
    { userId, requestId }
  );
  const approve = useMutation(
    api.mutations.affiliatePayoutRequests.approvePayoutRequest
  );
  const deny = useMutation(
    api.mutations.affiliatePayoutRequests.denyPayoutRequest
  );
  const complete = useMutation(
    api.mutations.affiliatePayoutRequests.completePayoutRequestAsBatch
  );

  const [action, setAction] = useState<
    "approve" | "deny" | "complete" | null
  >(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [method, setMethod] = useState<string>(PAYOUT_METHODS[0]);
  const [busy, setBusy] = useState(false);

  const hasInvalid = request
    ? request.invalidLedgerIds.length > 0
    : false;

  const canApprove = request?.status === "submitted";
  const canDeny =
    request?.status === "submitted" || request?.status === "approved";
  const canComplete =
    (request?.status === "submitted" || request?.status === "approved") &&
    !hasInvalid;

  async function handleAction() {
    if (!request) return;
    setBusy(true);
    try {
      if (action === "approve") {
        await approve({
          userId,
          requestId,
          adminNotes: adminNotes.trim() || undefined,
        });
      } else if (action === "deny") {
        await deny({
          userId,
          requestId,
          adminNotes: adminNotes.trim(),
        });
      } else if (action === "complete") {
        await complete({
          userId,
          requestId,
          method,
          notes: adminNotes.trim() || undefined,
        });
      }
      setAction(null);
      setAdminNotes("");
    } catch (err) {
      console.error(`Failed to ${action} request:`, err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Payout Request Details
        </h3>

        {request === undefined ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <>
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <span className="text-gray-500">Affiliate:</span>{" "}
                <span className="font-medium">{request.referrerName}</span>
                <span className="text-gray-400 ml-1 text-xs">
                  ({request.referrerEmail})
                </span>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>{" "}
                {statusBadge(request.status)}
              </div>
              <div>
                <span className="text-gray-500">Commission:</span>{" "}
                <span className="font-bold">
                  {formatCents(request.totalCommissionCents)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Revenue:</span>{" "}
                <span className="font-medium">
                  {formatCents(request.totalRevenueCents)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Submitted:</span>{" "}
                {formatDate(request.createdAt)}
              </div>
              {request.approvedAt && (
                <div>
                  <span className="text-gray-500">Approved:</span>{" "}
                  {formatDate(request.approvedAt)}
                </div>
              )}
              {request.completedAt && (
                <div>
                  <span className="text-gray-500">Completed:</span>{" "}
                  {formatDate(request.completedAt)}
                </div>
              )}
              {request.deniedAt && (
                <div>
                  <span className="text-gray-500">Denied:</span>{" "}
                  {formatDate(request.deniedAt)}
                </div>
              )}
              {request.notes && (
                <div className="col-span-2">
                  <span className="text-gray-500">Affiliate notes:</span>{" "}
                  {request.notes}
                </div>
              )}
              {request.adminNotes && (
                <div className="col-span-2">
                  <span className="text-gray-500">Admin notes:</span>{" "}
                  {request.adminNotes}
                </div>
              )}
            </div>

            {/* Invalid items warning */}
            {hasInvalid && (
              <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">
                    {request.invalidLedgerIds.length} ledger{" "}
                    {request.invalidLedgerIds.length === 1
                      ? "entry is"
                      : "entries are"}{" "}
                    no longer eligible
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Some entries may have been paid, moved to another batch, or
                    are no longer locked. Cannot convert to batch until resolved.
                  </p>
                </div>
              </div>
            )}

            {/* Ledger entries table */}
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Ledger Entries ({request.ledgerRows.length})
            </h4>
            <table className="min-w-full divide-y divide-gray-200 text-sm mb-4">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    Period
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                    Revenue
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                    Commission
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {request.ledgerRows.map((r) => {
                  const isInvalid = request.invalidLedgerIds.includes(
                    r._id
                  );
                  return (
                    <tr
                      key={r._id}
                      className={isInvalid ? "bg-red-50/50" : ""}
                    >
                      <td className="px-3 py-2">
                        {formatPeriodKey(r.periodStart)}
                        {isInvalid && (
                          <span className="ml-1 text-[10px] text-red-500">
                            (invalid)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCents(r.attributedRevenueCents)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCents(r.commissionCents)}
                      </td>
                      <td className="px-3 py-2">
                        {statusBadge(r.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Action buttons */}
            {(canApprove || canDeny || canComplete) && action === null && (
              <div className="flex flex-wrap gap-2">
                {canApprove && (
                  <button
                    onClick={() => setAction("approve")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 rounded-md hover:bg-teal-100 transition-colors"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Approve
                  </button>
                )}
                {canDeny && (
                  <button
                    onClick={() => setAction("deny")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Deny
                  </button>
                )}
                {canComplete && (
                  <button
                    onClick={() => setAction("complete")}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 transition-colors"
                  >
                    <Package className="h-3.5 w-3.5" />
                    Convert to Batch
                  </button>
                )}
              </div>
            )}

            {/* Action form */}
            {action && (
              <div
                className={`border rounded-md p-3 mt-3 ${
                  action === "deny"
                    ? "border-red-200"
                    : action === "approve"
                      ? "border-teal-200"
                      : "border-green-200"
                }`}
              >
                <p className="text-sm font-medium text-gray-700 mb-2">
                  {action === "approve" && "Approve this request?"}
                  {action === "deny" && "Deny this request?"}
                  {action === "complete" &&
                    "Convert to payout batch and mark paid?"}
                </p>

                {action === "complete" && (
                  <>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Payment method
                    </label>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
                    >
                      {PAYOUT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {action === "deny"
                    ? "Reason (required)"
                    : "Notes (optional)"}
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) =>
                    setAdminNotes(e.target.value.slice(0, 280))
                  }
                  maxLength={280}
                  rows={2}
                  placeholder={
                    action === "deny"
                      ? "Reason for denial..."
                      : "Admin notes..."
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAction(null);
                      setAdminNotes("");
                    }}
                    disabled={busy}
                    className="px-3 py-1 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAction}
                    disabled={
                      busy || (action === "deny" && !adminNotes.trim())
                    }
                    className={`px-3 py-1 text-sm text-white rounded disabled:opacity-50 ${
                      action === "deny"
                        ? "bg-red-600 hover:bg-red-700"
                        : action === "approve"
                          ? "bg-teal-600 hover:bg-teal-700"
                          : "bg-green-600 hover:bg-green-700"
                    }`}
                  >
                    {busy
                      ? "Processing..."
                      : action === "approve"
                        ? "Confirm Approve"
                        : action === "deny"
                          ? "Confirm Deny"
                          : "Confirm & Create Batch"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Inner ────────────────────────────────────────────────────────── */

function PayoutRequestsInner({
  userId,
}: {
  userId: Id<"users">;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [viewingRequestId, setViewingRequestId] =
    useState<Id<"affiliatePayoutRequests"> | null>(null);

  const requests = useQuery(
    api.queries.affiliatePayoutRequests.listPayoutRequestsAdmin,
    {
      userId,
      status: (statusFilter || undefined) as any,
      limit: 20,
    }
  );

  // Count submitted for badge
  const submittedCount = useMemo(() => {
    if (!requests) return 0;
    return requests.rows.filter((r) => r.status === "submitted").length;
  }, [requests]);

  return (
    <div className="space-y-6">
      {viewingRequestId && (
        <RequestDetailModal
          userId={userId}
          requestId={viewingRequestId}
          onClose={() => setViewingRequestId(null)}
        />
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUS_FILTERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {submittedCount > 0 && !statusFilter && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
              {submittedCount} pending
            </span>
          )}
        </div>
      </div>

      {/* Requests table */}
      {requests === undefined ? (
        <p className="text-sm text-gray-400 py-4">Loading...</p>
      ) : requests.rows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <Send className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-1">
            {statusFilter
              ? `No payout requests with status "${statusFilter}".`
              : "No payout requests yet."}
          </p>
          <p className="text-xs text-gray-400">
            Affiliates can submit payout requests from their Ledger tab.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Affiliate
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Commission
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Periods
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {requests.rows.map((r) => (
                  <tr
                    key={r._id}
                    className={
                      r.status === "submitted" ? "bg-purple-50/30" : ""
                    }
                  >
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">
                        {r.referrerName}
                      </div>
                      <div className="text-xs text-gray-400">
                        {r.referrerEmail}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap font-medium">
                      {formatCents(r.totalCommissionCents)}
                    </td>
                    <td className="px-4 py-3">
                      {statusBadge(r.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {r.ledgerIds.length}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          setViewingRequestId(
                            r._id as Id<"affiliatePayoutRequests">
                          )
                        }
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
