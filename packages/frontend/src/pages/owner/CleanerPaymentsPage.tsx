import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { LegacyOutgoingNotice } from "@/components/payments/LegacyOutgoingNotice";

export function CleanerPaymentsPage() {
  const { user, sessionToken } = useAuth();
  const records = useQuery(
    api.queries.cleanerPayments.listCleanerPaymentsForCompany,
    user && sessionToken ? { userId: user._id, sessionToken } : "skip",
  );
  if (!user) return <PageLoader />;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Worker payment history"
        description="Read-only records from the retired payment workflow."
      />
      <LegacyOutgoingNotice />
      {records === undefined ? (
        <PageLoader />
      ) : records.length === 0 ? (
        <p>No historical worker payment records.</p>
      ) : (
        records.map((record) => (
          <div className="card space-y-1" key={record._id}>
            <p className="font-semibold">{record.cleanerName}</p>
            <p>{record.jobLabel}</p>
            <p>
              {record.amountCents == null
                ? "Amount not recorded"
                : new Intl.NumberFormat(undefined, {
                    style: "currency",
                    currency: "USD",
                  }).format(record.amountCents / 100)}{" "}
              ·{" "}
              {record.status === "OPEN"
                ? "Historical open record — unavailable"
                : record.status}
            </p>
            <p className="text-sm text-gray-500">
              {record.method === "outside_app"
                ? "Recorded outside SCRUB"
                : record.method === "in_app"
                  ? "Legacy in-app payment record"
                  : "Payment method not recorded"}
              {record.paidAt
                ? " · " + new Date(record.paidAt).toLocaleDateString()
                : ""}
            </p>
            <p className="text-xs text-gray-500">
              Historical totals may cover multiple jobs; no individual
              allocation is inferred.
            </p>
          </div>
        ))
      )}
    </div>
  );
}
