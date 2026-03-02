import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { DollarSign, CreditCard } from "lucide-react";

export function WorkerPaymentsPage() {
  const { user } = useAuth();

  const payments = useQuery(
    api.queries.cleanerPayments.listMyCleanerPayments,
    user?._id ? { userId: user._id } : "skip",
  );

  if (!user) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="My Payments"
        description="Payments you've received for completed jobs"
      />

      {payments === undefined ? (
        <PageLoader />
      ) : payments.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No payments yet.
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
                      {p.jobLabel}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
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
                    {p.amountCents != null
                      ? `$${(p.amountCents / 100).toFixed(2)}`
                      : "—"}
                  </span>
                  {isPaid ? (
                    <span className="badge bg-green-100 text-green-700">
                      Paid
                    </span>
                  ) : p.amountCents == null ? (
                    <span className="badge bg-gray-100 text-gray-600">
                      Amount pending
                    </span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-700">
                      Not paid yet
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
