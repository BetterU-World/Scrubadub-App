import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
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
        description={t("commercialAccounts.description")}
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.clientName")}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.contractAmount")}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.frequency")}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.status")}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.dates")}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.assignment")}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    {t("commercialAccounts.source")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account: any) => (
                  <tr key={account._id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/commercial-accounts/${account._id}`}
                        className="font-medium text-gray-900 hover:text-primary-700"
                      >
                        {account.clientName}
                      </Link>
                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{account.serviceAddress || t("commercialAccounts.noServiceAddress")}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {formatPrice(account.contractAmountCents, notSet)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {account.serviceFrequency
                        ? t(`leadFrequencies.${account.serviceFrequency}`)
                        : t("common.unassigned")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge bg-gray-100 text-gray-700 capitalize">
                        {t(`commercialAccounts.statuses.${account.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                        <span>{formatDate(account.startDate, notSet)}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {t("commercialAccounts.renews")} {formatDate(account.renewalDate, notSet)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div>{account.assignedManagerName ?? t("common.unassigned")}</div>
                      <div className="text-xs text-gray-500">
                        {account.assignedTeamName ??
                          account.assignedCleanerName ??
                          t("common.unassigned")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {account.sourceLead ? (
                        <Link
                          href={`/requests/${account.sourceLead._id}`}
                          className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          {account.sourceProposal?.title ?? account.sourceLead.businessName ?? account.sourceLead.requesterName}
                        </Link>
                      ) : (
                        <span className="text-gray-400">{t("common.unavailable")}</span>
                      )}
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
