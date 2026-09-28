import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/PageHeader";
import { WorkerBalances } from "@/components/payments/WorkerBalances";
import { LegacyWorkerHistory } from "@/components/payments/LegacyWorkerHistory";
export function CleanerPaymentsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 min-w-0">
      <PageHeader title={t("compensation.title")} />
      <WorkerBalances />
      <LegacyWorkerHistory company />
    </div>
  );
}
