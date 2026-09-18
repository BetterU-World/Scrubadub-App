import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Search, Tags, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { DialogShell } from "@/components/ui/DialogShell";
import { useFeedback } from "@/components/ui/FeedbackProvider";
import { toFriendlyMessage } from "@/lib/friendlyError";
import {
  blankCompanyAddOnForm,
  createSubmissionLock,
  formForEditor,
  parsePriceCents,
  prepareCompanyAddOnValues,
  submitCompanyAddOn,
  type CompanyAddOn,
  type CompanyAddOnForm,
  type EditorMode,
  type PricingMethod,
} from "./companyAddOnEditor";
import { CompanyAddOnEditorFields } from "./CompanyAddOnEditorFields";

type Method = PricingMethod;

function currency(cents: number) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100); }

export function CompanyAddOnsPage() {
  const { t, i18n } = useTranslation();
  const feedback = useFeedback();
  const { user, sessionToken } = useAuth();
  const auth = { userId: user?._id, sessionToken };
  const records = useQuery((api as any).queries.companyAddOns.list, user ? { ...auth, includeArchived: true } : "skip") as CompanyAddOn[] | undefined;
  const presets = useQuery((api as any).queries.companyAddOns.listPresets, user ? auth : "skip") as any[] | undefined;
  const create = useMutation((api as any).mutations.companyAddOns.create);
  const update = useMutation((api as any).mutations.companyAddOns.update);
  const enablePreset = useMutation((api as any).mutations.companyAddOns.enablePreset);
  const archive = useMutation((api as any).mutations.companyAddOns.archive);
  const restore = useMutation((api as any).mutations.companyAddOns.restore);
  const reorder = useMutation((api as any).mutations.companyAddOns.reorder);
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [form, setForm] = useState<CompanyAddOnForm>(blankCompanyAddOnForm);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetSetup, setPresetSetup] = useState<any | null>(null);
  const [presetPrice, setPresetPrice] = useState("");
  const [presetMethod, setPresetMethod] = useState<Method>("flat");
  const [presetUnitLabel, setPresetUnitLabel] = useState("");
  const [presetDuration, setPresetDuration] = useState("");
  const [presetError, setPresetError] = useState("");
  const presetScrollRef = useRef<HTMLDivElement>(null);
  const presetSearchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submissionLock = useRef(createSubmissionLock());
  const activeRecords = useMemo(() => (records ?? []).filter((item) => !item.archivedAt), [records]);
  const archivedRecords = useMemo(() => (records ?? []).filter((item) => item.archivedAt), [records]);
  const locale = i18n.resolvedLanguage?.startsWith("es") ? "es" : "en";

  useLayoutEffect(() => {
    if (!presetOpen) return;
    const frame = requestAnimationFrame(() => {
      if (presetScrollRef.current) presetScrollRef.current.scrollTop = 0;
      presetSearchRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [presetOpen]);

  function openEditor(mode: EditorMode) {
    setEditor(mode);
    setForm(formForEditor(mode));
    setError("");
  }

  function closeEditor() {
    if (submissionLock.current.isLocked()) return;
    setEditor(null);
    setForm(blankCompanyAddOnForm());
    setError("");
  }

  async function save() {
    if (!user || !editor || !submissionLock.current.acquire()) return;
    const values = prepareCompanyAddOnValues(form);
    if (!values) {
      submissionLock.current.release();
      return setError(t("addOns.validation.wholeCents"));
    }
    setBusy(true); setError("");
    try {
      await submitCompanyAddOn(editor, auth, values, { create, update });
      const successMessage = t(editor.kind === "create" ? "addOns.created" : "addOns.updated");
      setEditor(null); setForm(blankCompanyAddOnForm());
      feedback.success(successMessage);
    } catch (err: unknown) {
      setError(toFriendlyMessage(err, t("addOns.validation.saveFailed")));
    } finally {
      submissionLock.current.release();
      setBusy(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...activeRecords]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await reorder({ ...auth, orderedIds: next.map((item) => item._id) });
  }

  function beginPresetSetup(preset: any) {
    setPresetSetup(preset);
    setPresetMethod(preset.pricingMethod);
    setPresetPrice("");
    setPresetUnitLabel(preset.unitLabel?.[locale] ?? "");
    setPresetDuration(preset.estimatedDurationMinutes ? String(preset.estimatedDurationMinutes) : "");
    setPresetError("");
    setPresetOpen(false);
  }

  async function confirmPreset() {
    if (!presetSetup || !submissionLock.current.acquire()) return;
    const priceCents = parsePriceCents(presetPrice);
    if (priceCents === null) {
      submissionLock.current.release();
      return setPresetError(t("addOns.validation.presetPrice"));
    }
    setBusy(true); setPresetError("");
    try {
      await enablePreset({ ...auth, presetKey: presetSetup.presetKey, locale, pricingMethod: presetMethod, priceCents, unitLabel: presetMethod === "per_unit" ? presetUnitLabel : undefined, estimatedDurationMinutes: presetDuration ? Number(presetDuration) : undefined });
      setPresetSetup(null);
    } catch (err: unknown) {
      setPresetError(toFriendlyMessage(err, t("addOns.validation.saveFailed")));
    } finally {
      submissionLock.current.release();
      setBusy(false);
    }
  }

  if (!user || records === undefined) return <LoadingSpinner size="lg" />;
  if (user.role !== "owner" && !user.canManageBusinessConfiguration) return <p className="card text-red-700">{t("addOns.noPermission")}</p>;
  return <div>
    <PageHeader title={t("addOns.title")} description={t("addOns.description")} back={{ href: user.role === "owner" ? "/owner/settings" : "/", label: t("addOns.back") }} />
    <div className="mb-5 flex flex-wrap gap-2">
      <button className="btn-primary flex items-center gap-2" onClick={() => openEditor({ kind: "create" })}><Plus className="h-4 w-4" />{t("addOns.create")}</button>
      <button className="btn-secondary flex items-center gap-2" onClick={() => setPresetOpen(true)}><Tags className="h-4 w-4" />{t("addOns.browsePresets")}</button>
    </div>
    {activeRecords.length === 0 ? <EmptyState icon={Tags} title={t("addOns.emptyTitle")} description={t("addOns.emptyDescription")} /> : <div className="space-y-3">
      {activeRecords.map((item, index) => <article key={item._id} className="card p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <button className="min-w-0 flex-1 text-left" onClick={() => editor?.kind === "edit" && editor.record._id === item._id ? closeEditor() : openEditor({ kind: "edit", record: item })} aria-expanded={editor?.kind === "edit" && editor.record._id === item._id}>
            <span className="block truncate font-semibold text-gray-900">{item.name}</span>
            <span className="text-sm text-gray-500">{t(`addOns.methods.${item.pricingMethod}`)} · {currency(item.priceCents)}{item.unitLabel ? ` / ${item.unitLabel}` : ""}</span>
          </button>
          <span className={`badge ${item.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{t(item.isActive ? "addOns.active" : "addOns.inactive")}</span>
          <span className={`badge ${item.isPublic ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{t(item.isPublic ? "addOns.public" : "addOns.private")}</span>
          <div className="flex gap-1"><button className="p-2 rounded hover:bg-gray-100 disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("addOns.moveUp")}><ChevronUp className="h-4 w-4" /></button><button className="p-2 rounded hover:bg-gray-100 disabled:opacity-30" disabled={index === activeRecords.length - 1} onClick={() => move(index, 1)} aria-label={t("addOns.moveDown")}><ChevronDown className="h-4 w-4" /></button></div>
        </div>
        {editor?.kind === "edit" && editor.record._id === item._id && <CompanyAddOnEditorFields form={form} setForm={setForm} save={save} busy={busy} error={error} t={t} onCancel={closeEditor} onArchive={async () => { if (submissionLock.current.isLocked()) return; await archive({ ...auth, addOnId: item._id }); closeEditor(); }} />}
      </article>)}
    </div>}
    <button className="mt-6 text-sm font-medium text-gray-600" onClick={() => setShowArchived(!showArchived)}>{showArchived ? t("addOns.hideArchived") : t("addOns.showArchived", { count: archivedRecords.length })}</button>
    {showArchived && <div className="mt-3 space-y-2">{archivedRecords.length === 0 ? <p className="text-sm text-gray-500">{t("addOns.noArchived")}</p> : archivedRecords.map((item) => <div key={item._id} className="card flex items-center justify-between gap-3"><div><p className="font-medium">{item.name}</p><p className="text-sm text-gray-500">{currency(item.priceCents)}</p></div><button className="btn-secondary flex items-center gap-2" onClick={() => restore({ ...auth, addOnId: item._id })}><RotateCcw className="h-4 w-4" />{t("addOns.restore")}</button></div>)}</div>}
    <DialogShell open={editor?.kind === "create"} onOpenChange={(open) => !open && closeEditor()} pending={busy} title={t("addOns.create")} className="max-w-xl" footer={<><button type="button" className="btn-secondary" disabled={busy} onClick={closeEditor}>{t("common.cancel")}</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? t("common.saving") : t("common.save")}</button></>}>
      <CompanyAddOnEditorFields form={form} setForm={setForm} save={save} busy={busy} error={error} t={t} hideActions />
    </DialogShell>
    <Dialog.Root open={presetOpen} onOpenChange={setPresetOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed inset-x-4 bottom-4 top-4 z-50 mx-auto flex max-h-[calc(100dvh-2rem)] w-auto max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl focus:outline-none">
          <div className="shrink-0 border-b border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4 pr-1">
              <div>
                <Dialog.Title className="text-lg font-semibold text-gray-900">{t("addOns.presetTitle")}</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-gray-600">{t("addOns.presetPricingControl")}</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" aria-label={t("common.close")} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"><X aria-hidden="true" className="h-5 w-5" /></button>
              </Dialog.Close>
            </div>
            <label className="mt-4 flex items-center gap-2 rounded-lg border px-3">
              <Search aria-hidden="true" className="h-4 w-4 text-gray-400" />
              <input ref={presetSearchRef} className="w-full py-2 outline-none" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("addOns.searchPresets")} />
            </label>
          </div>
          <div ref={presetScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {(presets ?? []).filter((preset) => `${preset[locale].name} ${preset[locale].description}`.toLowerCase().includes(search.toLowerCase())).map((preset) => <div key={preset.presetKey} className="rounded-lg border p-4"><h3 className="font-semibold">{preset[locale].name}</h3><p className="mt-1 text-sm text-gray-600">{preset[locale].description}</p><p className="mt-2 text-sm font-medium">{t(`addOns.methods.${preset.pricingMethod}`)}</p><button className="btn-primary mt-3 w-full" onClick={() => beginPresetSetup(preset)}>{t("addOns.enablePreset")}</button></div>)}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {presetSetup && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="preset-setup-title" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><h2 id="preset-setup-title" className="text-lg font-semibold">{t("addOns.setPresetPrice", { name: presetSetup[locale].name })}</h2><button aria-label={t("common.close")} onClick={() => setPresetSetup(null)}><X /></button></div><p className="mt-2 text-sm text-gray-600">{t("addOns.presetSetupHelp")}</p>{presetError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{presetError}</div>}<div className="mt-4 space-y-4"><label className="block text-sm font-medium">{t("addOns.chooseChargeMethod")}<select className="input-field mt-1" value={presetMethod} onChange={(e) => { const method = e.target.value as Method; setPresetMethod(method); if (method !== "per_unit") setPresetUnitLabel(""); else if (!presetUnitLabel) setPresetUnitLabel(presetSetup.unitLabel?.[locale] ?? ""); }}><option value="flat">{t("addOns.methods.flat")}</option><option value="starting_at">{t("addOns.methods.starting_at")}</option><option value="per_unit">{t("addOns.methods.per_unit")}</option></select></label><label className="block text-sm font-medium">{t("addOns.setYourPrice")}<input className="input-field mt-1" type="number" min="0.01" step="0.01" value={presetPrice} onChange={(e) => setPresetPrice(e.target.value)} autoFocus /></label>{presetMethod === "per_unit" && <label className="block text-sm font-medium">{t("addOns.fields.unitLabel")}<input className="input-field mt-1" maxLength={40} value={presetUnitLabel} onChange={(e) => setPresetUnitLabel(e.target.value)} /></label>}<label className="block text-sm font-medium">{t("addOns.fields.duration")}<input className="input-field mt-1" type="number" min="1" max="1440" value={presetDuration} onChange={(e) => setPresetDuration(e.target.value)} /></label></div><div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => { setPresetSetup(null); setPresetOpen(true); }}>{t("common.back")}</button><button className="btn-primary" disabled={busy || !presetPrice} onClick={confirmPreset}>{busy ? t("common.saving") : t("addOns.enableWithPrice")}</button></div></div></div>}
  </div>;
}
