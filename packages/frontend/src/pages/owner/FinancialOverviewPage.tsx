import { useQuery } from "convex/react";
import { Link } from "wouter";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";

const money = (cents: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);

export function FinancialOverviewPage() {
  const { user, sessionToken } = useAuth();
  const summary = useQuery(
    (api as any).queries.financials.getSummary,
    user?.companyId ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip",
  );
  if (!user || summary === undefined) return <PageLoader />;
  const tiles = [
    ["Total invoiced", summary.invoicedCents],
    ["Paid revenue", summary.paidCents],
    ["Outstanding", summary.outstandingCents],
  ] as const;
  return <div>
    <PageHeader title="Financials" description="Read-only company invoice and revenue reporting." />
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      {tiles.map(([label, value]) => <div className="card" key={label}><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900">{money(value)}</p></div>)}
    </div>
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900">Invoice status totals</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {Object.entries(summary.totalsByStatus).map(([status, value]) => <div key={status}><p className="text-sm capitalize text-gray-500">{status}</p><p className="font-semibold">{money(value as number)}</p></div>)}
      </div>
      <Link href="/commercial-invoices" className="btn-secondary mt-6 inline-flex">View invoices</Link>
    </div>
  </div>;
}
