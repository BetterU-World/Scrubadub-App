import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { clsx } from "clsx";

type InvoiceStatus = "draft" | "issued" | "paid" | "void";

const STATUSES: InvoiceStatus[] = ["draft", "issued", "paid", "void"];

function formatCents(cents: number | undefined) {
  if (cents == null) return "$0.00";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(date: string | undefined) {
  if (!date) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

export function CommercialInvoiceListPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [status, setStatus] = useState<InvoiceStatus>("draft");

  const invoices = useQuery(
    (api as any).queries.invoices.listByCompany,
    user ? { userId: user._id, status } : "skip"
  );

  if (!user || invoices === undefined) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title={t("invoices.companyTitle")}
        description={t("invoices.companyDescription")}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={clsx(
              "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              status === value
                ? "border-primary-200 bg-primary-50 text-primary-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            )}
          >
            {t(`invoices.statuses.${value}`)}
          </button>
        ))}
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("invoices.none")}
          description={t("invoices.emptyForStatus")}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("invoices.invoiceNumber")}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("invoices.commercialAccount")}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("invoices.billingPeriod")}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.status")}
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                    {t("invoices.total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice: any) => (
                  <tr key={invoice._id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/commercial-invoices/${invoice._id}`}
                        className="font-medium text-gray-900 hover:text-primary-700"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {invoice.commercialAccountName ?? t("commercialAccounts.summary")}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {formatDate(invoice.billingStartDate)} - {formatDate(invoice.billingEndDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge bg-gray-100 text-gray-700">
                        {t(`invoices.statuses.${invoice.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                      {formatCents(invoice.totalCents)}
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
