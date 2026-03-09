import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Link } from "wouter";
import { Handshake, Users, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export function PaymentsHubPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const openSettlements = useQuery(
    api.queries.settlements.listMySettlements,
    user?._id ? { userId: user._id, status: "open" as const } : "skip",
  );

  const openCleanerPayments = useQuery(
    api.queries.cleanerPayments.listCleanerPaymentsForCompany,
    user?._id ? { userId: user._id, status: "OPEN" as const } : "skip",
  );

  if (!user) return <PageLoader />;

  const openSettlementsCount = openSettlements?.length ?? 0;
  const openCleanerCount = openCleanerPayments?.length ?? 0;

  return (
    <div>
      <PageHeader
        title={t("payments.title")}
        description={t("payments.description")}
      />

      <div className="max-w-lg space-y-2">
        {/* Partner Settlements */}
        <Link
          href="/owner/settlements"
          className="card flex items-center gap-4 hover:bg-gray-50 transition-colors"
        >
          <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
            <Handshake className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900">{t("payments.partnerSettlements")}</p>
            <p className="text-sm text-gray-500">
              {t("payments.partnerSettlementsDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {openSettlementsCount > 0 && (
              <span className="badge bg-amber-100 text-amber-700">
                {t("payments.countOpen", { count: openSettlementsCount })}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
        </Link>

        {/* Cleaner Payments */}
        <Link
          href="/owner/cleaner-payments"
          className="card flex items-center gap-4 hover:bg-gray-50 transition-colors"
        >
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
            <Users className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900">{t("payments.cleanerPayments")}</p>
            <p className="text-sm text-gray-500">
              {t("payments.cleanerPaymentsDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {openCleanerCount > 0 && (
              <span className="badge bg-amber-100 text-amber-700">
                {t("payments.countOpen", { count: openCleanerCount })}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
        </Link>
      </div>
    </div>
  );
}
