import type { Dispatch, SetStateAction } from "react";
import {
  withActiveState,
  type CompanyAddOnForm,
  type PricingMethod,
} from "./companyAddOnEditor";

type Props = {
  form: CompanyAddOnForm;
  setForm: Dispatch<SetStateAction<CompanyAddOnForm>>;
  save: () => void;
  busy: boolean;
  error: string;
  t: (key: string) => string;
  onCancel?: () => void;
  onArchive?: () => void;
  hideActions?: boolean;
};

export function CompanyAddOnEditorFields({
  form,
  setForm,
  save,
  busy,
  error,
  t,
  onCancel,
  onArchive,
  hideActions = false,
}: Props) {
  const field = <K extends keyof CompanyAddOnForm>(key: K, value: CompanyAddOnForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <label className="block text-sm font-medium">{t("addOns.fields.name")}<input className="input-field mt-1" maxLength={80} value={form.name} onChange={(event) => field("name", event.target.value)} /></label>
    <label className="block text-sm font-medium">{t("addOns.fields.description")}<textarea className="input-field mt-1" maxLength={500} rows={3} value={form.description} onChange={(event) => field("description", event.target.value)} /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">{t("addOns.fields.method")}<select className="input-field mt-1" value={form.pricingMethod} onChange={(event) => field("pricingMethod", event.target.value as PricingMethod)}><option value="flat">{t("addOns.methods.flat")}</option><option value="starting_at">{t("addOns.methods.starting_at")}</option><option value="per_unit">{t("addOns.methods.per_unit")}</option></select></label><label className="block text-sm font-medium">{t("addOns.fields.price")}<input className="input-field mt-1" type="number" min="0.01" step="0.01" value={form.price} onChange={(event) => field("price", event.target.value)} /></label></div>
    {form.pricingMethod === "per_unit" && <label className="block text-sm font-medium">{t("addOns.fields.unitLabel")}<input className="input-field mt-1" maxLength={40} value={form.unitLabel} onChange={(event) => field("unitLabel", event.target.value)} /></label>}
    <label className="block text-sm font-medium">{t("addOns.fields.duration")}<input className="input-field mt-1" type="number" min="1" max="1440" value={form.estimatedDurationMinutes} onChange={(event) => field("estimatedDurationMinutes", event.target.value)} /></label>
    <label className="block text-sm font-medium">{t("addOns.fields.notes")}<textarea className="input-field mt-1" maxLength={2000} rows={3} value={form.internalNotes} onChange={(event) => field("internalNotes", event.target.value)} /></label>
    <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => withActiveState(current, event.target.checked))} />{t("addOns.active")}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} disabled={!form.isActive} onChange={(event) => field("isPublic", event.target.checked)} />{t("addOns.public")}</label></div>
    {!hideActions && <div className="flex flex-wrap justify-between gap-2"><div>{onArchive && <button className="text-sm font-medium text-red-600" disabled={busy} onClick={onArchive}>{t("addOns.archive")}</button>}</div><div className="flex gap-2"><button className="btn-secondary" disabled={busy} onClick={onCancel}>{t("common.cancel")}</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? t("common.saving") : t("common.save")}</button></div></div>}
  </div>;
}
