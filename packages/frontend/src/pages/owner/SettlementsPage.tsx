import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { toFriendlyMessage } from "@/lib/friendlyError";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Link } from "wouter";
import {
  DollarSign,
  CheckCircle,
  ExternalLink,
  CreditCard,
  Receipt,
} from "lucide-react";

type Tab = "open" | "paid";

interface PartnerGroup {
  counterpartyName: string;
  toCompanyId: string;
  items: Array<{
    _id: Id<"companySettlements">;
    viewableJobId: string;
    jobLabel: string;
    amountCents: number;
    createdAt: number;
  }>;
  totalCents: number;
}

export function SettlementsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("open");
  const [markingId, setMarkingId] = useState<Id<"companySettlements"> | null>(null);
  const [payingId, setPayingId] = useState<Id<"companySettlements"> | null>(null);
  const [paidMethod, setPaidMethod] = useState("");
  const [paidNote, setPaidNote] = useState("");
  const [showPayDialog, setShowPayDialog] = useState<Id<"companySettlements"> | null>(null);
  const [batchLoading, setBatchLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settlements = useQuery(
    api.queries.settlements.listMySettlements,
    user?._id ? { userId: user._id, status: tab } : "skip",
  );
  const markPaid = useMutation(api.mutations.settlements.markSettlementPaid);
  const createCheckout = useAction(api.actions.settlements.createSettlementPayCheckout);
  const createBatch = useMutation(api.mutations.settlements.createSettlementBatch);
  const markBatchOutside = useMutation(api.mutations.settlements.markSettlementBatchPaidOutside);
  const createBatchCheckout = useAction(api.actions.settlements.createSettlementBatchCheckout);

  if (!user) return <PageLoader />;

  async function handleMarkPaid(settlementId: Id<"companySettlements">) {
    setMarkingId(settlementId);
    setError(null);
    try {
      await markPaid({
        userId: user!._id,
        settlementId,
        paidMethod: paidMethod || undefined,
        note: paidNote || undefined,
      });
      setShowPayDialog(null);
      setPaidMethod("");
      setPaidNote("");
    } catch (e: any) {
      setError(toFriendlyMessage(e, "Failed to mark paid"));
    } finally {
      setMarkingId(null);
    }
  }

  async function handlePayViaScrubadub(settlementId: Id<"companySettlements">) {
    setPayingId(settlementId);
    setError(null);
    try {
      const result = await createCheckout({ userId: user!._id, settlementId });
      if (result?.url) window.location.href = result.url;
    } catch (e: any) {
      console.error("Checkout error:", e);
      setError(toFriendlyMessage(e, "Payment didn\u2019t go through. You weren\u2019t charged."));
    } finally {
      setPayingId(null);
    }
  }

  // Group open owing settlements by partner
  function groupByPartner(items: NonNullable<typeof settlements>): {
    groups: PartnerGroup[];
    owedItems: NonNullable<typeof settlements>;
  } {
    const groups = new Map<string, PartnerGroup>();
    const owedItems: NonNullable<typeof settlements> = [];

    for (const s of items) {
      if (s.direction === "owed") {
        owedItems.push(s);
        continue;
      }
      const key = String(s.toCompanyId);
      if (!groups.has(key)) {
        groups.set(key, {
          counterpartyName: s.counterpartyName,
          toCompanyId: key,
          items: [],
          totalCents: 0,
        });
      }
      const g = groups.get(key)!;
      g.items.push({
        _id: s._id,
        viewableJobId: s.viewableJobId,
        jobLabel: s.jobLabel,
        amountCents: s.amountCents,
        createdAt: s.createdAt,
      });
      g.totalCents += s.amountCents;
    }
    return { groups: Array.from(groups.values()), owedItems };
  }

  async function handleBatchStripe(group: PartnerGroup) {
    setBatchLoading(group.toCompanyId);
    setError(null);
    try {
      const settlementIds = group.items.map((i) => i._id);
      const batchId = await createBatch({ userId: user!._id, settlementIds });
      const result = await createBatchCheckout({ userId: user!._id, batchId });
      if (result?.url) window.location.href = result.url;
    } catch (e: any) {
      console.error("Checkout error:", e);
      setError(toFriendlyMessage(e, "Payment didn\u2019t go through. You weren\u2019t charged."));
    } finally {
      setBatchLoading(null);
    }
  }

  async function handleBatchOutside(group: PartnerGroup) {
    setBatchLoading(group.toCompanyId);
    setError(null);
    try {
      const settlementIds = group.items.map((i) => i._id);
      await markBatchOutside({ userId: user!._id, settlementIds, paidMethod: "outside_app" });
    } catch (e: any) {
      setError(e.message ?? "Failed to mark batch paid");
    } finally {
      setBatchLoading(null);
    }
  }

  function formatPaidMethod(method?: string) {
    if (!method) return null;
    if (method === "scrubadub_stripe") return "Paid via Scrubadub";
    return method;
  }

  return (
    <div>
      <PageHeader
        title="Settlements"
        description="Track payments owed between partner companies"
      />

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6">
          {(["open", "paid"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {settlements === undefined ? (
        <PageLoader />
      ) : settlements.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No {tab} settlements.
        </p>
      ) : tab === "open" ? (
        /* ── OPEN tab: grouped by partner with batch actions ── */
        (() => {
          const { groups, owedItems } = groupByPartner(settlements);
          return (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.toCompanyId} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        You owe {group.counterpartyName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {group.items.length} settlement{group.items.length !== 1 ? "s" : ""} &middot; Total: ${(group.totalCents / 100).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      {group.items.length > 1 && (
                        <>
                          <button
                            disabled={batchLoading !== null}
                            onClick={() => handleBatchStripe(group)}
                            className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1"
                          >
                            <CreditCard className="w-4 h-4" />
                            {batchLoading === group.toCompanyId ? "Loading..." : "Pay All via App"}
                          </button>
                          <button
                            disabled={batchLoading !== null}
                            onClick={() => handleBatchOutside(group)}
                            className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {batchLoading === group.toCompanyId ? "Saving..." : "Mark All Paid Outside"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <div key={String(item._id)} className="flex items-center justify-between text-sm py-1.5 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Link
                            href={`/jobs/${item.viewableJobId}`}
                            className="hover:text-blue-600 flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> {item.jobLabel}
                          </Link>
                          <span className="text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">${(item.amountCents / 100).toFixed(2)}</span>
                          {group.items.length === 1 && (
                            <>
                              <button
                                onClick={() => handlePayViaScrubadub(item._id)}
                                disabled={payingId !== null}
                                className="btn-primary text-xs px-2 py-1 flex items-center gap-1"
                              >
                                <CreditCard className="w-3 h-3" />
                                {payingId === item._id ? "..." : "Pay via App"}
                              </button>
                              <button
                                onClick={() => setShowPayDialog(item._id)}
                                className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                              >
                                <CheckCircle className="w-3 h-3" /> Mark Paid
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {owedItems.map((s) => (
                <div key={String(s._id)} className="card flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-green-50 text-green-600">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {s.counterpartyName} owes you
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                        <Link href={`/jobs/${s.viewableJobId}`} className="hover:text-blue-600 flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> {s.jobLabel}
                        </Link>
                        <span>&middot;</span>
                        <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <span className="font-semibold text-gray-900">${(s.amountCents / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          );
        })()
      ) : (
        /* ── PAID tab: flat list ── */
        <div className="space-y-3">
          {settlements.map((s) => {
            const isOwing = s.direction === "owing";
            const headline = isOwing
              ? `Paid to ${s.counterpartyName}`
              : `Paid by ${s.counterpartyName}`;
            const methodLabel = formatPaidMethod(s.paidMethod);

            return (
              <div key={String(s._id)} className="card flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-green-50 text-green-600">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{headline}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      <Link href={`/jobs/${s.viewableJobId}`} className="hover:text-blue-600 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> {s.jobLabel}
                      </Link>
                      <span>&middot;</span>
                      <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                      {s.paidAt && (
                        <>
                          <span>&middot;</span>
                          <span>Paid {new Date(s.paidAt).toLocaleDateString()}</span>
                        </>
                      )}
                      {methodLabel && (
                        <>
                          <span>&middot;</span>
                          <span className="inline-flex items-center gap-1">
                            {s.paidMethod === "scrubadub_stripe" && <CreditCard className="w-3 h-3" />}
                            {methodLabel}
                          </span>
                        </>
                      )}
                      {s.stripeReceiptUrl && (
                        <>
                          <span>&middot;</span>
                          <a href={s.stripeReceiptUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 flex items-center gap-1">
                            <Receipt className="w-3 h-3" /> Receipt
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-semibold text-gray-900">${(s.amountCents / 100).toFixed(2)}</span>
                  <span className="badge bg-green-100 text-green-700">Paid</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mark Paid dialog (single settlement) */}
      {showPayDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Mark Settlement Paid</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment method (optional)
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Zelle, ACH, Cash..."
                  value={paidMethod}
                  onChange={(e) => setPaidMethod(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Note (optional)
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Any notes..."
                  value={paidNote}
                  onChange={(e) => setPaidNote(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowPayDialog(null); setPaidMethod(""); setPaidNote(""); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                disabled={markingId !== null}
                onClick={() => handleMarkPaid(showPayDialog)}
                className="btn-primary"
              >
                {markingId ? "Saving..." : "Confirm Paid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
