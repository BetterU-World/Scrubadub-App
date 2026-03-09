import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { DollarSign, Building2, FileText, TrendingUp, Percent } from "lucide-react";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function shortenId(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 12) return id;
  return id.slice(0, 6) + "..." + id.slice(-4);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function typeLabel(type: string | null): string {
  if (type === "invoice_paid") return "Invoice Paid";
  if (type === "subscription_created") return "Subscription";
  return type ?? "—";
}

export function AffiliateRevenueTab() {
  const { t } = useTranslation();
  const { userId, isLoading } = useAuth();

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-4">{t("common.loading")}</p>;
  }

  if (!userId) {
    return <p className="text-sm text-gray-500 py-4">{t("affiliate.signInForRevenue")}</p>;
  }

  return <AffiliateRevenueInner userId={userId} />;
}

function AffiliateRevenueInner({ userId }: { userId: Id<"users"> }) {
  const { t } = useTranslation();
  const summary = useQuery(
    api.queries.affiliateAttributions.getMyAttributionSummary,
    { userId },
  );
  const attributions = useQuery(
    api.queries.affiliateAttributions.listMyAttributions,
    { userId },
  );

  if (summary === undefined || attributions === undefined) {
    return <p className="text-sm text-gray-400 py-4">{t("affiliate.loadingRevenue")}</p>;
  }

  const hasData = summary.lifetimeRevenueCents > 0 || (attributions.rows.length > 0);

  return (
    <div className="space-y-6">
      {/* Revenue stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-green-600" />}
          label={t("affiliate.lifetimeRevenue")}
          value={formatCents(summary.lifetimeRevenueCents)}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
          label={t("affiliate.last30Days")}
          value={formatCents(summary.last30dRevenueCents)}
        />
        <StatCard
          icon={<FileText className="h-5 w-5 text-purple-600" />}
          label={t("affiliate.last7Days")}
          value={formatCents(summary.last7dRevenueCents)}
        />
        <StatCard
          icon={<Building2 className="h-5 w-5 text-orange-600" />}
          label={t("affiliate.referredCompanies")}
          value={String(summary.totalReferredCompanies)}
        />
      </div>

      {/* Commission stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<Percent className="h-5 w-5 text-emerald-600" />}
          label={t("affiliate.lifetimeCommission")}
          value={formatCents(summary.lifetimeCommissionCents)}
        />
        <StatCard
          icon={<Percent className="h-5 w-5 text-emerald-600" />}
          label={t("affiliate.thirtyDayCommission")}
          value={formatCents(summary.last30dCommissionCents)}
        />
        <StatCard
          icon={<Percent className="h-5 w-5 text-emerald-600" />}
          label={t("affiliate.sevenDayCommission")}
          value={formatCents(summary.last7dCommissionCents)}
        />
      </div>

      {/* Attributions table */}
      {!hasData ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-sm text-gray-500">
            {t("affiliate.noRevenueYet")}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("affiliate.date")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("affiliate.company")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("affiliate.type")}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t("affiliate.amount")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("affiliate.currency")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t("affiliate.invoiceId")}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {attributions.rows.map((row) => (
                  <tr key={row._id}>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {row.purchaserCompanyName ?? "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          row.attributionType === "invoice_paid"
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {row.attributionType === "invoice_paid" ? t("affiliate.invoicePaid") : row.attributionType === "subscription_created" ? t("affiliate.subscription") : (row.attributionType ?? "—")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap font-medium">
                      {formatCents(row.amountCents)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 uppercase whitespace-nowrap">
                      {row.currency}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono whitespace-nowrap">
                      {shortenId(row.stripeInvoiceId)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
