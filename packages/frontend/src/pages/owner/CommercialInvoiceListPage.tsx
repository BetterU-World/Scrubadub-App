import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { TableScrollRegion } from "@/components/ui/TableScrollRegion";
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
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const [status, setStatus] = useState<InvoiceStatus>("draft");

  const invoices = useQuery(
    (api as any).queries.invoices.listByCompany,
    user && sessionToken ? { userId: user._id, sessionToken, status } : "skip"
  );

  if (!user || invoices === undefined) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title={t("invoices.companyTitle")}
        description={t("invoices.companyDescription")}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={clsx(
              "touch-target rounded-lg border px-3 text-sm font-medium transition-colors",
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
          <TableScrollRegion label={t("invoices.companyTitle")}>
            <table className="block w-full sm:table">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-gray-200">
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("invoices.invoiceNumber")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("invoices.commercialAccount")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("invoices.billingPeriod")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.status")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-sm font-medium text-gray-500">
                    {t("invoices.total")}
                  </th>
                </tr>
              </thead>
              <tbody className="block space-y-3 sm:table-row-group sm:space-y-0">
                {invoices.map((invoice: any) => (
                  <tr key={invoice._id} className="block rounded-lg border border-gray-200 p-4 sm:table-row sm:rounded-none sm:border-0 sm:border-b sm:border-gray-100 sm:p-0 sm:last:border-0">
                    <td className="block sm:table-cell sm:px-4 sm:py-3 sm:whitespace-nowrap">
                      <Link
                        href={`/commercial-invoices/${invoice._id}`}
                        className="touch-target -mx-3 flex items-center px-3 font-semibold text-gray-900 hover:text-primary-700 sm:mx-0 sm:inline-flex sm:min-h-0 sm:p-0 sm:font-medium"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="block min-w-0 pb-3 text-sm text-gray-700 sm:table-cell sm:px-4 sm:py-3">
                      <span className="mr-2 text-xs font-medium text-gray-500 sm:hidden">{t("invoices.commercialAccount")}</span>
                      <span className="break-words">
                      {invoice.commercialAccountName ?? t("commercialAccounts.summary")}
                      </span>
                    </td>
                    <td className="block border-t border-gray-100 py-2 text-sm text-gray-700 sm:table-cell sm:border-0 sm:px-4 sm:py-3 sm:whitespace-nowrap">
                      <span className="mr-2 text-xs font-medium text-gray-500 sm:hidden">{t("invoices.billingPeriod")}</span>
                      {formatDate(invoice.billingStartDate)} - {formatDate(invoice.billingEndDate)}
                    </td>
                    <td className="block py-2 sm:table-cell sm:px-4 sm:py-3 sm:whitespace-nowrap">
                      <span className="mr-2 text-xs font-medium text-gray-500 sm:hidden">{t("commercialAccounts.status")}</span>
                      <span className="badge bg-gray-100 text-gray-700">
                        {t(`invoices.statuses.${invoice.status}`)}
                      </span>
                    </td>
                    <td className="block border-t border-gray-100 pt-3 text-left text-xl font-bold text-gray-900 sm:table-cell sm:border-0 sm:px-4 sm:py-3 sm:text-right sm:text-sm sm:font-semibold sm:whitespace-nowrap">
                      <span className="mr-2 text-xs font-medium text-gray-500 sm:hidden">{t("invoices.total")}</span>
                      {formatCents(invoice.totalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollRegion>
        </div>
      )}
    </div>
  );
}
