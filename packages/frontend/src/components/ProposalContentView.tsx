import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { printProposalDocument } from "./printProposalDocument";
import "./proposalPrint.css";

export type ProposalContent = {
  presentation?: { locale: "en" | "es"; exclusions?: string; terms?: string; validThrough?: string };
  company: { companyName: string; companyLogoUrl?: string | null; companyEmail?: string | null; companyPhone?: string | null };
  clientName: string;
  proposal: {
    title: string; businessName?: string | null; propertyAddress?: string | null;
    serviceFrequency?: string | null; serviceFrequencyLabel?: string | null; serviceFrequencyNotes?: string | null;
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

export function ProposalContentView({ content, legacyBaseOnly = false, issueNumber }: {
  content: ProposalContent; legacyBaseOnly?: boolean; issueNumber?: number;
}) {
  if (content.presentation && !legacyBaseOnly) return <BrandedProposalView content={content} presentation={content.presentation} issueNumber={issueNumber} />;
  return <LegacyProposalView content={content} legacyBaseOnly={legacyBaseOnly} />;
}

function LegacyProposalView({ content, legacyBaseOnly }: { content: ProposalContent; legacyBaseOnly: boolean }) {
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

function BrandLogo({ name, url }: { name: string; url?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-teal-100 bg-teal-50 text-lg font-semibold text-teal-900">
    {url && url !== failedUrl
      ? <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain" onError={() => setFailedUrl(url)} />
      : <span aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</span>}
  </div>;
}

function ProposalProse({ heading, value }: { heading: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return <section className="min-w-0 space-y-2">
    <h3 className="text-lg font-semibold text-slate-900">{heading}</h3>
    <p className="whitespace-pre-wrap break-words leading-relaxed text-slate-700">{value}</p>
  </section>;
}

function BrandedProposalView({ content, presentation, issueNumber }: {
  content: ProposalContent; presentation: NonNullable<ProposalContent["presentation"]>; issueNumber?: number;
}) {
  const { t } = useTranslation();
  const documentRef = useRef<HTMLElement>(null);
  const [printError, setPrintError] = useState(false);
  const { company, proposal } = content;
  const lng = presentation.locale;
  const label = (key: string) => t(`proposals.branded.${key}`, { lng });
  const frequency = proposal.serviceFrequency ? t(`leadFrequencies.${proposal.serviceFrequency}`, { lng }) : proposal.serviceFrequencyLabel;
  const validity = presentation.validThrough && new Intl.DateTimeFormat(lng === "es" ? "es-US" : "en-US", {
    dateStyle: "long", timeZone: "UTC",
  }).format(new Date(`${presentation.validThrough}T00:00:00Z`));
  const groups = [
    { cadence: "one_time", base: proposal.oneTimePriceLabel, total: proposal.totals?.oneTimeTotalLabel },
    { cadence: "monthly", base: proposal.monthlyPriceLabel, total: proposal.totals?.monthlyTotalLabel },
  ] as const;
  const quotedTotals = groups.filter(group => group.total != null);
  const includesPrices = groups.some(group => group.base != null || group.total != null) || !!proposal.addOnLineItems?.length;
  return <div lang={lng} className="min-w-0">
    <article ref={documentRef} lang={lng} className="proposal-print-document min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="proposal-document-header space-y-5 border-b border-slate-200 bg-slate-50 p-5 sm:p-8">
        <div className="flex min-w-0 items-start gap-3">
          <BrandLogo name={company.companyName} url={company.companyLogoUrl} />
          <div className="min-w-0">
            <p className="break-words font-semibold text-slate-900">{company.companyName}</p>
            {company.companyEmail && <p className="break-all text-sm text-slate-600">{company.companyEmail}</p>}
            {company.companyPhone && <p className="break-words text-sm text-slate-600">{company.companyPhone}</p>}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">{label("offer")}</p>
          <h2 className="break-words text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">{proposal.title}</h2>
          {issueNumber !== undefined && <p className="text-sm text-slate-600">{t("proposals.v2.issueNumber", { lng, number: issueNumber })}</p>}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="font-medium text-slate-600">{label("preparedFor")}</dt>
            <dd className="break-words font-semibold text-slate-950">{content.clientName}</dd>
          </div>
          {(proposal.businessName || proposal.propertyAddress) && <div className="min-w-0">
            <dt className="font-medium text-slate-600">{label("property")}</dt>
            <dd className="break-words text-slate-950">{[proposal.businessName, proposal.propertyAddress].filter(Boolean).join(" · ")}</dd>
          </div>}
        </dl>
        {quotedTotals.length > 0 && <dl className="grid auto-cols-fr grid-flow-col gap-2 print:hidden">
          {quotedTotals.map(group => <div key={group.cadence} className="min-w-0 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2">
            <dt className="text-xs font-medium text-teal-900">{label(group.cadence === "monthly" ? "monthlyTotal" : "oneTimeTotal")}</dt>
            <dd className="break-words text-lg font-semibold tabular-nums text-teal-950">{group.total}</dd>
          </div>)}
        </dl>}
      </header>
      <div className="proposal-document-body space-y-6 p-5 sm:p-8">
        {(frequency || proposal.serviceFrequencyNotes || proposal.scopeOfWork) && <section className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">{label("serviceSummary")}</h3>
          {frequency && <p className="text-sm font-medium text-teal-800">{frequency}</p>}
          {proposal.serviceFrequencyNotes && <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{proposal.serviceFrequencyNotes}</p>}
          {proposal.scopeOfWork && <p className="whitespace-pre-wrap break-words leading-relaxed text-slate-700">{proposal.scopeOfWork}</p>}
        </section>}
        <ProposalProse heading={label("exclusions")} value={presentation.exclusions} />
        {includesPrices && <section className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">{label("pricing")}</h3>
          {groups.map(group => {
            const lines = (proposal.addOnLineItems ?? []).filter(line => line.billingCadence === group.cadence);
            if (group.base == null && group.total == null && !lines.length) return null;
            return <div key={group.cadence} className="proposal-pricing-group rounded-xl border border-slate-200">
              <h4 className="rounded-t-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">{label(group.cadence)}</h4>
              <dl className="divide-y divide-slate-100">
                {group.base != null && <PriceLine name={label("base")} amount={group.base} />}
                {lines.map((line, index) => <PriceLine key={index} name={line.name} amount={line.lineTotalLabel ?? t("proposals.v2.unfinalized", { lng })}
                  detail={line.quantity != null && line.unitPriceLabel && line.unitLabel
                    ? `${label("included")} · ${line.quantity} × ${line.unitPriceLabel} / ${line.unitLabel}` : label("included")} />)}
                {group.total != null && <PriceLine name={label(group.cadence === "monthly" ? "monthlyTotal" : "oneTimeTotal")} amount={group.total} total />}
              </dl>
            </div>;
          })}
        </section>}
        <ProposalProse heading={label("notes")} value={proposal.notes} />
        <ProposalProse heading={label("terms")} value={presentation.terms} />
        {validity && <div className="proposal-print-keep text-sm text-slate-700">
          <h3 className="font-semibold text-slate-900">{label("validity")}</h3>
          <p>{validity}</p>
        </div>}
      </div>
    </article>
    {issueNumber !== undefined && <div className="mt-3 print:hidden">
      <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => {
        setPrintError(!documentRef.current || !printProposalDocument(documentRef.current, proposal.title, lng));
      }}><Printer className="h-4 w-4" aria-hidden="true" />{label("print")}</button>
      {printError && <p role="alert" className="mt-2 text-sm text-red-700">{label("printBlocked")}</p>}
    </div>}
  </div>;
}

function PriceLine({ name, amount, detail, total }: { name: string; amount: string; detail?: string; total?: boolean }) {
  return <div className={`proposal-print-keep grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3 text-sm ${total ? "rounded-b-xl bg-teal-50 font-semibold text-teal-950" : "text-slate-800"}`}>
    <dt className="min-w-0 break-words">{name}{detail && <span className="block text-xs text-slate-600">{detail}</span>}</dt>
    <dd className="text-right tabular-nums">{amount}</dd>
  </div>;
}
