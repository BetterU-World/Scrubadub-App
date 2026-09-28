import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { LegacyOutgoingNotice } from "@/components/payments/LegacyOutgoingNotice";

export function SettlementsPage() {
  const { user, sessionToken } = useAuth();
  const args = user && sessionToken ? { userId: user._id, sessionToken } : null;
  const open = useQuery(
    api.queries.settlements.listMySettlements,
    args ? { ...args, status: "open" } : "skip",
  );
  const paid = useQuery(
    api.queries.settlements.listMySettlements,
    args ? { ...args, status: "paid" } : "skip",
  );
  if (!user) return <PageLoader />;
  const records =
    open && paid
      ? [...open, ...paid].sort((a, b) => b.createdAt - a.createdAt)
      : undefined;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Partner settlement history"
        description="Read-only records from the retired settlement workflow."
      />
      <LegacyOutgoingNotice />
      {records === undefined ? (
        <PageLoader />
      ) : records.length === 0 ? (
        <p>No historical partner settlements.</p>
      ) : (
        records.map((record) => (
          <div className="card space-y-1" key={record._id}>
            <p className="font-semibold">
              {record.direction === "owing"
                ? "Historical record payable to "
                : "Historical record receivable from "}
              {record.counterpartyName}
            </p>
            <p>{record.jobLabel}</p>
            <p>
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: record.currency,
              }).format(record.amountCents / 100)}{" "}
              ·{" "}
              {record.status === "open"
                ? "Historical open record — unavailable"
                : "Paid (legacy record)"}
            </p>
            <p className="text-sm text-gray-500">
              {record.paidMethod === "scrubadub_stripe"
                ? "Legacy Stripe payment record"
                : record.paidMethod
                  ? "Recorded outside SCRUB: " + record.paidMethod
                  : "Payment method not recorded"}
              {record.paidAt
                ? " · " + new Date(record.paidAt).toLocaleDateString()
                : ""}
            </p>
            {record.note && <p className="text-sm">{record.note}</p>}
          </div>
        ))
      )}
    </div>
  );
}
