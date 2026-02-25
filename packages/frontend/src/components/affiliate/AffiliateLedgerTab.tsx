import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { RefreshCw, Lock } from "lucide-react";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPeriod(periodStart: number): string {
  const d = new Date(periodStart);
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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

export function AffiliateLedgerTab() {
  const { userId, isLoading, user } = useAuth();

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-4">Loading...</p>;
  }

  if (!userId) {
    return (
      <p className="text-sm text-gray-500 py-4">
        Please sign in to view ledger data.
      </p>
    );
  }

  return <AffiliateLedgerInner userId={userId} isSuperAdmin={user?.isSuperadmin ?? false} />;
}

function AffiliateLedgerInner({
  userId,
  isSuperAdmin,
}: {
  userId: Id<"users">;
  isSuperAdmin: boolean;
}) {
  const ledger = useQuery(api.queries.affiliateLedger.getMyLedger, { userId });
  const upsert = useMutation(
    api.mutations.affiliateLedger.upsertMyCurrentPeriodLedger
  );
  const lockPeriod = useMutation(
    api.mutations.affiliateLedger.lockLedgerPeriod
  );

  const [refreshing, setRefreshing] = useState(false);
  const [lockingId, setLockingId] = useState<Id<"affiliateLedger"> | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await upsert({ userId });
    } catch (err) {
      console.error("Failed to refresh ledger:", err);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLock(ledgerId: Id<"affiliateLedger">) {
    setLockingId(ledgerId);
    try {
      await lockPeriod({ userId, ledgerId });
    } catch (err) {
      console.error("Failed to lock period:", err);
    } finally {
      setLockingId(null);
    }
  }

  if (ledger === undefined) {
    return <p className="text-sm text-gray-400 py-4">Loading ledger...</p>;
  }

  const rows = ledger.rows;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Commission Ledger</h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh Current Period"}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-sm text-gray-500">
            No ledger entries yet. Click &quot;Refresh Current Period&quot; to generate a snapshot for
            this month.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Commission
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Locked At
                  </th>
                  {isSuperAdmin && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row._id}>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {formatPeriod(row.periodStart)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap font-medium">
                      {formatCents(row.attributedRevenueCents)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap font-medium">
                      {formatCents(row.commissionCents)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {statusBadge(row.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {row.lockedAt ? formatDate(row.lockedAt) : "—"}
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.status === "open" && (
                          <button
                            onClick={() => handleLock(row._id)}
                            disabled={lockingId === row._id}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors disabled:opacity-50"
                          >
                            <Lock className="h-3 w-3" />
                            {lockingId === row._id ? "Locking..." : "Lock"}
                          </button>
                        )}
                      </td>
                    )}
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
