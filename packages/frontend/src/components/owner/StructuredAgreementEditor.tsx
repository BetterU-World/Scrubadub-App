import { Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import type { ReactNode } from "react";
import { AddOnSnapshotList } from "../AddOnSnapshotList";
import type { AgreementForm, AgreementSection } from "./agreementEditorModel";

const FREQUENCIES = ["one_time", "weekly", "biweekly", "monthly", "quarterly", "custom"] as const;
const SECTIONS: AgreementSection[] = ["details", "services", "billing", "terms", "notes"];

type Props = {
  form: AgreementForm;
  onChange: (field: keyof AgreementForm, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onChangeTemplate: () => void;
  onUnsavedNavigation: () => void;
  saving: boolean;
  dirty: boolean;
  template: { name: string; version?: number | null; fallback: boolean };
  canManageTemplates: boolean;
  addOns: any[];
  revision: boolean;
};

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <label htmlFor={`agreement-field-${id}`} className="block min-w-0 space-y-1.5">
    <span className="block text-sm font-medium text-gray-700">{label}</span>
    {children}
  </label>;
}

function Section({ id, title, description, children }: { id: AgreementSection; title: string; description?: string; children: ReactNode }) {
  return <section id={`agreement-section-${id}`} className="scroll-mt-28 space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby={`agreement-heading-${id}`}>
    <div className="border-b border-gray-100 pb-3">
      <h4 id={`agreement-heading-${id}`} className="text-base font-semibold text-gray-900">{title}</h4>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </div>
    {children}
  </section>;
}

export function StructuredAgreementEditor({ form, onChange, onSave, onCancel, onChangeTemplate, onUnsavedNavigation, saving, dirty, template, canManageTemplates, addOns, revision }: Props) {
  const { t } = useTranslation();
  const input = (field: keyof AgreementForm, type = "text") => <input id={`agreement-field-${field}`} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} className="input-field w-full" value={form[field]} onChange={(event) => onChange(field, event.target.value)} />;
  const area = (field: keyof AgreementForm, rows = 3) => <textarea id={`agreement-field-${field}`} className="input-field w-full resize-y" rows={rows} value={form[field]} onChange={(event) => onChange(field, event.target.value)} />;

  return <div className="space-y-5">
    <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{t("serviceAgreements.v2.editHeading")}</p>
          <p className="mt-1 text-sm text-gray-700">{t(revision ? "serviceAgreements.v2.revisionNote" : "serviceAgreements.v2.proposalSourceNote")}</p>
        </div>
        <p role="status" aria-live="polite" className={`shrink-0 text-sm font-medium ${dirty || saving ? "text-amber-800" : "text-green-800"}`}>
          {t(saving ? "serviceAgreements.v2.savingState" : dirty ? "serviceAgreements.v2.unsavedState" : "serviceAgreements.v2.savedState")}
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-primary-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 break-words text-sm text-gray-700">
          <span className="font-medium">{t("serviceAgreements.v2.templateLabel")}: </span>
          {template.name}{template.version != null && !template.fallback ? ` · v${template.version}` : ""}
          {template.fallback && <span className="ml-1 text-gray-500">({t("serviceAgreements.v2.scrubFallback")})</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onChangeTemplate} className="text-sm font-medium text-primary-700 underline-offset-2 hover:underline">{t("serviceAgreements.v2.changeTemplate")}</button>
          {canManageTemplates && <Link href="/owner/settings/documents" onClick={(event) => { if (dirty) { event.preventDefault(); onUnsavedNavigation(); } }} className="text-sm text-gray-600 underline-offset-2 hover:underline">{t("serviceAgreements.v2.manageTemplates")}</Link>}
        </div>
      </div>
    </div>

    <nav aria-label={t("serviceAgreements.v2.sectionNavigation")} className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm">
      {SECTIONS.map((section) => <a key={section} href={`#agreement-section-${section}`} className="rounded-md px-3 py-2 font-medium text-gray-700 hover:bg-white hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500">
        {t(`serviceAgreements.v2.sections.${section}`)}
      </a>)}
    </nav>

    <Section id="details" title={t("serviceAgreements.v2.sections.details")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="title" label={t("serviceAgreements.agreementTitle")}>{input("title")}</Field>
        <Field id="clientName" label={t("serviceAgreements.clientName")}>{input("clientName")}</Field>
        <div className="sm:col-span-2"><Field id="propertyAddress" label={t("serviceAgreements.propertyAddress")}>{input("propertyAddress")}</Field></div>
        <Field id="serviceFrequency" label={t("serviceAgreements.frequency")}>
          <select id="agreement-field-serviceFrequency" className="input-field w-full" value={form.serviceFrequency} onChange={(event) => onChange("serviceFrequency", event.target.value)}>
            <option value="">{t("common.select")}</option>
            {FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{t(`leadFrequencies.${frequency}`)}</option>)}
          </select>
        </Field>
        <Field id="effectiveStartDate" label={t("serviceAgreements.effectiveStartDate")}>{input("effectiveStartDate", "date")}</Field>
        <Field id="effectiveEndDate" label={t("serviceAgreements.effectiveEndDate")}>{input("effectiveEndDate", "date")}</Field>
        <Field id="renewalDate" label={t("serviceAgreements.renewalDate")}>{input("renewalDate", "date")}</Field>
      </div>
    </Section>

    <Section id="services" title={t("serviceAgreements.v2.sections.services")} description={t("serviceAgreements.v2.servicesHelp")}>
      <Field id="servicesIncluded" label={t("serviceAgreements.servicesIncluded")}>{area("servicesIncluded")}</Field>
      <Field id="scopeOfWork" label={t("serviceAgreements.scopeOfWork")}>{area("scopeOfWork", 4)}</Field>
      {addOns.length > 0 && <div className="space-y-2 border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-700">{t("serviceAgreements.v2.committedAddOns")}</p>
        <p className="text-xs text-gray-500">{t("serviceAgreements.v2.addOnsHelp")}</p>
        <AddOnSnapshotList items={addOns} audience="owner" showPricing />
      </div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Field id="specialInstructions" label={t("serviceAgreements.specialInstructions")}>{area("specialInstructions")}</Field>
        <Field id="exceptions" label={t("serviceAgreements.exceptions")}>{area("exceptions")}</Field>
      </div>
    </Section>

    <Section id="billing" title={t("serviceAgreements.v2.sections.billing")} description={t("serviceAgreements.pricingConsistencyHelp")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="contractAmount" label={t("serviceAgreements.contractAmount")}>{input("contractAmount", "number")}</Field>
        <Field id="priceSummary" label={t("serviceAgreements.priceSummary")}>{input("priceSummary")}</Field>
        <Field id="billingSchedule" label={t("serviceAgreements.billingSchedule")}>{input("billingSchedule")}</Field>
        <Field id="paymentTerms" label={t("serviceAgreements.paymentTerms")}>{input("paymentTerms")}</Field>
      </div>
    </Section>

    <Section id="terms" title={t("serviceAgreements.v2.sections.terms")} description={t("serviceAgreements.v2.termsHelp")}>
      <Field id="terms" label={t("serviceAgreements.terms")}>{area("terms", 5)}</Field>
    </Section>

    <Section id="notes" title={t("serviceAgreements.v2.sections.notes")} description={t("serviceAgreements.v2.internalOnly")}>
      <Field id="notes" label={t("serviceAgreements.internalNotes")}>{area("notes")}</Field>
    </Section>

    <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={onCancel} className="btn-secondary text-sm">{t("common.cancel")}</button>
      <button type="button" onClick={onSave} disabled={saving || !dirty} className="btn-primary flex items-center justify-center gap-2 text-sm">
        <Save className="h-4 w-4" aria-hidden="true" />{saving ? t("serviceAgreements.v2.savingState") : t("serviceAgreements.save")}
      </button>
    </div>
  </div>;
}
