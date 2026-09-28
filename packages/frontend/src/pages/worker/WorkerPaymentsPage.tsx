import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecipientLedger } from "@/components/payments/RecipientLedger";
import { LegacyWorkerHistory } from "@/components/payments/LegacyWorkerHistory";
export function WorkerPaymentsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 min-w-0">
      <PageHeader title={t("compensation.title")} />
      <RecipientLedger />
      <LegacyWorkerHistory />
    </div>
  );
}
