import { useTranslation } from "react-i18next";

const LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
};

/**
 * Returns locale-aware date formatting functions based on the current i18n language.
 */
export function useLocaleDate() {
  const { i18n } = useTranslation();
  const locale = LOCALE_MAP[i18n.language] ?? "en-US";

  /** Format a timestamp as a short date (e.g. "Mar 1, 2026") */
  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  /** Format a timestamp as date + time (e.g. "3/1/2026, 2:30 PM") */
  function formatDateTime(ts: number): string {
    return new Date(ts).toLocaleString(locale);
  }

  /** Format a timestamp as short date only (e.g. "3/1/2026") */
  function formatShortDate(ts: number): string {
    return new Date(ts).toLocaleDateString(locale);
  }

  return { formatDate, formatDateTime, formatShortDate, locale };
}
