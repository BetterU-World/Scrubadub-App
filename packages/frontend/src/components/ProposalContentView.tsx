import { useTranslation } from "react-i18next";

export type ProposalContent = {
  company: { companyName: string; companyLogoUrl?: string | null; companyEmail?: string | null; companyPhone?: string | null };
  clientName: string;
  proposal: {
    title: string; businessName?: string | null; propertyAddress?: string | null;
    serviceFrequencyLabel?: string | null; serviceFrequencyNotes?: string | null;
    scopeOfWork?: string | null; notes?: string | null;
    monthlyPriceLabel?: string | null; oneTimePriceLabel?: string | null;
    addOnLineItems?: Array<{ name: string; pricingMethod: string; unitPriceLabel?: string | null;
      unitLabel?: string | null; quantity?: number | null; billingCadence: "monthly" | "one_time";
      lineTotalLabel?: string | null }>;
    totals?: { monthlyTotalLabel?: string | null; oneTimeTotalLabel?: string | null };
  };
};

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
    <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
    <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-gray-900">{value}</p>
  </div>;
}

export function ProposalContentView({ content, legacyBaseOnly = false }: { content: ProposalContent; legacyBaseOnly?: boolean }) {
  const { t } = useTranslation();
  const proposal = content.proposal;
  const monthly = legacyBaseOnly ? proposal.monthlyPriceLabel : proposal.totals?.monthlyTotalLabel ?? proposal.monthlyPriceLabel;
  const oneTime = legacyBaseOnly ? proposal.oneTimePriceLabel : proposal.totals?.oneTimeTotalLabel ?? proposal.oneTimePriceLabel;
  return <article className="min-w-0 space-y-5">
    <div className="flex min-w-0 items-start gap-3 border-b border-gray-100 pb-4">
      {content.company.companyLogoUrl && <img src={content.company.companyLogoUrl} alt="" className="h-10 w-10 shrink-0 rounded object-contain" />}
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-gray-900">{content.company.companyName}</p>
        {content.company.companyEmail && <p className="break-all text-xs text-gray-600">{content.company.companyEmail}</p>}
        {content.company.companyPhone && <p className="break-words text-xs text-gray-600">{content.company.companyPhone}</p>}
      </div>
    </div>
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase text-primary-700">{t("proposals.title")}</p>
      <h2 className="mt-1 break-words text-xl font-semibold text-gray-900">{proposal.title}</h2>
      <p className="mt-1 break-words text-sm text-gray-600">{t("proposals.v2.preparedFor", { client: content.clientName, company: content.company.companyName })}</p>
    </div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Detail label={t("requests.businessName")} value={proposal.businessName} />
      <Detail label={t("common.address")} value={proposal.propertyAddress} />
      <Detail label={t("proposals.serviceFrequency")} value={proposal.serviceFrequencyLabel} />
      {monthly && <Detail label={t(legacyBaseOnly ? "proposals.v2.storedMonthlyBase" : "proposals.v2.monthlyTotal")} value={monthly} />}
      {oneTime && <Detail label={t(legacyBaseOnly ? "proposals.v2.storedOneTimeBase" : "proposals.v2.oneTimeTotal")} value={oneTime} />}
    </div>
    {proposal.serviceFrequencyNotes && <div className="min-w-0"><h3 className="text-xs font-semibold uppercase text-gray-500">{t("proposals.frequencyNotes")}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{proposal.serviceFrequencyNotes}</p></div>}
    {proposal.scopeOfWork && <div className="min-w-0"><h3 className="text-xs font-semibold uppercase text-gray-500">{t("proposals.scopeOfWork")}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{proposal.scopeOfWork}</p></div>}
    {(proposal.addOnLineItems?.length ?? 0) > 0 && <div className="min-w-0 rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t("proposals.addOns.title")}</h3>
      <div className="mt-2 divide-y divide-gray-100">{proposal.addOnLineItems!.map((line, index) =>
        <div key={`${line.name}-${index}`} className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0"><p className="break-words font-medium text-gray-900">{line.name}</p>
            <p className="break-words text-xs text-gray-500">{t(line.billingCadence === "monthly" ? "proposals.addOns.monthly" : "proposals.addOns.oneTime")}{line.quantity ? ` · ${line.quantity} × ${line.unitPriceLabel} / ${line.unitLabel}` : ""}</p></div>
          <p className="shrink-0 font-semibold text-gray-900">{line.lineTotalLabel ?? t("proposals.v2.unfinalized")}</p>
        </div>)}</div>
    </div>}
    {proposal.notes && <div className="min-w-0 border-t border-gray-100 pt-4"><h3 className="text-xs font-semibold uppercase text-gray-500">{t("proposals.v2.notesToClient")}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{proposal.notes}</p></div>}
  </article>;
}
