import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { DialogShell } from "@/components/ui/DialogShell";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { resourceSiteUrl } from "@/components/documents/resourceModel";
import type { Id } from "../../../../../convex/_generated/dataModel";

type Row = { resourceId: Id<"companyResources">; title: string; description?: string; originalFileName: string; mimeType: string; updatedAt: number; status?: "active" | "archived" };

export function ClientResourcesSection({ relationshipId, active }: { relationshipId: Id<"clientRelationships">; active: boolean }) {
  const { t } = useTranslation();
  const { user, sessionToken } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [removeRow, setRemoveRow] = useState<Row | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const assignments = useQuery((api as any).queries.clientResourceAssignments.listForRelationship,
    sessionToken ? { sessionToken, clientRelationshipId: relationshipId } : "skip") as { rows: Row[]; limited: boolean } | undefined;
  const picker = useQuery((api as any).queries.clientResourceAssignments.listActiveForPicker,
    sessionToken && pickerOpen ? { sessionToken } : "skip") as { rows: Row[]; limited: boolean } | undefined;
  const add = useMutation((api as any).mutations.clientResourceAssignments.addResourcesToClient);
  const remove = useMutation((api as any).mutations.clientResourceAssignments.removeAccess);
  const assigned = useMemo(() => new Set(assignments?.rows.map((row) => row.resourceId)), [assignments]);
  const choices = useMemo(() => (picker?.rows ?? []).filter((row) =>
    [row.title, row.description, row.originalFileName].some((value) => value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))), [picker, search]);
  const canReadFile = user?.role === "owner" || user?.canManageDocuments === true;

  const addSelected = async () => {
    if (!sessionToken || !selected.length) return;
    setPending(true); setError("");
    try {
      await add({ sessionToken, clientRelationshipId: relationshipId, resourceIds: selected });
      setPickerOpen(false); setSelected([]); setSearch(""); setNotice(t("clientResources.added"));
    } catch { setError(t("clientResources.addFailed")); }
    finally { setPending(false); }
  };
  const removeSelected = async () => {
    if (!sessionToken || !removeRow) return;
    setPending(true); setError("");
    try {
      await remove({ sessionToken, clientRelationshipId: relationshipId, resourceId: removeRow.resourceId });
      setRemoveRow(null); setNotice(t("clientResources.removed"));
    } catch { setError(t("clientResources.removeFailed")); }
    finally { setPending(false); }
  };
  const openFile = async (row: Row) => {
    if (!sessionToken) return;
    const tab = window.open("", "_blank");
    try {
      const site = resourceSiteUrl(import.meta.env.VITE_CONVEX_URL, import.meta.env.VITE_CONVEX_SITE_URL);
      const url = new URL(`${site}/resources/file`);
      url.searchParams.set("resourceId", row.resourceId);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${sessionToken}` } });
      if (!response.ok) throw new Error();
      const objectUrl = URL.createObjectURL(await response.blob());
      if (!tab) throw new Error();
      tab.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch { tab?.close(); setError(t("clientResources.openFailed")); }
  };

  return <section className="card space-y-4" aria-label={t("clientResources.title")}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="text-lg font-semibold text-gray-900">{t("clientResources.title")}</h2>
        <p className="mt-1 text-sm text-gray-600">{t("clientResources.description")}</p></div>
      <button type="button" className="btn-primary" disabled={!active} onClick={() => { setPickerOpen(true); setError(""); }}>{t("clientResources.add")}</button>
    </div>
    {!active && <p className="text-sm text-amber-700">{t("clientResources.inactive")}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {!assignments ? <p className="text-sm text-gray-500">{t("common.loading")}</p> : <>
      {assignments.limited && <p className="text-xs text-gray-500">{t("clientResources.limited")}</p>}
      {!assignments.rows.length ? <p className="text-sm text-gray-600">{t("clientResources.empty")}</p> :
        <div className="grid gap-3 md:grid-cols-2">{assignments.rows.map((row) => <article key={row.resourceId} className="min-w-0 rounded-lg border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-2"><h3 className="break-words font-medium text-gray-900">{row.title}</h3>
            {row.status === "archived" && <span className="badge bg-gray-100 text-gray-600">{t("resourcesHub.archived")}</span>}</div>
          {row.description && <p className="mt-1 break-words text-sm text-gray-600">{row.description}</p>}
          <p className="mt-2 break-all text-xs text-gray-500">{row.originalFileName} · {row.mimeType} · {t("resourcesHub.updated", { date: new Date(row.updatedAt).toLocaleDateString() })}</p>
          <div className="mt-3 flex flex-wrap gap-2">{canReadFile && row.status === "active" && <button type="button" className="btn-secondary" onClick={() => void openFile(row)}>{t("resourcesHub.open")}</button>}
            <button type="button" className="btn-secondary" onClick={() => setRemoveRow(row)}>{t("clientResources.remove")}</button></div>
        </article>)}</div>}
    </>}
    <DialogShell open={pickerOpen} onOpenChange={(open) => { if (!open) { setPickerOpen(false); setSelected([]); setSearch(""); } }} pending={pending}
      title={t("clientResources.add")} description={t("clientResources.pickerDescription")}
      footer={<><button type="button" className="btn-secondary" onClick={() => setPickerOpen(false)} disabled={pending}>{t("common.cancel")}</button>
        <button type="button" className="btn-primary" disabled={pending || selected.length === 0} onClick={() => void addSelected()}>{t("clientResources.addCount", { count: selected.length })}</button></>}>
      <div className="space-y-3"><label className="block text-sm font-medium">{t("resourcesHub.search")}
        <input className="input mt-1 w-full" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("resourcesHub.searchPlaceholder")} /></label>
        <p className="text-sm text-gray-600">{t("clientResources.selected", { count: selected.length })}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {picker?.limited && <p className="text-xs text-gray-500">{t("clientResources.limited")}</p>}
        {!picker ? <p className="text-sm text-gray-500">{t("common.loading")}</p> : !choices.length ? <p className="text-sm text-gray-500">{t("clientResources.noMatches")}</p> :
          <div className="max-h-80 space-y-2 overflow-y-auto">{choices.map((row) => {
            const already = assigned.has(row.resourceId);
            return <label key={row.resourceId} className="flex gap-3 rounded-lg border border-gray-200 p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={already || selected.includes(row.resourceId)} disabled={already}
                onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.resourceId] : current.filter((id) => id !== row.resourceId))} />
              <span className="min-w-0"><span className="block break-words font-medium">{row.title}{already && ` · ${t("clientResources.alreadyShared")}`}</span>
                {row.description && <span className="block break-words text-gray-600">{row.description}</span>}
                <span className="block break-all text-xs text-gray-500">{row.originalFileName} · {row.mimeType}</span></span>
            </label>;
          })}</div>}
      </div>
    </DialogShell>
    <ConfirmDialog open={removeRow !== null} onOpenChange={(open) => !open && setRemoveRow(null)}
      title={t("clientResources.remove")} description={t("clientResources.removeDescription", { title: removeRow?.title })}
      confirmLabel={t("clientResources.remove")} confirmVariant="danger" onConfirm={removeSelected} loading={pending} />
  </section>;
}
