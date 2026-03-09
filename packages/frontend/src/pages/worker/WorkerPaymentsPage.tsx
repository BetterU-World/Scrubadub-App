import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { DollarSign, CreditCard } from "lucide-react";
import { useTranslation } from "react-i18next";

export function WorkerPaymentsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const jobs = useQuery(
    api.queries.cleanerPayments.listCleanerJobsWithPaymentStatus,
    user?._id ? { userId: user._id } : "skip",
  );

  if (!user) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title={t("payments.myPayments")}
        description={t("payments.myPaymentsDesc")}
      />

      {jobs === undefined ? (
        <PageLoader />
      ) : jobs.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {t("payments.noJobsYet")}
        </p>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => {
            const isPaid = j.paymentStatus === "PAID";
            const isBatch = (j as any).isBatchPayment === true;
            const displayAmount = isPaid
              ? j.amountCents
              : j.plannedPayCents;
            // Legacy batch: paid in batch but no per-job amount stored
            const isLegacyBatch = isPaid && isBatch && j.amountCents == null;

            return (
              <div
                key={j._id}
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
                      {j.jobLabel}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      <span className="capitalize">{j.status.replace("_", " ")}</span>
                      {j.paidAt && (
                        <>
                          <span>&middot;</span>
                          <span>
                            {t("payments.paidOn")} {new Date(j.paidAt).toLocaleDateString()}
                          </span>
                        </>
                      )}
                      {isPaid && (
                        <>
                          <span>&middot;</span>
                          <span className="inline-flex items-center gap-1">
                            {j.method === "in_app" ? (
                              <>
                                <CreditCard className="w-3 h-3" />
                                {t("payments.viaScrub")}
                              </>
                            ) : (
                              t("payments.paidOutsideApp")
                            )}
                          </span>
                        </>
                      )}
                      {isBatch && (
                        <>
                          <span>&middot;</span>
                          <span className="text-xs text-gray-400">{t("payments.paidInBatch")}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-semibold text-gray-900">
                    {isLegacyBatch
                      ? "—"
                      : displayAmount != null
                        ? `$${(displayAmount / 100).toFixed(2)}`
                        : "—"}
                  </span>
                  {isPaid ? (
                    <span className="badge bg-green-100 text-green-700">
                      {t("status.paid")}
                    </span>
                  ) : displayAmount != null ? (
                    <span className="badge bg-blue-100 text-blue-700">
                      {t("status.planned")}
                    </span>
                  ) : (
                    <span className="badge bg-gray-100 text-gray-600">
                      {t("status.amountPending")}
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
