import { useTranslation } from "react-i18next";

export function LegacyOutgoingNotice() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      {t("compensation.retiredNotice")}
    </div>
  );
}
