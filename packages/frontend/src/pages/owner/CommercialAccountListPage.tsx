import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableScrollRegion } from "@/components/ui/TableScrollRegion";
import { Building2, CalendarDays, ClipboardCheck, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { clsx } from "clsx";

type AccountStatus = "active" | "paused" | "ended";

const STATUSES: AccountStatus[] = ["active", "paused", "ended"];

function formatPrice(cents: number | undefined, fallback: string) {
  if (cents == null) return fallback;
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date: string | undefined, fallback: string) {
  if (!date) return fallback;
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

export function CommercialAccountListPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const [status, setStatus] = useState<AccountStatus>("active");
  const notSet = t("commercialAccounts.notSet");

  const accounts = useQuery(
    (api as any).queries.commercialAccounts.listByCompany,
    user ? { userId: user._id, sessionToken, status } : "skip"
  );

  if (!user || accounts === undefined) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title={t("commercialAccounts.title")}
        description={t("guidance.owner.commercialAccounts")}
      />

      <div className="mb-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
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
            {t(`commercialAccounts.statuses.${value}`)}
          </button>
        ))}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("commercialAccounts.emptyTitle")}
          description={t("commercialAccounts.emptyDesc")}
        />
      ) : (
        <div className="card overflow-hidden">
          <TableScrollRegion label={t("commercialAccounts.title")}>
            <table className="block w-full sm:table">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-gray-200">
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.clientName")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.contractAmount")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.frequency")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.status")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.dates")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.assignment")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.source")}
                  </th>
                </tr>
              </thead>
              <tbody className="block space-y-3 sm:table-row-group sm:space-y-0">
                {accounts.map((account: any) => (
                  <tr key={account._id} className="block rounded-lg border border-gray-200 p-4 sm:table-row sm:rounded-none sm:border-0 sm:border-b sm:border-gray-100 sm:p-0 sm:last:border-0">
                    <td className="block min-w-0 pb-3 sm:table-cell sm:px-4 sm:py-3">
                      <Link
                        href={`/commercial-accounts/${account._id}`}
                        className="touch-target -mx-3 flex items-center break-words px-3 font-semibold text-gray-900 hover:text-primary-700 sm:mx-0 sm:inline-flex sm:min-h-0 sm:p-0 sm:font-medium"
                      >
                        {account.clientName}
                      </Link>
                      <div className="mt-1 flex items-start gap-1 text-xs text-gray-500">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="break-words">{account.serviceAddress || t("commercialAccounts.noServiceAddress")}</span>
                      </div>
                    </td>
                    <td className="block border-t border-gray-100 py-2 text-sm text-gray-700 sm:table-cell sm:border-0 sm:px-4 sm:py-3 sm:whitespace-nowrap">
                      <span className="mr-2 text-xs font-medium text-gray-500 sm:hidden">{t("commercialAccounts.contractAmount")}</span>
                      {formatPrice(account.contractAmountCents, notSet)}
                    </td>
                    <td className="block py-2 text-sm text-gray-700 sm:table-cell sm:px-4 sm:py-3">
                      <span className="mr-2 text-xs font-medium text-gray-500 sm:hidden">{t("commercialAccounts.frequency")}</span>
                      {account.serviceFrequency
                        ? t(`leadFrequencies.${account.serviceFrequency}`)
                        : t("common.unassigned")}
                    </td>
                    <td className="block py-2 sm:table-cell sm:px-4 sm:py-3 sm:whitespace-nowrap">
                      <span className="mr-2 text-xs font-medium text-gray-500 sm:hidden">{t("commercialAccounts.status")}</span>
                      <span className="badge bg-gray-100 text-gray-700 capitalize">
                        {t(`commercialAccounts.statuses.${account.status}`)}
                      </span>
                    </td>
                    <td className="block py-2 text-sm text-gray-700 sm:table-cell sm:px-4 sm:py-3 sm:whitespace-nowrap">
                      <span className="mb-1 block text-xs font-medium text-gray-500 sm:hidden">{t("commercialAccounts.dates")}</span>
                      <div className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                        <span>{formatDate(account.startDate, notSet)}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {t("commercialAccounts.renews")} {formatDate(account.renewalDate, notSet)}
                      </div>
                    </td>
                    <td className="block py-2 text-sm text-gray-700 sm:table-cell sm:px-4 sm:py-3">
                      <span className="mb-1 block text-xs font-medium text-gray-500 sm:hidden">{t("commercialAccounts.assignment")}</span>
                      <div>{account.assignedManagerName ?? t("common.unassigned")}</div>
                      <div className="text-xs text-gray-500">
                        {account.assignedTeamName ??
                          account.assignedCleanerName ??
                          t("common.unassigned")}
                      </div>
                    </td>
                    <td className="block border-t border-gray-100 pt-3 text-sm text-gray-700 sm:table-cell sm:border-0 sm:px-4 sm:py-3">
                      <span className="mb-1 block text-xs font-medium text-gray-500 sm:hidden">{t("commercialAccounts.source")}</span>
                      {account.sourceLead ? (
                        <Link
                          href={`/requests/${account.sourceLead._id}`}
                          className="touch-target -mx-3 inline-flex items-center gap-1 px-3 text-primary-600 hover:text-primary-700 sm:mx-0 sm:min-h-0 sm:p-0"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
                          <span className="break-words">
                            {account.sourceProposal?.title ?? account.sourceLead.businessName ?? account.sourceLead.requesterName}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-gray-400">{t("common.unavailable")}</span>
                      )}
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
