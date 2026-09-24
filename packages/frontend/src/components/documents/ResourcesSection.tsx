import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { DialogShell } from "@/components/ui/DialogShell";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { filterResources, resourceFileError, resourceSiteUrl, type ResourceRow } from "./resourceModel";

type Editor = { mode: "add" | "edit" | "replace"; row?: ResourceRow };

export function ResourcesSection() {
  const { sessionToken } = useAuth();
  const { t } = useTranslation();
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [requestId, setRequestId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteRow, setDeleteRow] = useState<ResourceRow | null>(null);
  const [archiveRow, setArchiveRow] = useState<ResourceRow | null>(null);
  const data = useQuery((api as any).queries.companyResources.list,
    sessionToken ? { sessionToken, status } : "skip") as { rows: ResourceRow[]; limited: boolean } | undefined;
  const updateDetails = useMutation((api as any).mutations.companyResources.updateDetails);
  const archive = useMutation((api as any).mutations.companyResources.archive);
  const restore = useMutation((api as any).mutations.companyResources.restore);
  const deleteArchived = useMutation((api as any).mutations.companyResources.deleteArchived);
  const rows = useMemo(() => filterResources(data?.rows ?? [], search), [data, search]);
  const shares = useQuery((api as any).queries.clientResourceAssignments.countsForResources,
    sessionToken && data ? { sessionToken, resourceIds: data.rows.map((row) => row._id) } : "skip") as Record<string, { count: number; limited: boolean }> | undefined;
  const countFor = (row?: ResourceRow | null) => row ? shares?.[row._id]?.count ?? 0 : 0;
  const site = useMemo(() => {
    try { return resourceSiteUrl(import.meta.env.VITE_CONVEX_URL, import.meta.env.VITE_CONVEX_SITE_URL); }
    catch { return ""; }
  }, []);

  const openEditor = (mode: Editor["mode"], row?: ResourceRow) => {
    setEditor({ mode, row });
    setTitle(row?.title ?? "");
    setDescription(row?.description ?? "");
    setFile(null);
    setRequestId(crypto.randomUUID());
    setError("");
    setNotice("");
  };

  const submit = async () => {
    if (!editor || !sessionToken || pending) return;
    const cleanedTitle = title.trim();
    if (!cleanedTitle || cleanedTitle.length > 200) { setError(t("resourcesHub.titleError")); return; }
    if (description.trim().length > 1000) { setError(t("resourcesHub.descriptionError")); return; }
    if (editor.mode !== "edit" && !file) { setError(t("resourcesHub.fileRequired")); return; }
    if (file) {
      const validation = resourceFileError(file);
      if (validation) { setError(t(`resourcesHub.${validation}Error`)); return; }
    }
    setPending(true);
    setError("");
    setNotice("");
    let friendlyError = "";
    try {
      if (editor.mode === "edit") {
        await updateDetails({ sessionToken, resourceId: editor.row!._id, title: cleanedTitle, description: description.trim() || undefined });
      } else {
        if (!site) { friendlyError = t("resourcesHub.serviceUnavailable"); throw new Error(friendlyError); }
        const body = new FormData();
        body.append("file", file!);
        body.append("title", cleanedTitle);
        body.append("description", description.trim());
        body.append("requestId", requestId);
        if (editor.mode === "replace") {
          body.append("resourceId", editor.row!._id);
          body.append("expectedStorageId", editor.row!.storageId);
        }
        const response = await fetch(`${site}/resources/upload`, {
          method: "POST", headers: { Authorization: `Bearer ${sessionToken}` }, body,
        });
        if (!response.ok) { friendlyError = t(response.status === 409 ? "resourcesHub.conflict" :
          response.status === 403 ? "resourcesHub.accessDenied" :
          response.status === 400 ? "resourcesHub.serverValidation" : "resourcesHub.uploadFailed"); throw new Error(friendlyError); }
      }
      setEditor(null);
      setNotice(t("resourcesHub.saved"));
    } catch {
      setError(friendlyError || t("resourcesHub.uploadFailed"));
    } finally { setPending(false); }
  };

  const getFile = async (row: ResourceRow, download: boolean) => {
    if (!sessionToken || !site) { setError(t("resourcesHub.serviceUnavailable")); return; }
    const tab = download ? null : window.open("", "_blank");
    setError("");
    setNotice("");
    try {
      const url = new URL(`${site}/resources/file`);
      url.searchParams.set("resourceId", row._id);
      if (download) url.searchParams.set("download", "1");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${sessionToken}` } });
      if (!response.ok) throw new Error(t("resourcesHub.openFailed"));
      const objectUrl = URL.createObjectURL(await response.blob());
      if (download) {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = row.originalFileName;
        document.body.append(link);
        link.click();
        link.remove();
      } else if (tab) tab.location.href = objectUrl;
      else throw new Error(t("resourcesHub.popupBlocked"));
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (cause) {
      tab?.close();
      setError(cause instanceof Error ? cause.message : t("resourcesHub.openFailed"));
    }
  };

  const changeStatus = async (row: ResourceRow) => {
    if (!sessionToken) return;
    setError("");
    try {
      if (row.status === "active") await archive({ sessionToken, resourceId: row._id });
      else await restore({ sessionToken, resourceId: row._id });
      setArchiveRow(null);
      setNotice(t(row.status === "active" ? "resourcesHub.archivedNotice" : "resourcesHub.restoredNotice"));
    } catch { setError(t("resourcesHub.actionFailed")); }
  };

  const permanentlyDelete = async () => {
    if (!sessionToken || !deleteRow) return;
    setError("");
    setNotice("");
    try {
      await deleteArchived({ sessionToken, resourceId: deleteRow._id });
      setDeleteRow(null);
      setNotice(t("resourcesHub.deletedNotice"));
    } catch (cause) {
      setError(t("resourcesHub.actionFailed"));
      throw cause;
    }
  };

  return <section className="min-w-0 space-y-4" aria-label={t("documentsHub.resources")}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t("documentsHub.resources")}</h2>
        <p className="mt-1 text-sm text-gray-600">{t("resourcesHub.description")}</p>
      </div>
      <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => openEditor("add")}>{t("resourcesHub.add")}</button>
    </div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="min-w-0 flex-1 text-sm font-medium text-gray-700">{t("resourcesHub.search")}
        <input className="input mt-1 w-full" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("resourcesHub.searchPlaceholder")} />
      </label>
      <div className="flex gap-2" role="group" aria-label={t("resourcesHub.statusFilter")}>
        {(["active", "archived"] as const).map((item) => <button key={item} type="button" aria-pressed={status === item}
          className={status === item ? "btn-primary flex-1 sm:flex-none" : "btn-secondary flex-1 sm:flex-none"}
          onClick={() => setStatus(item)}>{t(`resourcesHub.${item}`)}</button>)}
      </div>
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {!data ? <PageLoader /> : <>
      {data.limited && <p className="text-xs text-gray-600">{t("resourcesHub.recentLimit")}</p>}
      {!rows.length ? <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">{t(search ? "resourcesHub.noMatches" : status === "active" ? "resourcesHub.empty" : "resourcesHub.archivedEmpty")}</p> :
        <div className="grid gap-3 md:grid-cols-2">{rows.map((row) => <article key={row._id} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="break-words font-semibold text-gray-900">{row.title}</h3>
          {row.description && <p className="mt-1 break-words text-sm text-gray-600">{row.description}</p>}
          <p className="mt-2 break-all text-xs text-gray-500">{t("resourcesHub.filename")}: {row.originalFileName}</p>
          <p className="mt-1 text-xs text-gray-500">{t("resourcesHub.fileType")}: {({ "application/pdf": "PDF", "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP" } as Record<string, string>)[row.mimeType] ?? row.mimeType} · {t("resourcesHub.size")}: {(row.sizeBytes / 1024 / 1024).toFixed(2)} MB</p>
          <p className="mt-1 text-xs text-gray-500">{t("resourcesHub.updated", { date: new Date(row.updatedAt).toLocaleDateString() })}</p>
          {shares && <p className="mt-1 text-xs text-gray-500">{t("resourcesHub.sharedCount", { count: countFor(row) })}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <button type="button" className="btn-secondary" onClick={() => void getFile(row, false)}>{t("resourcesHub.open")}</button>
            <button type="button" className="btn-secondary" onClick={() => void getFile(row, true)}>{t("resourcesHub.download")}</button>
            <button type="button" className="btn-secondary" onClick={() => openEditor("edit", row)}>{t("resourcesHub.edit")}</button>
            {row.status === "active" && <button type="button" className="btn-secondary" disabled={!shares} onClick={() => openEditor("replace", row)}>{t("resourcesHub.replace")}</button>}
            <button type="button" className="btn-secondary" disabled={row.status === "active" && !shares} onClick={() => row.status === "active" ? setArchiveRow(row) : void changeStatus(row)}>{t(row.status === "active" ? "resourcesHub.archive" : "resourcesHub.restore")}</button>
            {row.status === "archived" && <button type="button" className="btn-danger" disabled={!shares} onClick={() => setDeleteRow(row)}>{t("resourcesHub.delete")}</button>}
          </div>
        </article>)}</div>}
    </>}
    <DialogShell open={editor !== null} onOpenChange={(open) => !open && setEditor(null)} pending={pending}
      title={t(`resourcesHub.${editor?.mode ?? "add"}`)} description={editor?.mode === "replace" && countFor(editor.row) > 0
        ? t("resourcesHub.replaceShared", { count: countFor(editor.row) }) : t(editor?.mode === "replace" ? "resourcesHub.replaceHint" : "resourcesHub.fileHint")}
      footer={<><button type="button" className="btn-secondary" disabled={pending} onClick={() => setEditor(null)}>{t("common.cancel")}</button>
        <button type="button" className="btn-primary" disabled={pending} onClick={() => void submit()}>{pending ? t("common.processing") : t("common.save")}</button></>}>
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">{t("resourcesHub.title")}
          <input className="input mt-1 w-full" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="block text-sm font-medium text-gray-700">{t("resourcesHub.descriptionLabel")}
          <textarea className="input mt-1 w-full" maxLength={1000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        {editor?.mode !== "edit" && <label className="block text-sm font-medium text-gray-700">{t("resourcesHub.file")}
          <input className="mt-1 block w-full text-sm" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); if (selected && !title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, "")); setRequestId(crypto.randomUUID()); }} /></label>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </DialogShell>
    <ConfirmDialog open={archiveRow !== null} onOpenChange={(open) => !open && setArchiveRow(null)}
      title={t("resourcesHub.archiveConfirm")} description={countFor(archiveRow) > 0
        ? t("resourcesHub.archiveShared", { count: countFor(archiveRow) }) : t("resourcesHub.archiveDescription", { title: archiveRow?.title })}
      confirmLabel={t("resourcesHub.archive")} onConfirm={() => archiveRow ? changeStatus(archiveRow) : undefined} />
    {deleteRow && countFor(deleteRow) > 0 ? <DialogShell open onOpenChange={(open) => !open && setDeleteRow(null)}
      title={t("resourcesHub.deleteBlockedTitle")} description={t("resourcesHub.deleteBlocked", { count: countFor(deleteRow) })}
      footer={<button type="button" className="btn-secondary" onClick={() => setDeleteRow(null)}>{t("common.closeDialog")}</button>} /> :
      <ConfirmDialog open={deleteRow !== null} onOpenChange={(open) => !open && setDeleteRow(null)}
        title={t("resourcesHub.deleteConfirm")} description={t("resourcesHub.deleteDescription", { title: deleteRow?.title })}
        confirmLabel={t("resourcesHub.delete")} confirmVariant="danger" onConfirm={permanentlyDelete} />}
  </section>;
}
