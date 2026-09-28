import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { LegacyOutgoingNotice } from "@/components/payments/LegacyOutgoingNotice";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { FinancialBoundary } from "@/components/payments/FinancialBoundary";

export function SettlementsPage() {
  return <FinancialBoundary><SettlementHistory /></FinancialBoundary>;
}
function SettlementHistory() {
  const { t } = useTranslation();
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
    <div className="space-y-4 min-w-0">
      <PageHeader
        title={t("paymentsCutover.partnerLegacyTitle")}
        description={t("paymentsCutover.partnerLegacyHelp")}
      />
      <Link href="/owner/payments" className="btn-secondary inline-block">{t("partnerCompensation.openPayments")}</Link>
      <LegacyOutgoingNotice />
      {records === undefined ? (
        <PageLoader />
      ) : records.length === 0 ? (
        <p>{t("paymentsCutover.partnerLegacyEmpty")}</p>
      ) : (
        records.map((record) => (
          <div className="card space-y-1 min-w-0 break-words" key={record._id}>
            <p className="font-semibold">
              {t(record.direction === "owing" ? "paymentsCutover.payable" : "paymentsCutover.receivable", { name: record.counterpartyName })}
            </p>
            <p>{record.jobLabel}</p>
            <p>
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: record.currency,
              }).format(record.amountCents / 100)}{" "}
              ·{" "}
              {t(record.status === "open" ? "compensation.legacyOpen" : "compensation.legacyPaid")}
            </p>
            <p className="text-sm text-gray-500">
              {record.paidMethod === "scrubadub_stripe"
                ? t("compensation.legacyMethod")
                : record.paidMethod
                  ? t("paymentsCutover.outsideMethod", { method: record.paidMethod })
                  : t("paymentsCutover.methodMissing")}
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
