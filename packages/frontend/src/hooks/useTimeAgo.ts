import { useTranslation } from "react-i18next";

export function useTimeAgo() {
  const { t } = useTranslation();
  return (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("time.justNow");
    if (mins < 60) return t("time.minutesAgo", { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("time.hoursAgo", { count: hrs });
    const days = Math.floor(hrs / 24);
    return t("time.daysAgo", { count: days });
  };
}
