import { useTranslation } from "react-i18next";
import { AddOnSnapshotList } from "./AddOnSnapshotList";

type Content = Record<string, any>;

function displayDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function AgreementContentView({ content, audience }: { content: Content; audience: "owner" | "client" }) {
  const { t } = useTranslation();
  const fields: Array<[string, string | null | undefined]> = [
    ["clientName", content.clientName],
    ["propertyAddress", content.propertyAddress],
    ["servicesIncluded", content.servicesIncluded],
    ["frequency", content.serviceFrequency ? t(`leadFrequencies.${content.serviceFrequency}`) : null],
    ["contractAmount", content.contractAmountCents == null ? null : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(content.contractAmountCents / 100)],
    ["priceSummary", content.priceSummary],
    ["billingSchedule", content.billingSchedule],
    ["effectiveStartDate", displayDate(content.effectiveStartDate)],
    ["effectiveEndDate", displayDate(content.effectiveEndDate)],
    ["renewalDate", displayDate(content.renewalDate)],
    ["paymentTerms", content.paymentTerms],
    ["scopeOfWork", content.scopeOfWork],
    ["terms", content.terms],
    ["specialInstructions", content.specialInstructions],
    ["exceptions", content.exceptions],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
        {content.companyLogoUrl && <img src={content.companyLogoUrl} alt="" className="h-10 w-10 rounded object-contain" />}
        <div>
          <p className="text-sm font-semibold text-gray-900">{content.companyName}</p>
          {content.companyEmail && <p className="text-xs text-gray-600">{content.companyEmail}</p>}
          {content.companyPhone && <p className="text-xs text-gray-600">{content.companyPhone}</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([key, value]) => value ? (
          <div key={key}>
            <p className="text-xs font-medium text-gray-500">{t(`serviceAgreements.${key}`)}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900">{value}</p>
          </div>
        ) : null)}
      </div>
      <AddOnSnapshotList items={content.committedAddOns} audience={audience} showPricing />
      {content.body && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold uppercase text-gray-500">{t("serviceAgreements.body")}</p>
          <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{content.body}</p>
          </div>
        </div>
      )}
    </div>
  );
}
