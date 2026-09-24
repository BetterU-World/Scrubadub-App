import { useState } from "react";
import type { ReactNode } from "react";
import { Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProposalCatalogAddOnPicker } from "./ProposalCatalogAddOnPicker";
import { ProposalAddOnLineEditor } from "./ProposalAddOnLineEditor";
import { localProposalTotals, type ProposalForm } from "./proposalEditorModel";

type Props = {
  proposal: any; form: ProposalForm; onChange: (field: keyof ProposalForm, value: string) => void;
  sourceAssessment?: { title: string; completedAt?: number | null } | null;
  dirty: boolean; saving: boolean; revision: boolean;
  onSave: () => void; onCancel: () => void;
  onAddCatalog: (id: string) => Promise<unknown>;
  onAddCustom: (name: string, priceCents: number) => Promise<unknown>;
  onUpdateLine: (lineId: string, values: any) => Promise<unknown>;
  onRemoveLine: (lineId: string) => Promise<unknown>;
  onFeedback: (message: string, type: "success" | "error") => void;
};

const frequencies = ["one_time", "weekly", "biweekly", "monthly", "quarterly", "custom"] as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1.5"><span className="block text-sm font-medium text-gray-700">{label}</span>{children}</label>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={`proposal-section-${id}`} className="scroll-mt-28 space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
    <h4 className="border-b border-gray-100 pb-3 text-base font-semibold text-gray-900">{title}</h4>{children}
  </section>;
}

function PricingRow({ title, base, addOns, total, unsaved }: { title: string; base: number; addOns: number; total: number; unsaved: boolean }) {
  const { t } = useTranslation();
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value / 100);
  return <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
    <h5 className="text-sm font-semibold text-gray-900">{title}</h5>
    <dl className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
      <dt className="text-gray-600">{t("proposals.v2.basePrice")}</dt><dd className="text-right text-gray-800">{money(base)}</dd>
      <dt className="text-gray-600">{t("proposals.v2.addOnSubtotal")}</dt><dd className="text-right text-gray-800">+ {money(addOns)}</dd>
      <dt className="border-t border-gray-100 pt-2 font-semibold text-gray-900">{t("proposals.v2.proposedTotal")}</dt><dd className="border-t border-gray-100 pt-2 text-right font-semibold text-gray-900">{money(total)}</dd>
    </dl>
    {unsaved && <p className="mt-2 text-xs font-medium text-amber-800">{t("proposals.v2.unsavedCalculation")}</p>}
  </div>;
}

export function ProposalEditor({ proposal, form, onChange, sourceAssessment, dirty, saving, revision, onSave, onCancel,
  onAddCatalog, onAddCustom, onUpdateLine, onRemoveLine, onFeedback }: Props) {
  const { t } = useTranslation();
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const addOns = proposal.addOnLineItems ?? [];
  const totals = localProposalTotals(form, addOns);
  const estimated = proposal.assessmentSuggestedMonthlyPriceCents;
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value / 100);
  const input = (field: keyof ProposalForm, type = "text") => <input className="input-field w-full" type={type}
    min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined}
    value={form[field]} onChange={(event) => onChange(field, event.target.value)} />;

  return <div className="min-w-0 space-y-5">
    <div className="rounded-xl border border-primary-100 bg-primary-50 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-primary-700">{t("proposals.v2.editHeading")}</p>
          {revision && <p className="mt-1 text-sm text-gray-700">{t("proposals.v2.revisionNote")}</p>}
          {sourceAssessment && <p className="mt-1 break-words text-sm text-gray-700">{t("proposals.v2.sourceContext", {
            title: sourceAssessment.title, date: sourceAssessment.completedAt ? new Date(sourceAssessment.completedAt).toLocaleDateString() : t("proposals.v2.completedAssessment")
          })}</p>}
          {!sourceAssessment && proposal.sourceWalkthroughId && <p className="mt-1 text-sm text-gray-700">{t("proposals.v2.sourceUnavailable")}</p>}
        </div>
        <p role="status" aria-live="polite" className={`shrink-0 text-sm font-medium ${dirty || saving ? "text-amber-800" : "text-green-800"}`}>
          {t(saving ? "proposals.v2.savingState" : dirty ? "proposals.v2.unsavedState" : "proposals.v2.savedState")}
        </p>
      </div>
    </div>

    <nav aria-label={t("proposals.v2.sectionNavigation")} className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm">
      {(["client", "services", "pricing", "notes"] as const).map((section) => <a key={section} href={`#proposal-section-${section}`} className="rounded-md px-3 py-2 font-medium text-gray-700 hover:bg-white hover:text-primary-700">{t(`proposals.v2.sections.${section}`)}</a>)}
    </nav>

    <Section id="client" title={t("proposals.v2.sections.client")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("proposals.proposalTitle")}>{input("title")}</Field>
        <Field label={t("proposals.clientName")}>{input("clientName")}</Field>
        <Field label={t("requests.businessName")}>{input("businessName")}</Field>
        <Field label={t("common.address")}>{input("propertyAddress")}</Field>
      </div>
    </Section>

    <Section id="services" title={t("proposals.v2.sections.services")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("proposals.serviceFrequency")}><select className="input-field w-full" value={form.serviceFrequency} onChange={(event) => onChange("serviceFrequency", event.target.value)}>
          <option value="">{t("common.select")}</option>{frequencies.map((frequency) => <option key={frequency} value={frequency}>{t(`leadFrequencies.${frequency}`)}</option>)}
        </select></Field>
        <Field label={t("proposals.frequencyNotes")}>{input("serviceFrequencyNotes")}</Field>
      </div>
      <Field label={t("proposals.scopeOfWork")}><textarea className="input-field w-full" rows={5} value={form.scopeOfWork} onChange={(event) => onChange("scopeOfWork", event.target.value)} /></Field>
    </Section>

    <Section id="pricing" title={t("proposals.v2.sections.pricing")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("proposals.v2.monthlyBasePrice")}>{input("monthlyPrice", "number")}</Field>
        <Field label={t("proposals.v2.oneTimeBasePrice")}>{input("oneTimePrice", "number")}</Field>
      </div>
      {estimated != null && <details open={!form.monthlyPrice} className="rounded-lg border border-primary-100 bg-primary-50/50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-800">{t("proposals.v2.assessmentEstimate", { amount: money(estimated) })}</summary>
        <p className="mt-2 text-xs text-gray-600">{t("proposals.v2.estimateHelp")}</p>
        {form.monthlyPrice !== String(estimated / 100) && <button type="button" onClick={() => onChange("monthlyPrice", String(estimated / 100))} className="btn-secondary mt-2 text-xs">{t("proposals.v2.useEstimateAsBase")}</button>}
      </details>}
      {totals ? <div className="grid gap-3 sm:grid-cols-2">
        {totals.hasMonthlyPricing && <PricingRow title={t("proposals.v2.monthlyTotal")} base={totals.baseMonthlyPriceCents} addOns={totals.addOnMonthlyTotalCents} total={totals.monthlyTotalCents} unsaved={dirty} />}
        {totals.hasOneTimePricing && <PricingRow title={t("proposals.v2.oneTimeTotal")} base={totals.baseOneTimePriceCents} addOns={totals.addOnOneTimeTotalCents} total={totals.oneTimeTotalCents} unsaved={dirty} />}
      </div> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("proposals.invalidPrice")}</p>}
      {totals && !totals.hasMonthlyPricing && !totals.hasOneTimePricing && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{t("proposals.v2.noQuotedPrice")}</p>}
      {totals?.hasUnfinalizedStartingAt && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("proposals.addOns.finalizeWarning")}</p>}

      <div className="space-y-4 border-t border-gray-100 pt-4">
        <div><h5 className="font-semibold text-gray-900">{t("proposals.addOns.title")}</h5><p className="mt-1 text-xs text-gray-600">{t("proposals.v2.addOnSaveHelp")}</p></div>
        <ProposalCatalogAddOnPicker onAdd={onAddCatalog} onError={(message) => onFeedback(message, "error")} />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
          <input className="input-field min-w-0" value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder={t("proposals.addOns.customName")} />
          <input className="input-field min-w-0" type="number" min="0.01" step="0.01" value={customPrice} onChange={(event) => setCustomPrice(event.target.value)} placeholder="0.00" />
          <button type="button" className="btn-secondary" disabled={addingCustom || !customName.trim() || !customPrice} onClick={async () => {
            setAddingCustom(true);
            try { await onAddCustom(customName, Math.round(Number(customPrice) * 100)); setCustomName(""); setCustomPrice(""); }
            catch (error: any) { onFeedback(error.message || t("proposals.actionFailed"), "error"); }
            finally { setAddingCustom(false); }
          }}>{t("proposals.addOns.addCustom")}</button>
        </div>
        <div className="space-y-3">{addOns.map((line: any) => <ProposalAddOnLineEditor key={line.lineItemId} line={line} t={t}
          onSave={(values) => onUpdateLine(line.lineItemId, values)} onRemove={async () => {
            try { await onRemoveLine(line.lineItemId); }
            catch (error: any) { onFeedback(error.message || t("proposals.actionFailed"), "error"); }
          }} onFeedback={onFeedback} />)}</div>
      </div>
    </Section>

    <Section id="notes" title={t("proposals.v2.sections.notes")}>
      <p className="text-sm text-gray-600">{t("proposals.v2.clientNotesHelp")}</p>
      <Field label={t("proposals.v2.notesToClient")}><textarea className="input-field w-full" rows={4} value={form.notes} onChange={(event) => onChange("notes", event.target.value)} /></Field>
    </Section>
    <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-between">
      <button type="button" className="btn-secondary text-sm" onClick={onCancel}>{t("common.cancel")}</button>
      <button type="button" className="btn-primary flex items-center justify-center gap-2 text-sm" onClick={onSave} disabled={saving || !dirty}><Save className="h-4 w-4" />{saving ? t("proposals.v2.savingState") : t("proposals.save")}</button>
    </div>
  </div>;
}
