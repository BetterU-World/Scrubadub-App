import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Link } from "wouter";
import {
  DollarSign,
  ExternalLink,
  CreditCard,
} from "lucide-react";

type Tab = "OPEN" | "PAID";

export function CleanerPaymentsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("OPEN");

  const payments = useQuery(
    api.queries.cleanerPayments.listCleanerPaymentsForCompany,
    user?._id ? { userId: user._id, status: tab } : "skip",
  );

  if (!user) return <PageLoader />;

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
              className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize ${
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

      {payments === undefined ? (
        <PageLoader />
      ) : payments.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No {tab === "OPEN" ? "open" : "paid"} cleaner payments.
        </p>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => {
            const isPaid = p.status === "PAID";

            return (
              <div
                key={p._id}
                className="card flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-lg ${
                      isPaid
                        ? "bg-green-50 text-green-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
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
                      <span>
                        {new Date(p.createdAt).toLocaleDateString()}
                      </span>
                      {p.paidAt && (
                        <>
                          <span>&middot;</span>
                          <span>
                            Paid {new Date(p.paidAt).toLocaleDateString()}
                          </span>
                        </>
                      )}
                      {isPaid && (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-semibold text-gray-900">
                    ${(p.amountCents / 100).toFixed(2)}
                  </span>
                  {isPaid ? (
                    <span className="badge bg-green-100 text-green-700">
                      Paid
                    </span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-700">
                      Open
                    </span>
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
