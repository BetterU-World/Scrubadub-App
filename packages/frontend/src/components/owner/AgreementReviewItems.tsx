import { useTranslation } from "react-i18next";
import { sectionForReviewField } from "./agreementEditorModel";

type Item = { code: string; field?: string; message?: string };
type Review = {
  warnings?: Item[];
  suggestions?: Item[];
  technicalBlockers?: Item[];
};

export function AgreementReviewItems({ review, onGoToField }: { review?: Review | null; onGoToField?: (field: string) => void }) {
  const { t } = useTranslation();
  if (!review) return null;
  const needsAttention = [...(review.technicalBlockers ?? []), ...(review.warnings ?? [])];
  const suggestions = review.suggestions ?? [];
  const label = (item: Item) => {
    const key = `serviceAgreements.v2.reviewCodes.${item.code}`;
    return t(key, { field: item.field ?? "" });
  };
  const list = (items: Item[]) => <ul className="mt-2 space-y-2">
    {items.map((item, index) => <li key={`${item.code}-${item.field ?? ""}-${index}`} className="flex min-w-0 flex-col gap-1 rounded-md bg-white/75 px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="min-w-0 break-words">{label(item)}</span>
      {item.field && sectionForReviewField(item.field) && onGoToField && <button type="button" onClick={() => onGoToField(item.field!)} className="self-start whitespace-nowrap font-medium text-primary-700 underline-offset-2 hover:underline">
        {t("serviceAgreements.v2.reviewEdit")}
      </button>}
    </li>)}
  </ul>;
  return <section aria-labelledby="agreement-review-items" className="space-y-3">
    <div>
      <h4 id="agreement-review-items" className="text-base font-semibold text-gray-900">{t("serviceAgreements.v2.reviewItems")}</h4>
      <p className="mt-1 text-sm text-gray-500">{t("serviceAgreements.v2.reviewHelp")}</p>
    </div>
    {needsAttention.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4">
      <h5 className="text-sm font-semibold text-amber-900">{t("serviceAgreements.v2.needsAttention")}</h5>
      {list(needsAttention)}
    </div>}
    {suggestions.length > 0 && <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
      <h5 className="text-sm font-semibold text-gray-700">{t("serviceAgreements.v2.suggestions")}</h5>
      {list(suggestions)}
    </div>}
    {needsAttention.length === 0 && suggestions.length === 0 && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{t("serviceAgreements.v2.noReviewItems")}</p>}
  </section>;
}
