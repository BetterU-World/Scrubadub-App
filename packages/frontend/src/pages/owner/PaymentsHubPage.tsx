import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { PageHeader } from "@/components/ui/PageHeader";
import { WorkerBalances } from "@/components/payments/WorkerBalances";
import { PartnerPayments } from "@/components/payments/PartnerCompensation";
import { useAuth } from "@/hooks/useAuth";
export function PaymentsHubPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <div className="space-y-6 min-w-0">
      <PageHeader title={t("payments.title")} />
      <WorkerBalances />
      <PartnerPayments />
      {user?.role === "owner" && <Link
        className="btn-secondary inline-block"
        href="/owner/cleaner-payments"
      >
        {t("compensation.legacy")}
      </Link>}
      {user?.role === "owner" && (
        <Link className="btn-secondary inline-block" href="/owner/settlements">
          {t("compensation.partnerHistory")}
        </Link>
      )}
    </div>
  );
}
