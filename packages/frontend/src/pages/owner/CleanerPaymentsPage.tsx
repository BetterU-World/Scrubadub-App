import { useState } from "react";
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
} from "lucide-react";

type Tab = "OPEN" | "PAID";

interface CleanerGroup {
  cleanerUserId: string;
  cleanerName: string;
  cleanerStripeAccountId: string | null;
  items: Array<{
    _id: string;
    jobId: string;
    amountCents: number;
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

  const payments = useQuery(
    api.queries.cleanerPayments.listCleanerPaymentsForCompany,
    user?._id ? { userId: user._id, status: tab } : "skip",
  );

  const createBatch = useMutation(api.mutations.cleanerPayments.createCleanerPaymentBatch);
  const markBatchOutside = useMutation(api.mutations.cleanerPayments.markCleanerBatchPaidOutside);
  const createCheckout = useAction(api.actions.cleanerPayments.createCleanerPaymentCheckout);

  if (!user) return <PageLoader />;

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
      g.totalCents += p.amountCents;
    }
    return Array.from(map.values());
  }

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
          {groupByCleaner(payments).map((group) => (
            <div key={group.cleanerUserId} className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">{group.cleanerName}</p>
                  <p className="text-sm text-gray-500">
                    {group.items.length} unpaid job{group.items.length !== 1 ? "s" : ""} &middot; Total: ${(group.totalCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  {group.cleanerStripeAccountId && (
                    <button
                      disabled={batchLoading !== null}
                      onClick={() => handleBatchStripe(group)}
                      className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1"
                    >
                      <CreditCard className="w-4 h-4" />
                      {batchLoading === group.cleanerUserId ? "Loading..." : "Pay All via App"}
                    </button>
                  )}
                  <button
                    disabled={batchLoading !== null}
                    onClick={() => handleBatchOutside(group)}
                    className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {batchLoading === group.cleanerUserId ? "Saving..." : "Mark All Paid Outside"}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div key={item._id} className="flex items-center justify-between text-sm py-1 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Link
                        href={`/jobs/${item.jobId}`}
                        className="hover:text-blue-600 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> {item.jobLabel}
                      </Link>
                      <span className="text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                    <span className="font-medium text-gray-900">${(item.amountCents / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
                  ${(p.amountCents / 100).toFixed(2)}
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
