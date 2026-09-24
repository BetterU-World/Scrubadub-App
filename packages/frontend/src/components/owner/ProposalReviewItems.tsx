import { useTranslation } from "react-i18next";

export function ProposalReviewItems({ proposal, onEdit }: { proposal: any; onEdit?: () => void }) {
  const { t } = useTranslation();
  if (proposal.status !== "draft") return null;
  const blocked = Boolean(proposal.calculatedTotals?.hasUnfinalizedStartingAt);
  const warnings = [
    !proposal.scopeOfWork?.trim() ? "scope" : null,
    !proposal.calculatedTotals?.hasMonthlyPricing && !proposal.calculatedTotals?.hasOneTimePricing ? "price" : null,
  ].filter(Boolean) as string[];
  if (!blocked && warnings.length === 0) return null;
  return <section className="space-y-3" aria-label={t("proposals.v2.reviewItems")}>
    {blocked && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <h4 className="font-semibold">{t("proposals.v2.needsAttention")}</h4>
      <p className="mt-1">{t("proposals.addOns.finalizeWarning")}</p>
      {onEdit && <button type="button" onClick={onEdit} className="mt-2 font-medium text-primary-700 underline-offset-2 hover:underline">{t("proposals.v2.editProposal")}</button>}
    </div>}
    {warnings.length > 0 && <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
      <h4 className="font-semibold">{t("proposals.v2.reviewWarnings")}</h4>
      <ul className="mt-1 list-inside list-disc space-y-1">{warnings.map((warning) => <li key={warning}>{t(`proposals.v2.warnings.${warning}`)}</li>)}</ul>
      <p className="mt-2 text-xs text-gray-500">{t("proposals.v2.warningsNotBlocking")}</p>
    </div>}
  </section>;
}
