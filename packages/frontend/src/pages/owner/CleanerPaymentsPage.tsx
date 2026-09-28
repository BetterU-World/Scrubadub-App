import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Link } from "wouter";
import { LegacyWorkerHistory } from "@/components/payments/LegacyWorkerHistory";
export function CleanerPaymentsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 min-w-0">
      <PageHeader title={t("compensation.legacy")} />
      <Link href="/owner/payments" className="btn-secondary inline-block">
        {t("nav.payments")}
      </Link>
      <LegacyWorkerHistory company />
    </div>
  );
}
