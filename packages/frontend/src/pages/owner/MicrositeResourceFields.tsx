import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PDF_LIMITS, type ResourceEntry } from "../../../../../convex/lib/micrositeResourcesModel";
import { useCanonicalResourceUpload } from "@/components/documents/useCanonicalResourceUpload";
import { resourceSiteUrl } from "@/components/documents/resourceModel";
import { fetchResourceBlob } from "@/components/documents/resourceTransfer";
import { OrderButtons } from "./MiniSiteSectionEditor";

export type PickerResource = {
  id: Id<"companyResources">; title: string; filename: string; bytes: number; mime: string;
  eligible: boolean; canRetry: boolean; designated: boolean; version?: string; approval?: string;
  state: "unchecked" | "checking" | "passed" | "rejected" | "unavailable";
};

export function MicrositeResourceFields({ sessionToken, entries, rows, published, onChange }: {
  sessionToken: string; entries: ResourceEntry[]; rows: PickerResource[] | undefined; published: ResourceEntry[];
  onChange: (update: (entries: ResourceEntry[]) => ResourceEntry[]) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"choose" | "upload" | null>(null);
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const request = useMutation(api.micrositeResources.requestInspection);
  const approve = useMutation(api.micrositeResources.approve);
  const upload = useCanonicalResourceUpload();
  const byId = new Map(rows?.map((row) => [row.id, row]));
  const selected = new Set(entries.map(({ resourceId }) => resourceId));
  const filtered = rows?.filter((row) => `${row.title} ${row.filename}`.toLowerCase().includes(search.trim().toLowerCase()));
  const full = entries.length >= PDF_LIMITS.entries;
  const change = (id: string, values: Partial<ResourceEntry>) =>
    onChange((items) => items.map((item) => item.id === id ? { ...item, ...values } : item));

  const add = (id: Id<"companyResources">, name: string) => {
    onChange((items) => items.length >= PDF_LIMITS.entries || items.some(({ resourceId }) => resourceId === id) ? items
      : [...items, { id: crypto.randomUUID(), resourceId: id, enabled: true, title: Array.from(name).slice(0, PDF_LIMITS.title).join(""), description: "" }]);
    setMode(null);
  };

  const perform = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setError("");
    setBusy(true);
    try { await operation(); }
    catch { setError(t("miniSiteResources.actionFailed")); }
    finally { setBusy(false); }
  };

  const uploadFile = () => perform(async () => {
    if (!file || !title.trim() || file.size < 1 || file.size > PDF_LIMITS.bytes || !/\.pdf$/i.test(file.name)) {
      setError(t("miniSiteResources.choosePdf"));
      return;
    }
    const name = title.trim();
    const id = await upload({
      sessionToken, requestId: crypto.randomUUID(), file, title: name,
      signal: AbortSignal.timeout(90_000), progress: () => {}, validating: () => {},
    });
    add(id as Id<"companyResources">, name);
    setFile(null);
    setTitle("");
  });

  const downloadPrivate = (row: PickerResource) => perform(async () => {
    const site = resourceSiteUrl(import.meta.env.VITE_CONVEX_URL, import.meta.env.VITE_CONVEX_SITE_URL);
    const blob = await fetchResourceBlob({ site, route: "staff", resourceId: row.id, sessionToken, onProgress: () => {} });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = row.filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

  return <div className="space-y-3">
    <p className="text-sm text-gray-600">{t("miniSiteResources.help")}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary touch-target" disabled={full || busy}
        onClick={() => setMode(mode === "choose" ? null : "choose")}>{t("miniSiteResources.choose")}</button>
      <button type="button" className="btn-secondary touch-target" disabled={full || busy}
        onClick={() => setMode(mode === "upload" ? null : "upload")}>{t("miniSiteResources.upload")}</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {busy && <p role="status" className="text-sm text-gray-600">{t("miniSiteResources.working")}</p>}
    {mode === "choose" && <div className="space-y-2 rounded-lg border border-gray-200 p-3">
      <label className="block text-sm">{t("miniSiteResources.search")}<input className="input-field" value={search}
        onChange={(event) => setSearch(event.target.value)} /></label>
      {!rows ? <p role="status">{t("miniSiteResources.working")}</p>
        : !filtered?.length ? <p className="text-sm">{t("miniSiteResources.noDocuments")}</p>
        : <ul className="max-h-72 space-y-2 overflow-auto">{filtered.map((row) => <li key={row.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
          <div className="min-w-0 break-words"><p className="font-medium">{row.title}</p><p className="text-xs text-gray-600">
            {row.mime === "application/pdf" ? "PDF" : row.mime} · {Math.ceil(row.bytes / 1024)} KB
          </p></div>
          <button type="button" className="btn-secondary touch-target" disabled={full || selected.has(row.id) || !row.eligible}
            onClick={() => add(row.id, row.title)}>{t(selected.has(row.id) ? "miniSiteResources.selected"
              : row.eligible ? "miniSiteResources.select" : "miniSiteResources.ineligible")}</button>
        </li>)}</ul>}
    </div>}
    {mode === "upload" && <div className="space-y-2 rounded-lg border border-gray-200 p-3">
      <p className="text-sm text-gray-600">{t("miniSiteResources.canonicalHelp")}</p>
      <label className="block text-sm">{t("miniSiteResources.title")}<input className="input-field" disabled={busy}
        maxLength={PDF_LIMITS.title} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="block text-sm">{t("miniSiteResources.choosePdf")}<input className="block max-w-full" disabled={busy}
        type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <button type="button" className="btn-primary touch-target" disabled={busy} onClick={() => void uploadFile()}>
        {t("miniSiteResources.upload")}
      </button>
    </div>}
    {entries.map((entry, index) => {
      const row = byId.get(entry.resourceId);
      const approved = !!entry.approval && entry.approval === row?.approval && row.state === "passed";
      const isLive = approved && published.some((item) => item.id === entry.id && item.enabled && item.approval === entry.approval);
      const status = !rows ? "working" : !row?.eligible ? "missing" : !entry.enabled ? "hidden" : isLive ? "published"
        : approved ? "approved" : entry.approval && row.state === "unchecked" ? "reapproval" : row.state;
      return <fieldset key={entry.id} className="min-w-0 space-y-2 rounded-lg border border-gray-200 p-3">
        <legend className="max-w-full break-words px-1 font-semibold">{row?.title ?? entry.title}</legend>
        <p className="text-sm text-gray-600" aria-live="polite">{t(`miniSiteResources.${status}`)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={entry.enabled}
            onChange={(event) => change(entry.id, { enabled: event.target.checked })} />{t("miniSiteMedia.showEntry")}</label>
          <OrderButtons label={entry.title} index={index} count={entries.length} onMove={(offset) => onChange((items) => {
            const reordered = [...items];
            [reordered[index], reordered[index + offset]] = [reordered[index + offset], reordered[index]];
            return reordered;
          })} />
          <button type="button" className="btn-secondary touch-target"
            onClick={() => onChange((items) => items.filter(({ id }) => id !== entry.id))}>{t("common.delete")}</button>
        </div>
        <label className="block text-sm">{t("miniSiteResources.title")}<input className="input-field"
          value={entry.title} maxLength={PDF_LIMITS.title} onChange={(event) => change(entry.id, { title: event.target.value })} /></label>
        <label className="block text-sm">{t("miniSiteResources.description")}<textarea className="input-field" rows={2}
          value={entry.description} maxLength={PDF_LIMITS.description}
          onChange={(event) => change(entry.id, { description: event.target.value })} /></label>
        {row && <button type="button" className="btn-secondary touch-target" disabled={busy}
          onClick={() => void downloadPrivate(row)}>{t("miniSiteResources.privateDownload")}</button>}
        {row?.eligible && (row.state === "unchecked" || (row.state === "unavailable" && row.canRetry)) &&
          <button type="button" className="btn-secondary touch-target" disabled={busy}
            onClick={() => void perform(() => request({ sessionToken, resourceId: row.id, designate: true }))}>
            {t("miniSiteResources.check")}
          </button>}
        {row?.eligible && row.version && !approved && <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox"
            checked={acknowledged[entry.id] === row.version} onChange={(event) => setAcknowledged((current) =>
              ({ ...current, [entry.id]: event.target.checked ? row.version! : "" }))} />{t("miniSiteResources.acknowledge")}</label>
          <button type="button" className="btn-secondary touch-target" disabled={busy || acknowledged[entry.id] !== row.version}
            onClick={() => void perform(async () => {
              const approval = await approve({ sessionToken, resourceId: row.id, expectedVersion: row.version!, acknowledged: true });
              change(entry.id, { approval });
            })}>{t("miniSiteResources.approve")}</button>
        </div>}
      </fieldset>;
    })}
  </div>;
}
