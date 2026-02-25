import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import {
  RefreshCw,
  Lock,
  X,
  DollarSign,
  CheckCircle,
  Clock,
  Undo2,
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

function formatPeriodLabel(periodStart: number): string {
  return new Date(periodStart).toLocaleDateString("en-US", {
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

/** Build last N month options as { label, value: "YYYY-MM-01" }. */
function buildMonthOptions(count: number) {
  const now = new Date();
  const options: { label: string; value: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const label =
      i === 0
        ? `Current (${d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })})`
        : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    options.push({ label, value: `${y}-${m}-01` });
  }
  return options;
}

/* ── Wrapper (auth gate) ──────────────────────────────────────────── */

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

  return (
    <AffiliateLedgerInner
      userId={userId}
      isSuperAdmin={user?.isSuperadmin ?? false}
    />
  );
}

/* ── Confirmation Modal (reusable for lock / paid / undo) ─────────── */

function ConfirmModal({
  icon,
  title,
  body,
  confirmLabel,
  confirmColor,
  onCancel,
  onConfirm,
  busy,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  confirmLabel: string;
  confirmColor: string; // tailwind bg-* classes
  onCancel: () => void;
  onConfirm: (notes: string) => void;
  busy: boolean;
}) {
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-3">
          {icon}
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>

        <p className="text-sm text-gray-600 mb-4">{body}</p>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reason / notes{" "}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 280))}
          maxLength={280}
          rows={3}
          placeholder="e.g. Month-end close, reviewed by admin"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-1"
        />
        <p className="text-xs text-gray-400 mb-4 text-right">
          {notes.length}/280
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(notes)}
            disabled={busy}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 ${confirmColor}`}
          >
            {busy ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Summary Cards ────────────────────────────────────────────────── */

function SummaryCards({
  rows,
}: {
  rows: {
    status: string;
    commissionCents: number;
    attributedRevenueCents: number;
  }[];
}) {
  const { openCommission, openRevenue, lockedCommission, paidCommission } =
    useMemo(() => {
      let oc = 0,
        or = 0,
        lc = 0,
        pc = 0;
      for (const r of rows) {
        if (r.status === "open") {
          oc += r.commissionCents;
          or += r.attributedRevenueCents;
        } else if (r.status === "locked") {
          lc += r.commissionCents;
        } else if (r.status === "paid") {
          pc += r.commissionCents;
        }
      }
      return {
        openCommission: oc,
        openRevenue: or,
        lockedCommission: lc,
        paidCommission: pc,
      };
    }, [rows]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-5 w-5 text-yellow-600" />
          <span className="text-xs font-medium text-gray-500">
            Open Revenue
          </span>
        </div>
        <p className="text-xl font-bold text-gray-900">
          {formatCents(openRevenue)}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Commission: {formatCents(openCommission)}
        </p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="h-5 w-5 text-blue-600" />
          <span className="text-xs font-medium text-gray-500">
            Locked (Unpaid)
          </span>
        </div>
        <p className="text-xl font-bold text-gray-900">
          {formatCents(lockedCommission)}
        </p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="text-xs font-medium text-gray-500">Total Paid</span>
        </div>
        <p className="text-xl font-bold text-gray-900">
          {formatCents(paidCommission)}
        </p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          <span className="text-xs font-medium text-gray-500">
            All-Time Commission
          </span>
        </div>
        <p className="text-xl font-bold text-gray-900">
          {formatCents(openCommission + lockedCommission + paidCommission)}
        </p>
      </div>
    </div>
  );
}

/* ── Inner Component ──────────────────────────────────────────────── */

type ModalTarget = {
  id: Id<"affiliateLedger">;
  periodLabel: string;
  action: "lock" | "markPaid" | "undoPaid";
};

function AffiliateLedgerInner({
  userId,
  isSuperAdmin,
}: {
  userId: Id<"users">;
  isSuperAdmin: boolean;
}) {
  const monthOptions = useMemo(() => buildMonthOptions(12), []);

  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);

  const ledger = useQuery(api.queries.affiliateLedger.getMyLedger, { userId });
  const upsertForPeriod = useMutation(
    api.mutations.affiliateLedger.upsertMyLedgerForPeriod
  );
  const lockPeriod = useMutation(
    api.mutations.affiliateLedger.lockLedgerPeriod
  );
  const markPaid = useMutation(
    api.mutations.affiliateLedger.markLedgerPaid
  );
  const undoPaid = useMutation(
    api.mutations.affiliateLedger.unmarkLedgerPaid
  );

  const [refreshing, setRefreshing] = useState<string | null>(null); // tracks which button
  const [busy, setBusy] = useState(false);
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null);

  /* ── Refresh helpers ─────────────────────────────────────────────── */

  async function handleRefresh(periodStart: string, label: string) {
    setRefreshing(label);
    try {
      await upsertForPeriod({ userId, periodStart });
    } catch (err) {
      console.error("Failed to refresh ledger:", err);
    } finally {
      setRefreshing(null);
    }
  }

  function getPrevMonth(): string {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  }

  /* ── Modal confirm handler ───────────────────────────────────────── */

  async function handleModalConfirm(notes: string) {
    if (!modalTarget) return;
    setBusy(true);
    try {
      const trimmedNotes = notes.trim() || undefined;
      if (modalTarget.action === "lock") {
        await lockPeriod({
          userId,
          ledgerId: modalTarget.id,
          notes: trimmedNotes,
        });
      } else if (modalTarget.action === "markPaid") {
        await markPaid({
          userId,
          ledgerId: modalTarget.id,
          notes: trimmedNotes,
        });
      } else if (modalTarget.action === "undoPaid") {
        await undoPaid({
          userId,
          ledgerId: modalTarget.id,
          notes: trimmedNotes,
        });
      }
    } catch (err) {
      console.error(`Failed to ${modalTarget.action}:`, err);
    } finally {
      setBusy(false);
      setModalTarget(null);
    }
  }

  /* ── Modal config per action ─────────────────────────────────────── */

  function modalProps(target: ModalTarget) {
    const pl = target.periodLabel;
    if (target.action === "lock") {
      return {
        icon: <Lock className="h-5 w-5 text-blue-600" />,
        title: "Lock this period?",
        body: `Locking ${pl} freezes this period's revenue and commission totals. Refresh will not change it.`,
        confirmLabel: "Confirm Lock",
        confirmColor: "bg-blue-600 hover:bg-blue-700",
      };
    }
    if (target.action === "markPaid") {
      return {
        icon: <CheckCircle className="h-5 w-5 text-green-600" />,
        title: "Mark as paid?",
        body: `This marks ${pl} as paid. This is manual bookkeeping only — no Stripe transfer occurs.`,
        confirmLabel: "Confirm Paid",
        confirmColor: "bg-green-600 hover:bg-green-700",
      };
    }
    return {
      icon: <Undo2 className="h-5 w-5 text-orange-600" />,
      title: "Undo paid status?",
      body: `This reverts ${pl} back to locked. Use this to correct mistakes.`,
      confirmLabel: "Confirm Undo",
      confirmColor: "bg-orange-600 hover:bg-orange-700",
    };
  }

  /* ── Render ──────────────────────────────────────────────────────── */

  if (ledger === undefined) {
    return <p className="text-sm text-gray-400 py-4">Loading ledger...</p>;
  }

  const rows = ledger.rows;

  return (
    <div className="space-y-6">
      {/* Confirmation modal */}
      {modalTarget && (
        <ConfirmModal
          {...modalProps(modalTarget)}
          onCancel={() => setModalTarget(null)}
          onConfirm={handleModalConfirm}
          busy={busy}
        />
      )}

      {/* Summary cards */}
      <SummaryCards rows={rows} />

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Controls</h3>
        <div className="flex flex-wrap items-end gap-3">
          {/* Month selector */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh selected */}
          <button
            onClick={() => handleRefresh(selectedMonth, "selected")}
            disabled={refreshing !== null}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing === "selected" ? "animate-spin" : ""}`}
            />
            {refreshing === "selected"
              ? "Refreshing..."
              : "Refresh Selected"}
          </button>

          {/* Refresh current */}
          <button
            onClick={() => handleRefresh(monthOptions[0].value, "current")}
            disabled={refreshing !== null}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing === "current" ? "animate-spin" : ""}`}
            />
            Current
          </button>

          {/* Refresh previous */}
          <button
            onClick={() => handleRefresh(getPrevMonth(), "prev")}
            disabled={refreshing !== null}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing === "prev" ? "animate-spin" : ""}`}
            />
            Previous Month
          </button>
        </div>
      </div>

      {/* Ledger table */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-sm text-gray-500">
            No ledger entries yet. Use the controls above to generate period
            snapshots.
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
                    Locked / Paid
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
                      {formatPeriodKey(row.periodStart)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap font-medium">
                      {formatCents(row.attributedRevenueCents)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap font-medium">
                      {formatCents(row.commissionCents)}
                    </td>
                    <td className="px-4 py-3">
                      <div>{statusBadge(row.status)}</div>
                      {row.notes && (
                        <p
                          className="text-xs text-gray-400 mt-1 max-w-[200px] truncate"
                          title={row.notes}
                        >
                          {row.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {row.paidAt ? (
                        <span title={`Locked: ${row.lockedAt ? formatDate(row.lockedAt) : "—"}`}>
                          Paid {formatDate(row.paidAt)}
                        </span>
                      ) : row.lockedAt ? (
                        formatDate(row.lockedAt)
                      ) : (
                        "—"
                      )}
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-2">
                          {row.status === "open" && (
                            <button
                              onClick={() =>
                                setModalTarget({
                                  id: row._id,
                                  periodLabel: formatPeriodLabel(row.periodStart),
                                  action: "lock",
                                })
                              }
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                            >
                              <Lock className="h-3 w-3" />
                              Lock
                            </button>
                          )}
                          {row.status === "locked" && (
                            <button
                              onClick={() =>
                                setModalTarget({
                                  id: row._id,
                                  periodLabel: formatPeriodLabel(row.periodStart),
                                  action: "markPaid",
                                })
                              }
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Mark Paid
                            </button>
                          )}
                          {row.status === "paid" && (
                            <button
                              onClick={() =>
                                setModalTarget({
                                  id: row._id,
                                  periodLabel: formatPeriodLabel(row.periodStart),
                                  action: "undoPaid",
                                })
                              }
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-orange-700 bg-orange-50 rounded hover:bg-orange-100 transition-colors"
                            >
                              <Undo2 className="h-3 w-3" />
                              Undo Paid
                            </button>
                          )}
                        </div>
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
