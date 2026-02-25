import { useState, useMemo, useCallback } from "react";
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
  Download,
  Package,
  ChevronDown,
  ChevronUp,
  Users,
  Search,
} from "lucide-react";

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
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

function formatISO(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    open: "bg-yellow-100 text-yellow-800",
    locked: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
    recorded: "bg-green-100 text-green-800",
    voided: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-800"}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function buildMonthOptions(count: number) {
  const now = new Date();
  const options: { label: string; value: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)
    );
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const label =
      i === 0
        ? `Current (${d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })})`
        : d.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          });
    options.push({ label, value: `${y}-${m}-01` });
  }
  return options;
}

const PAYOUT_METHODS = ["Zelle", "CashApp", "Venmo", "Cash", "Other"] as const;

const STATUS_FILTER_OPTIONS = [
  { label: "All", value: "" },
  { label: "Open", value: "open" },
  { label: "Locked", value: "locked" },
  { label: "Paid", value: "paid" },
] as const;

/* ── CSV helpers ──────────────────────────────────────────────────── */

function escapeCsvField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

type LedgerRow = {
  _id: string;
  periodType: string;
  periodStart: number;
  periodEnd: number;
  status: string;
  attributedRevenueCents: number;
  commissionCents: number;
  lockedAt?: number;
  paidAt?: number;
  notes?: string;
  payoutBatchId?: string;
};

function buildCsvContent(rows: LedgerRow[]): string {
  const header = [
    "Period Type",
    "Period Start",
    "Period End",
    "Status",
    "Revenue ($)",
    "Commission ($)",
    "Locked At",
    "Paid At",
    "Notes",
    "Payout Batch ID",
  ];
  const lines = [header.map(escapeCsvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.periodType,
        formatISO(r.periodStart),
        formatISO(r.periodEnd),
        r.status,
        centsToDecimal(r.attributedRevenueCents),
        centsToDecimal(r.commissionCents),
        r.lockedAt ? formatISO(r.lockedAt) : "",
        r.paidAt ? formatISO(r.paidAt) : "",
        escapeCsvField(r.notes ?? ""),
        r.payoutBatchId ?? "",
      ].join(",")
    );
  }
  return lines.join("\n");
}

type BatchRow = {
  _id: string;
  createdAt: number;
  method: string;
  totalCommissionCents: number;
  status: string;
  ledgerIds: string[];
  notes?: string;
  voidedAt?: number;
};

function buildBatchCsvContent(batches: BatchRow[]): string {
  const header = [
    "Batch ID",
    "Created",
    "Method",
    "Total ($)",
    "Status",
    "Entries",
    "Notes",
    "Voided At",
  ];
  const lines = [header.map(escapeCsvField).join(",")];
  for (const b of batches) {
    lines.push(
      [
        b._id,
        formatISO(b.createdAt),
        escapeCsvField(b.method),
        centsToDecimal(b.totalCommissionCents),
        b.status,
        String(b.ledgerIds.length),
        escapeCsvField(b.notes ?? ""),
        b.voidedAt ? formatISO(b.voidedAt) : "",
      ].join(",")
    );
  }
  return lines.join("\n");
}

function buildBatchDetailCsvContent(
  batch: BatchRow & {
    ledgerRows: {
      _id: string;
      periodStart: number;
      periodType: string;
      commissionCents: number;
      attributedRevenueCents: number;
      status: string;
      referrerUserId: string;
    }[];
  }
): string {
  const header = [
    "Ledger ID",
    "Period",
    "Period Type",
    "Revenue ($)",
    "Commission ($)",
    "Status",
    "Referrer User ID",
  ];
  const lines = [header.map(escapeCsvField).join(",")];
  for (const r of batch.ledgerRows) {
    lines.push(
      [
        r._id,
        formatISO(r.periodStart),
        r.periodType,
        centsToDecimal(r.attributedRevenueCents),
        centsToDecimal(r.commissionCents),
        r.status,
        r.referrerUserId,
      ].join(",")
    );
  }
  return lines.join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
  confirmColor: string;
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

/* ── Batch Payout Modal ───────────────────────────────────────────── */

function BatchPayoutModal({
  selectedCount,
  totalCents,
  onCancel,
  onConfirm,
  busy,
}: {
  selectedCount: number;
  totalCents: number;
  onCancel: () => void;
  onConfirm: (method: string, notes: string) => void;
  busy: boolean;
}) {
  const [method, setMethod] = useState<string>(PAYOUT_METHODS[0]);
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
          <Package className="h-5 w-5 text-green-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Record payout batch?
          </h3>
        </div>

        <p className="text-sm text-gray-600 mb-2">
          This marks {selectedCount} locked period{selectedCount > 1 ? "s" : ""}{" "}
          as PAID ({formatCents(totalCents)} total commission).
        </p>
        <p className="text-xs text-gray-400 mb-4">
          Manual bookkeeping only — no Stripe transfer occurs.
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Payment method
        </label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        >
          {PAYOUT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes{" "}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 280))}
          maxLength={280}
          rows={3}
          placeholder="e.g. Sent via Zelle on 2/25"
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
            onClick={() => onConfirm(method, notes)}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            {busy ? "Processing..." : "Confirm Payout"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Batch Detail Modal ───────────────────────────────────────────── */

function BatchDetailModal({
  userId,
  batchId,
  onClose,
  onVoid,
  voiding,
}: {
  userId: Id<"users">;
  batchId: Id<"affiliatePayoutBatches">;
  onClose: () => void;
  onVoid: (batchId: Id<"affiliatePayoutBatches">, notes: string) => void;
  voiding: boolean;
}) {
  const batch = useQuery(
    api.queries.affiliatePayoutBatches.getPayoutBatch,
    { userId, batchId }
  );
  const [showVoid, setShowVoid] = useState(false);
  const [voidNotes, setVoidNotes] = useState("");

  function handleExportBatchCsv() {
    if (!batch) return;
    const csv = buildBatchDetailCsvContent(batch as any);
    downloadCsv(csv, `scrubadub-batch-${batch._id.slice(-6)}-${formatISO(Date.now())}.csv`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Batch Details
        </h3>

        {batch === undefined ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <span className="text-gray-500">Method:</span>{" "}
                <span className="font-medium">{batch.method}</span>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>{" "}
                {statusBadge(batch.status)}
              </div>
              <div>
                <span className="text-gray-500">Total:</span>{" "}
                <span className="font-medium">
                  {formatCents(batch.totalCommissionCents)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>{" "}
                {formatDate(batch.createdAt)}
              </div>
              {batch.notes && (
                <div className="col-span-2">
                  <span className="text-gray-500">Notes:</span>{" "}
                  {batch.notes}
                </div>
              )}
              {batch.voidedAt && (
                <div className="col-span-2">
                  <span className="text-gray-500">Voided:</span>{" "}
                  {formatDate(batch.voidedAt)}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700">
                Ledger Entries ({batch.ledgerRows.length})
              </h4>
              <button
                onClick={handleExportBatchCsv}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
              >
                <Download className="h-3 w-3" />
                Export CSV
              </button>
            </div>
            <table className="min-w-full divide-y divide-gray-200 text-sm mb-4">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    Period
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
                {batch.ledgerRows.map((r) => (
                  <tr key={r._id}>
                    <td className="px-3 py-2">
                      {formatPeriodKey(r.periodStart)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatCents(r.commissionCents)}
                    </td>
                    <td className="px-3 py-2">{statusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {batch.status === "recorded" && !showVoid && (
              <button
                onClick={() => setShowVoid(true)}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors"
              >
                <Undo2 className="h-3 w-3" />
                Void this batch
              </button>
            )}

            {showVoid && (
              <div className="border border-red-200 rounded-md p-3 mt-2">
                <p className="text-sm text-red-700 mb-2">
                  Voiding reverts all ledger entries to locked. Are you sure?
                </p>
                <textarea
                  value={voidNotes}
                  onChange={(e) =>
                    setVoidNotes(e.target.value.slice(0, 280))
                  }
                  maxLength={280}
                  rows={2}
                  placeholder="Reason for voiding (optional)"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowVoid(false)}
                    disabled={voiding}
                    className="px-3 py-1 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onVoid(batchId, voidNotes)}
                    disabled={voiding}
                    className="px-3 py-1 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {voiding ? "Voiding..." : "Confirm Void"}
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

/* ── Batch List Panel ─────────────────────────────────────────────── */

function BatchListPanel({
  userId,
  onViewBatch,
  batches,
}: {
  userId: Id<"users">;
  onViewBatch: (batchId: Id<"affiliatePayoutBatches">) => void;
  batches?: { rows: BatchRow[] } | null;
}) {
  const [expanded, setExpanded] = useState(false);

  // Use global batches query when no pre-filtered batches are provided
  const globalBatches = useQuery(
    api.queries.affiliatePayoutBatches.listPayoutBatches,
    batches !== undefined ? "skip" : { userId, limit: 10 }
  );

  const batchRows = batches?.rows ?? globalBatches?.rows;

  if (batchRows === undefined) return null;
  if (batchRows.length === 0) return null;

  function handleExportBatchesCsv() {
    if (!batchRows || batchRows.length === 0) return;
    const csv = buildBatchCsvContent(batchRows as BatchRow[]);
    const today = formatISO(Date.now());
    downloadCsv(csv, `scrubadub-batches-${today}.csv`);
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <span>Recent Payout Batches ({batchRows.length})</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-gray-200">
          <div className="flex justify-end px-4 py-2 border-b border-gray-100">
            <button
              onClick={handleExportBatchesCsv}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            >
              <Download className="h-3 w-3" />
              Export Batches CSV
            </button>
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                  Date
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                  Method
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                  Total
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                  Entries
                </th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batchRows.map((b) => (
                <tr key={b._id}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatDate(b.createdAt)}
                  </td>
                  <td className="px-4 py-2">{b.method}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatCents(b.totalCommissionCents)}
                  </td>
                  <td className="px-4 py-2">{statusBadge(b.status)}</td>
                  <td className="px-4 py-2">{b.ledgerIds.length}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => onViewBatch(b._id as Id<"affiliatePayoutBatches">)}
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
      )}
    </div>
  );
}

/* ── View-As Affiliate Selector (super-admin only) ───────────────── */

function ViewAsSelector({
  userId,
  selectedReferrer,
  onSelect,
}: {
  userId: Id<"users">;
  selectedReferrer: Id<"users"> | null;
  onSelect: (referrerId: Id<"users"> | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const candidates = useQuery(
    api.queries.adminAffiliates.listAffiliateCandidates,
    { userId, search: search || undefined, limit: 20 }
  );

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-medium text-indigo-800">
          View as Affiliate
        </span>
        {selectedReferrer && (
          <button
            onClick={() => {
              onSelect(null);
              setSearch("");
            }}
            className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 underline"
          >
            Back to my ledger
          </button>
        )}
      </div>

      {!selectedReferrer && (
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder="Search affiliates by name or email..."
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {open && candidates && candidates.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {candidates.map((c) => (
                <button
                  key={c._id}
                  onClick={() => {
                    onSelect(c._id as Id<"users">);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center justify-between"
                >
                  <div>
                    <span className="font-medium text-gray-900">
                      {c.name}
                    </span>
                    <span className="text-gray-500 ml-2">{c.email}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {c.entryCount} entries
                  </span>
                </button>
              ))}
            </div>
          )}

          {open && candidates && candidates.length === 0 && search && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg px-3 py-3 text-sm text-gray-500">
              No affiliates found matching "{search}"
            </div>
          )}
        </div>
      )}

      {selectedReferrer && candidates && (
        <p className="text-sm text-indigo-700">
          Viewing ledger for:{" "}
          <span className="font-medium">
            {candidates.find((c) => c._id === selectedReferrer)?.name ?? selectedReferrer}
          </span>
        </p>
      )}
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
  const [statusFilter, setStatusFilter] = useState<string>("");

  // View-as state (super-admin only)
  const [viewAsReferrer, setViewAsReferrer] = useState<Id<"users"> | null>(null);

  const isViewingOther = isSuperAdmin && viewAsReferrer !== null;

  // Ledger query: own vs admin view-as
  const myLedger = useQuery(
    api.queries.affiliateLedger.getMyLedger,
    isViewingOther
      ? "skip"
      : {
          userId,
          status: (statusFilter || undefined) as any,
        }
  );

  const adminLedger = useQuery(
    api.queries.adminAffiliates.getLedgerForReferrer,
    isViewingOther
      ? {
          userId,
          referrerUserId: viewAsReferrer!,
          status: (statusFilter || undefined) as any,
        }
      : "skip"
  );

  const ledger = isViewingOther ? adminLedger : myLedger;

  // Batches for view-as mode
  const referrerBatches = useQuery(
    api.queries.adminAffiliates.listPayoutBatchesForReferrer,
    isViewingOther
      ? { userId, referrerUserId: viewAsReferrer!, limit: 10 }
      : "skip"
  );

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
  const createBatch = useMutation(
    api.mutations.affiliatePayoutBatches.createPayoutBatchAndMarkPaid
  );
  const voidBatch = useMutation(
    api.mutations.affiliatePayoutBatches.voidPayoutBatchAndRevertPaid
  );

  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null);

  // Selection state (locked rows only)
  const [selectedIds, setSelectedIds] = useState<Set<Id<"affiliateLedger">>>(
    () => new Set()
  );

  // Batch modals
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [viewingBatchId, setViewingBatchId] =
    useState<Id<"affiliatePayoutBatches"> | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  /* ── Selection helpers ───────────────────────────────────────────── */

  const toggleSelection = useCallback((id: Id<"affiliateLedger">) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const lockedRows = useMemo(
    () => (ledger?.rows ?? []).filter((r) => r.status === "locked"),
    [ledger]
  );

  const selectAllLocked = useCallback(() => {
    setSelectedIds(new Set(lockedRows.map((r) => r._id)));
  }, [lockedRows]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectedCommissionCents = useMemo(() => {
    if (!ledger) return 0;
    let sum = 0;
    for (const r of ledger.rows) {
      if (selectedIds.has(r._id)) sum += r.commissionCents;
    }
    return sum;
  }, [ledger, selectedIds]);

  // Clean up stale selections when ledger updates
  useMemo(() => {
    if (!ledger) return;
    const validLockedIds = new Set(lockedRows.map((r) => r._id));
    setSelectedIds((prev) => {
      const cleaned = new Set<Id<"affiliateLedger">>();
      for (const id of prev) {
        if (validLockedIds.has(id)) cleaned.add(id);
      }
      if (cleaned.size !== prev.size) return cleaned;
      return prev;
    });
  }, [ledger, lockedRows]);

  // Clear selection when switching view-as target
  useMemo(() => {
    setSelectedIds(new Set());
  }, [viewAsReferrer]);

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
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  }

  /* ── Row action modal handler ────────────────────────────────────── */

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

  /* ── Batch handlers ──────────────────────────────────────────────── */

  async function handleBatchConfirm(method: string, notes: string) {
    setBatchBusy(true);
    try {
      await createBatch({
        userId,
        ledgerIds: [...selectedIds],
        method,
        notes: notes.trim() || undefined,
      });
      clearSelection();
    } catch (err) {
      console.error("Failed to create batch:", err);
    } finally {
      setBatchBusy(false);
      setShowBatchModal(false);
    }
  }

  async function handleVoidBatch(
    batchId: Id<"affiliatePayoutBatches">,
    notes: string
  ) {
    setBatchBusy(true);
    try {
      await voidBatch({
        userId,
        batchId,
        notes: notes.trim() || undefined,
      });
      setViewingBatchId(null);
    } catch (err) {
      console.error("Failed to void batch:", err);
    } finally {
      setBatchBusy(false);
    }
  }

  /* ── CSV export ──────────────────────────────────────────────────── */

  function handleExportVisible() {
    if (!ledger) return;
    const csv = buildCsvContent(ledger.rows as LedgerRow[]);
    const today = formatISO(Date.now());
    downloadCsv(csv, `scrubadub-ledger-${today}.csv`);
  }

  function handleExportSelected() {
    if (!ledger) return;
    const selected = ledger.rows.filter((r) =>
      selectedIds.has(r._id)
    ) as LedgerRow[];
    if (selected.length === 0) return;
    const csv = buildCsvContent(selected);
    const today = formatISO(Date.now());
    downloadCsv(csv, `scrubadub-ledger-selected-${today}.csv`);
  }

  /* ── Render ──────────────────────────────────────────────────────── */

  if (ledger === undefined) {
    return <p className="text-sm text-gray-400 py-4">Loading ledger...</p>;
  }

  const rows = ledger.rows;

  return (
    <div className="space-y-6">
      {/* Modals */}
      {modalTarget && (
        <ConfirmModal
          {...modalProps(modalTarget)}
          onCancel={() => setModalTarget(null)}
          onConfirm={handleModalConfirm}
          busy={busy}
        />
      )}
      {showBatchModal && (
        <BatchPayoutModal
          selectedCount={selectedIds.size}
          totalCents={selectedCommissionCents}
          onCancel={() => setShowBatchModal(false)}
          onConfirm={handleBatchConfirm}
          busy={batchBusy}
        />
      )}
      {viewingBatchId && (
        <BatchDetailModal
          userId={userId}
          batchId={viewingBatchId}
          onClose={() => setViewingBatchId(null)}
          onVoid={handleVoidBatch}
          voiding={batchBusy}
        />
      )}

      {/* View-as selector (super-admin only) */}
      {isSuperAdmin && (
        <ViewAsSelector
          userId={userId}
          selectedReferrer={viewAsReferrer}
          onSelect={setViewAsReferrer}
        />
      )}

      {/* Summary cards */}
      <SummaryCards rows={rows} />

      {/* Batch list (super-admin) */}
      {isSuperAdmin && (
        <BatchListPanel
          userId={userId}
          onViewBatch={setViewingBatchId}
          batches={isViewingOther ? referrerBatches : undefined}
        />
      )}

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

          {/* Status filter */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh selected */}
          {!isViewingOther && (
            <button
              onClick={() => handleRefresh(selectedMonth, "selected")}
              disabled={refreshing !== null}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing === "selected" ? "animate-spin" : ""}`}
              />
              {refreshing === "selected" ? "Refreshing..." : "Refresh Selected"}
            </button>
          )}

          {/* Refresh current */}
          {!isViewingOther && (
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
          )}

          {/* Refresh previous */}
          {!isViewingOther && (
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
          )}

          {/* CSV export */}
          <button
            onClick={handleExportVisible}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={handleExportSelected}
              className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export Selected ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* Selection bar (super-admin, when locked rows exist) */}
      {isSuperAdmin && lockedRows.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-blue-800">
            {selectedIds.size} selected
            {selectedIds.size > 0 && (
              <span className="ml-1 font-medium">
                ({formatCents(selectedCommissionCents)})
              </span>
            )}
          </span>
          <button
            onClick={selectAllLocked}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Select all locked ({lockedRows.length})
          </button>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={clearSelection}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Clear
              </button>
              <button
                onClick={() => setShowBatchModal(true)}
                className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
              >
                <Package className="h-4 w-4" />
                Record Payout Batch
              </button>
            </>
          )}
        </div>
      )}

      {/* Ledger table */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-sm text-gray-500 mb-2">
            {statusFilter
              ? `No ledger entries with status "${statusFilter}".`
              : isViewingOther
                ? "No ledger entries for this affiliate yet."
                : "No ledger entries yet."}
          </p>
          <p className="text-xs text-gray-400">
            {statusFilter
              ? "Try selecting a different status filter or \"All\" to see all entries."
              : isViewingOther
                ? "Ledger entries are created when an affiliate's referrals generate revenue."
                : "Use the controls above to generate period snapshots from your attribution data."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {isSuperAdmin && <th className="px-3 py-3 w-8"></th>}
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
                  <tr
                    key={row._id}
                    className={
                      selectedIds.has(row._id) ? "bg-blue-50/50" : ""
                    }
                  >
                    {isSuperAdmin && (
                      <td className="px-3 py-3">
                        {row.status === "locked" && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row._id)}
                            onChange={() => toggleSelection(row._id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        )}
                      </td>
                    )}
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
                      <div className="flex items-center gap-1.5">
                        {statusBadge(row.status)}
                        {row.status === "paid" && row.payoutBatchId && (
                          <span
                            className="text-[10px] text-gray-400"
                            title={`Batch: ${row.payoutBatchId}`}
                          >
                            (batch)
                          </span>
                        )}
                      </div>
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
                        <span
                          title={`Locked: ${row.lockedAt ? formatDate(row.lockedAt) : "—"}`}
                        >
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
                                  periodLabel: formatPeriodLabel(
                                    row.periodStart
                                  ),
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
                                  periodLabel: formatPeriodLabel(
                                    row.periodStart
                                  ),
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
                                  periodLabel: formatPeriodLabel(
                                    row.periodStart
                                  ),
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
