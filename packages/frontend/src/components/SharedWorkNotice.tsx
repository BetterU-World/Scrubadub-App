import { useTranslation } from "react-i18next";

export type SharedWorkAccess = { allowed: boolean; status: string | null };

export function SharedWorkNotice({ access }: { access?: SharedWorkAccess }) {
  const { t } = useTranslation();
  if (!access || access.allowed) return null;
  const key = access.status === "pending" ? "pending" : access.status === "rejected" ? "rejected" : "manualReview";
  return <div role="status" className="card mb-4 border-amber-200 bg-amber-50 text-sm text-amber-900">
    {t(`sharedWork.${key}`)}
  </div>;
}
