import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Search, Tags, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Method = "flat" | "starting_at" | "per_unit";
type AddOn = any;
const blank = { name: "", description: "", pricingMethod: "flat" as Method, price: "", unitLabel: "", estimatedDurationMinutes: "", internalNotes: "", isActive: true, isPublic: false };

function currency(cents: number) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100); }

export function CompanyAddOnsPage() {
  const { t, i18n } = useTranslation();
  const { user, sessionToken } = useAuth();
  const auth = { userId: user?._id, sessionToken };
  const records = useQuery((api as any).queries.companyAddOns.list, user ? { ...auth, includeArchived: true } : "skip") as AddOn[] | undefined;
  const presets = useQuery((api as any).queries.companyAddOns.listPresets, user ? auth : "skip") as any[] | undefined;
  const create = useMutation((api as any).mutations.companyAddOns.create);
  const update = useMutation((api as any).mutations.companyAddOns.update);
  const enablePreset = useMutation((api as any).mutations.companyAddOns.enablePreset);
  const archive = useMutation((api as any).mutations.companyAddOns.archive);
  const restore = useMutation((api as any).mutations.companyAddOns.restore);
  const reorder = useMutation((api as any).mutations.companyAddOns.reorder);
  const [editing, setEditing] = useState<AddOn | null>(null);
  const [form, setForm] = useState(blank);
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

  useEffect(() => {
    if (!editing) return setForm(blank);
    setForm({ name: editing.name, description: editing.description ?? "", pricingMethod: editing.pricingMethod, price: (editing.priceCents / 100).toFixed(2), unitLabel: editing.unitLabel ?? "", estimatedDurationMinutes: editing.estimatedDurationMinutes ? String(editing.estimatedDurationMinutes) : "", internalNotes: editing.internalNotes ?? "", isActive: editing.isActive, isPublic: editing.isPublic });
  }, [editing]);

  async function save() {
    if (!user) return;
    setBusy(true); setError("");
    try {
      const numericPrice = Number(form.price);
      const payload = { ...auth, name: form.name, description: form.description || undefined, pricingMethod: form.pricingMethod, priceCents: Math.round(numericPrice * 100), unitLabel: form.pricingMethod === "per_unit" ? form.unitLabel : undefined, estimatedDurationMinutes: form.estimatedDurationMinutes ? Number(form.estimatedDurationMinutes) : undefined, internalNotes: form.internalNotes || undefined, isActive: form.isActive, isPublic: form.isPublic };
      if (!Number.isFinite(numericPrice) || Math.round(numericPrice * 100) !== numericPrice * 100) throw new Error(t("addOns.validation.wholeCents"));
      if (editing?._id) await update({ addOnId: editing._id, ...payload }); else await create(payload);
      setEditing(null); setForm(blank);
    } catch (err: any) { setError(err.message || t("addOns.validation.saveFailed")); } finally { setBusy(false); }
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
    if (!presetSetup) return;
    const numericPrice = Number(presetPrice);
    const priceCents = numericPrice * 100;
    if (!Number.isFinite(numericPrice) || !Number.isSafeInteger(priceCents) || priceCents <= 0) return setPresetError(t("addOns.validation.presetPrice"));
    setBusy(true); setPresetError("");
    try {
      await enablePreset({ ...auth, presetKey: presetSetup.presetKey, locale, pricingMethod: presetMethod, priceCents, unitLabel: presetMethod === "per_unit" ? presetUnitLabel : undefined, estimatedDurationMinutes: presetDuration ? Number(presetDuration) : undefined });
      setPresetSetup(null);
    } catch (err: any) { setPresetError(err.message || t("addOns.validation.saveFailed")); } finally { setBusy(false); }
  }

  if (!user || records === undefined) return <LoadingSpinner size="lg" />;
  if (user.role !== "owner" && !user.canManageBusinessConfiguration) return <p className="card text-red-700">{t("addOns.noPermission")}</p>;
  return <div>
    <PageHeader title={t("addOns.title")} description={t("addOns.description")} back={{ href: user.role === "owner" ? "/owner/settings" : "/", label: t("addOns.back") }} />
    <div className="mb-5 flex flex-wrap gap-2">
      <button className="btn-primary flex items-center gap-2" onClick={() => { setEditing({}); setForm(blank); }}><Plus className="h-4 w-4" />{t("addOns.create")}</button>
      <button className="btn-secondary flex items-center gap-2" onClick={() => setPresetOpen(true)}><Tags className="h-4 w-4" />{t("addOns.browsePresets")}</button>
    </div>
    {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {activeRecords.length === 0 ? <EmptyState icon={Tags} title={t("addOns.emptyTitle")} description={t("addOns.emptyDescription")} /> : <div className="space-y-3">
      {activeRecords.map((item, index) => <article key={item._id} className="card p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(editing?._id === item._id ? null : item)} aria-expanded={editing?._id === item._id}>
            <span className="block truncate font-semibold text-gray-900">{item.name}</span>
            <span className="text-sm text-gray-500">{t(`addOns.methods.${item.pricingMethod}`)} · {currency(item.priceCents)}{item.unitLabel ? ` / ${item.unitLabel}` : ""}</span>
          </button>
          <span className={`badge ${item.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{t(item.isActive ? "addOns.active" : "addOns.inactive")}</span>
          <span className={`badge ${item.isPublic ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{t(item.isPublic ? "addOns.public" : "addOns.private")}</span>
          <div className="flex gap-1"><button className="p-2 rounded hover:bg-gray-100 disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("addOns.moveUp")}><ChevronUp className="h-4 w-4" /></button><button className="p-2 rounded hover:bg-gray-100 disabled:opacity-30" disabled={index === activeRecords.length - 1} onClick={() => move(index, 1)} aria-label={t("addOns.moveDown")}><ChevronDown className="h-4 w-4" /></button></div>
        </div>
        {editing?._id === item._id && <Editor form={form} setForm={setForm} save={save} busy={busy} t={t} onCancel={() => setEditing(null)} onArchive={async () => { await archive({ ...auth, addOnId: item._id }); setEditing(null); }} />}
      </article>)}
    </div>}
    <button className="mt-6 text-sm font-medium text-gray-600" onClick={() => setShowArchived(!showArchived)}>{showArchived ? t("addOns.hideArchived") : t("addOns.showArchived", { count: archivedRecords.length })}</button>
    {showArchived && <div className="mt-3 space-y-2">{archivedRecords.length === 0 ? <p className="text-sm text-gray-500">{t("addOns.noArchived")}</p> : archivedRecords.map((item) => <div key={item._id} className="card flex items-center justify-between gap-3"><div><p className="font-medium">{item.name}</p><p className="text-sm text-gray-500">{currency(item.priceCents)}</p></div><button className="btn-secondary flex items-center gap-2" onClick={() => restore({ ...auth, addOnId: item._id })}><RotateCcw className="h-4 w-4" />{t("addOns.restore")}</button></div>)}</div>}
    {editing && !editing._id && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-xl"><div className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">{t("addOns.create")}</h2><button onClick={() => setEditing(null)}><X /></button></div><Editor form={form} setForm={setForm} save={save} busy={busy} t={t} onCancel={() => setEditing(null)} /></div></div>}
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

function Editor({ form, setForm, save, busy, t, onCancel, onArchive }: any) {
  const field = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));
  return <div className="space-y-4 border-t p-4">
    <label className="block text-sm font-medium">{t("addOns.fields.name")}<input className="input-field mt-1" maxLength={80} value={form.name} onChange={(e) => field("name", e.target.value)} /></label>
    <label className="block text-sm font-medium">{t("addOns.fields.description")}<textarea className="input-field mt-1" maxLength={500} rows={3} value={form.description} onChange={(e) => field("description", e.target.value)} /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">{t("addOns.fields.method")}<select className="input-field mt-1" value={form.pricingMethod} onChange={(e) => field("pricingMethod", e.target.value)}><option value="flat">{t("addOns.methods.flat")}</option><option value="starting_at">{t("addOns.methods.starting_at")}</option><option value="per_unit">{t("addOns.methods.per_unit")}</option></select></label><label className="block text-sm font-medium">{t("addOns.fields.price")}<input className="input-field mt-1" type="number" min="0.01" step="0.01" value={form.price} onChange={(e) => field("price", e.target.value)} /></label></div>
    {form.pricingMethod === "per_unit" && <label className="block text-sm font-medium">{t("addOns.fields.unitLabel")}<input className="input-field mt-1" maxLength={40} value={form.unitLabel} onChange={(e) => field("unitLabel", e.target.value)} /></label>}
    <label className="block text-sm font-medium">{t("addOns.fields.duration")}<input className="input-field mt-1" type="number" min="1" max="1440" value={form.estimatedDurationMinutes} onChange={(e) => field("estimatedDurationMinutes", e.target.value)} /></label>
    <label className="block text-sm font-medium">{t("addOns.fields.notes")}<textarea className="input-field mt-1" maxLength={2000} rows={3} value={form.internalNotes} onChange={(e) => field("internalNotes", e.target.value)} /></label>
    <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((current: any) => ({ ...current, isActive: e.target.checked, isPublic: e.target.checked ? current.isPublic : false }))} />{t("addOns.active")}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} disabled={!form.isActive} onChange={(e) => field("isPublic", e.target.checked)} />{t("addOns.public")}</label></div>
    <div className="flex flex-wrap justify-between gap-2"><div>{onArchive && <button className="text-sm font-medium text-red-600" onClick={onArchive}>{t("addOns.archive")}</button>}</div><div className="flex gap-2"><button className="btn-secondary" onClick={onCancel}>{t("common.cancel")}</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? t("common.saving") : t("common.save")}</button></div></div>
  </div>;
}
