import { useState, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Link } from "wouter";
import {
  DollarSign,
  ExternalLink,
  CreditCard,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

type Tab = "OPEN" | "PAID";

interface CleanerGroup {
  cleanerUserId: string;
  cleanerName: string;
  cleanerStripeAccountId: string | null;
  items: Array<{
    _id: string;
    jobId: string;
    amountCents: number | undefined;
    jobLabel: string;
    createdAt: number;
  }>;
  totalCents: number;
}

export function CleanerPaymentsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("OPEN");
  const [batchLoading, setBatchLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Local edited amounts keyed by payment _id (dollars string)
  const [editedAmounts, setEditedAmounts] = useState<Record<string, string>>({});
  const [savingAmounts, setSavingAmounts] = useState<Record<string, boolean>>({});

  const payments = useQuery(
    api.queries.cleanerPayments.listCleanerPaymentsForCompany,
    user?._id ? { userId: user._id, status: tab } : "skip",
  );

  const createBatch = useMutation(api.mutations.cleanerPayments.createCleanerPaymentBatch);
  const markBatchOutside = useMutation(api.mutations.cleanerPayments.markCleanerBatchPaidOutside);
  const createCheckout = useAction(api.actions.cleanerPayments.createCleanerPaymentCheckout);
  const updateAmount = useMutation(api.mutations.cleanerPayments.updateCleanerPaymentAmount);

  if (!user) return <PageLoader />;

  /** Get the effective amount for an item (edited local value or server value) */
  function getEffectiveCents(item: { _id: string; amountCents: number | undefined }): number | null {
    const edited = editedAmounts[item._id];
    if (edited !== undefined) {
      const v = parseFloat(edited);
      return v > 0 ? Math.round(v * 100) : null;
    }
    return item.amountCents ?? null;
  }

  // Group OPEN payments by cleaner
  function groupByCleaner(items: NonNullable<typeof payments>): CleanerGroup[] {
    const map = new Map<string, CleanerGroup>();
    for (const p of items) {
      const key = p.cleanerUserId;
      if (!map.has(key)) {
        map.set(key, {
          cleanerUserId: key,
          cleanerName: p.cleanerName,
          cleanerStripeAccountId: p.cleanerStripeAccountId,
          items: [],
          totalCents: 0,
        });
      }
      const g = map.get(key)!;
      g.items.push({
        _id: p._id,
        jobId: p.jobId,
        amountCents: p.amountCents,
        jobLabel: p.jobLabel,
        createdAt: p.createdAt,
      });
    }
    // Compute totals from effective (edited or server) values
    for (const g of map.values()) {
      g.totalCents = g.items.reduce((sum, item) => {
        const c = getEffectiveCents(item);
        return sum + (c ?? 0);
      }, 0);
    }
    return Array.from(map.values());
  }

  /** Whether every item in the group has a valid amount (> 0) */
  function allItemsHaveAmount(group: CleanerGroup): boolean {
    return group.items.every((item) => {
      const c = getEffectiveCents(item);
      return c != null && c >= 100;
    });
  }

  /** Save an edited amount to the server */
  const saveAmount = useCallback(
    async (paymentId: string, dollars: string) => {
      const cents = Math.round(parseFloat(dollars) * 100);
      if (!cents || cents < 100) return;
      setSavingAmounts((prev) => ({ ...prev, [paymentId]: true }));
      try {
        await updateAmount({
          userId: user!._id,
          cleanerPaymentId: paymentId as Id<"cleanerPayments">,
          amountCents: cents,
        });
      } catch (e: any) {
        setError(e.message ?? "Failed to save amount");
      } finally {
        setSavingAmounts((prev) => ({ ...prev, [paymentId]: false }));
      }
    },
    [updateAmount, user],
  );

  async function handleBatchStripe(group: CleanerGroup) {
    setBatchLoading(group.cleanerUserId);
    setError(null);
    try {
      const jobIds = group.items.map((i) => i.jobId as Id<"jobs">);
      const paymentId = await createBatch({
        userId: user!._id,
        jobIds,
        totalAmountCents: group.totalCents,
      });
      const result = await createCheckout({
        userId: user!._id,
        cleanerPaymentId: paymentId,
      });
      if (result?.url) window.location.href = result.url;
    } catch (e: any) {
      setError(e.message ?? "Failed to start batch payment");
    } finally {
      setBatchLoading(null);
    }
  }

  async function handleBatchOutside(group: CleanerGroup) {
    setBatchLoading(group.cleanerUserId);
    setError(null);
    try {
      const jobIds = group.items.map((i) => i.jobId as Id<"jobs">);
      await markBatchOutside({
        userId: user!._id,
        jobIds,
        totalAmountCents: group.totalCents,
      });
    } catch (e: any) {
      setError(e.message ?? "Failed to mark batch paid");
    } finally {
      setBatchLoading(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Cleaner Payments"
        description="Payments to your cleaners for completed jobs"
      />

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6">
          {(["OPEN", "PAID"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t === "OPEN" ? "Open" : "Paid"}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {payments === undefined ? (
        <PageLoader />
      ) : payments.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No {tab === "OPEN" ? "open" : "paid"} cleaner payments.
        </p>
      ) : tab === "OPEN" ? (
        /* ── OPEN tab: grouped by cleaner with batch actions ── */
        <div className="space-y-4">
          {groupByCleaner(payments).map((group) => {
            const allReady = allItemsHaveAmount(group);
            return (
              <div key={group.cleanerUserId} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{group.cleanerName}</p>
                    <p className="text-sm text-gray-500">
                      {group.items.length} unpaid job{group.items.length !== 1 ? "s" : ""} &middot;{" "}
                      Total: {group.totalCents > 0 ? `$${(group.totalCents / 100).toFixed(2)}` : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    {group.cleanerStripeAccountId && (
                      <button
                        disabled={batchLoading !== null || !allReady}
                        onClick={() => handleBatchStripe(group)}
                        title={!allReady ? "Set amounts for all jobs first" : undefined}
                        className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CreditCard className="w-4 h-4" />
                        {batchLoading === group.cleanerUserId ? "Loading..." : "Pay All via App"}
                      </button>
                    )}
                    <button
                      disabled={batchLoading !== null || !allReady}
                      onClick={() => handleBatchOutside(group)}
                      title={!allReady ? "Set amounts for all jobs first" : undefined}
                      className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {batchLoading === group.cleanerUserId ? "Saving..." : "Mark All Paid Outside"}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {group.items.map((item) => {
                    const hasSavedAmount = item.amountCents != null;
                    const localVal = editedAmounts[item._id];
                    const displayDollars =
                      localVal !== undefined
                        ? localVal
                        : hasSavedAmount
                          ? (item.amountCents! / 100).toFixed(2)
                          : "";
                    const isSaving = savingAmounts[item._id] ?? false;

                    return (
                      <div key={item._id} className="flex items-center justify-between text-sm py-1.5 border-t border-gray-100 gap-2">
                        <div className="flex items-center gap-2 text-gray-600 min-w-0">
                          <Link
                            href={`/jobs/${item.jobId}`}
                            className="hover:text-blue-600 flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> {item.jobLabel}
                          </Link>
                          <span className="text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!hasSavedAmount && localVal === undefined && (
                            <span className="text-amber-600 flex items-center gap-1 text-xs mr-1">
                              <AlertCircle className="w-3 h-3" /> Amount needed
                            </span>
                          )}
                          <span className="text-gray-500">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            placeholder="0.00"
                            className="input-field w-24 text-right text-sm py-1 px-2"
                            value={displayDollars}
                            onChange={(e) => {
                              setEditedAmounts((prev) => ({ ...prev, [item._id]: e.target.value }));
                            }}
                            onBlur={() => {
                              const val = editedAmounts[item._id];
                              if (val !== undefined && parseFloat(val) >= 1) {
                                saveAmount(item._id, val);
                              }
                            }}
                            disabled={isSaving}
                          />
                          {isSaving && <span className="text-xs text-gray-400">saving...</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── PAID tab: flat list ── */
        <div className="space-y-3">
          {payments.map((p) => (
            <div
              key={p._id}
              className="card flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-green-50 text-green-600">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {p.cleanerName}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <Link
                      href={`/jobs/${p.jobId}`}
                      className="hover:text-blue-600 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> {p.jobLabel}
                    </Link>
                    <span>&middot;</span>
                    <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                    {p.paidAt && (
                      <>
                        <span>&middot;</span>
                        <span>Paid {new Date(p.paidAt).toLocaleDateString()}</span>
                      </>
                    )}
                    <span>&middot;</span>
                    <span className="inline-flex items-center gap-1">
                      {p.method === "in_app" ? (
                        <>
                          <CreditCard className="w-3 h-3" />
                          via The Scrub App
                        </>
                      ) : (
                        "Paid outside app"
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-semibold text-gray-900">
                  ${((p.amountCents ?? 0) / 100).toFixed(2)}
                </span>
                <span className="badge bg-green-100 text-green-700">Paid</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
