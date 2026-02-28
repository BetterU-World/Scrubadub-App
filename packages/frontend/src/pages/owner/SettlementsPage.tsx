import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Link } from "wouter";
import { DollarSign, CheckCircle, ExternalLink } from "lucide-react";

type Tab = "open" | "paid";

export function SettlementsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("open");
  const [markingId, setMarkingId] = useState<Id<"companySettlements"> | null>(null);
  const [paidMethod, setPaidMethod] = useState("");
  const [paidNote, setPaidNote] = useState("");
  const [showPayDialog, setShowPayDialog] = useState<Id<"companySettlements"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settlements = useQuery(
    api.queries.settlements.listMySettlements,
    user?._id ? { userId: user._id, status: tab } : "skip"
  );
  const markPaid = useMutation(api.mutations.settlements.markSettlementPaid);

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
      setError(e.message ?? "Failed to mark paid");
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div>
      <PageHeader title="Settlements" description="Track payments owed between partner companies" />

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
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {settlements === undefined ? (
        <PageLoader />
      ) : settlements.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No {tab} settlements.
        </p>
      ) : (
        <div className="space-y-3">
          {settlements.map((s) => (
            <div key={s._id} className="card flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-lg ${s.direction === "owing" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {s.direction === "owing" ? `You owe ${s.counterpartyName}` : `${s.counterpartyName} owes you`}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Link href={`/jobs/${s.originalJobId}`} className="hover:text-blue-600 flex items-center gap-1">
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
                    {s.paidMethod && (
                      <>
                        <span>&middot;</span>
                        <span className="capitalize">{s.paidMethod}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="font-semibold text-gray-900">
                  ${(s.amountCents / 100).toFixed(2)}
                </span>
                {s.status === "open" && s.direction === "owing" && (
                  <button
                    onClick={() => setShowPayDialog(s._id)}
                    className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1"
                  >
                    <CheckCircle className="w-4 h-4" /> Mark Paid
                  </button>
                )}
                {s.status === "paid" && (
                  <span className="badge bg-green-100 text-green-700">Paid</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mark Paid dialog */}
      {showPayDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Mark Settlement Paid</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment method (optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Zelle, ACH, Cash, Stripe..."
                  value={paidMethod}
                  onChange={(e) => setPaidMethod(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
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
