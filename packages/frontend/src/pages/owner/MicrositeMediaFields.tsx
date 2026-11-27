import { useState } from "react";
import { useTranslation } from "react-i18next";
import { galleryImages, MEDIA_LIMITS, type GalleryEntry, type MediaImage, type TeamEntry } from "../../../../../convex/lib/micrositeMediaModel";
import { PHOTO_ACCEPT } from "@/lib/prepareMicrositeImage";
import { OrderButtons } from "./MiniSiteSectionEditor";
import type { MicrositeImageEditor } from "./useMicrositeImages";

type Slot = "image" | "before" | "after" | "portrait";

function ImageField({ id, slot, image, images, onChange, canAdd = true }: {
  id: string; slot: Slot; image?: MediaImage; images: MicrositeImageEditor; onChange: (image?: MediaImage) => void; canAdd?: boolean;
}) {
  const { t } = useTranslation();
  const key = `${id}:${slot}`;
  const job = images.job(key);
  const source = image && images.source(image.assetId);
  const label = t(`miniSiteMedia.slots.${slot}`);
  const inputLabel = t(image ? "miniSiteMedia.replaceImage" : "miniSiteMedia.chooseImage", { label });
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 p-3">
      <p className="mb-2 text-sm font-semibold text-gray-900">{label}</p>
      {source && <img src={source.url} alt={image?.alt ?? ""} width={source.width} height={source.height} className="mb-2 max-h-36 w-full rounded-md bg-gray-50 object-contain" />}
      {!source && image && <p className="mb-2 text-sm text-gray-500">{t("miniSiteMedia.imageSelected")}</p>}
      <label className="block text-sm text-gray-700">
        {inputLabel}
        <input type="file" aria-label={inputLabel} accept={PHOTO_ACCEPT} disabled={(!images.remaining && !job) || (!canAdd && !image && !job)}
          className="mt-1 block w-full min-w-0 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-primary-50 file:px-2 file:py-2 file:text-primary-800"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) images.choose(key, file, slot === "portrait" ? "portrait" : "gallery", onChange);
          }} />
      </label>
      {job && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span role={job.status === "failed" ? "alert" : "status"}>
          {t(job.error ? `miniSiteMedia.errors.${job.error}` : `miniSiteMedia.status.${job.status}`)}
        </span>
        {job.status === "failed" && job.canRetry && <button type="button" className="btn-secondary touch-target" onClick={() => images.retry(key)}>{t("miniSiteMedia.retry")}</button>}
        <button type="button" className="btn-secondary touch-target" onClick={() => images.removeJob(key)}>{t("miniSiteMedia.cancelUpload")}</button>
      </div>}
      {image && <>
        <label className="mt-2 block text-sm font-medium text-gray-700">
          {t("miniSiteMedia.alt")}
          <input className="input-field mt-1" maxLength={MEDIA_LIMITS.alt} value={image.alt} onChange={(event) => onChange({ ...image, alt: event.target.value })} />
        </label>
        <button type="button" className="touch-target mt-2 rounded px-2 text-sm text-red-700" onClick={() => { images.removeJob(key); onChange(undefined); }}>
          {t("miniSiteMedia.removeImage")}
        </button>
      </>}
    </div>
  );
}

function reorder<T>(list: T[], index: number, offset: number) {
  const next = [...list];
  [next[index], next[index + offset]] = [next[index + offset], next[index]];
  return next;
}

export function GalleryFields({ entries, images, onChange }: {
  entries: GalleryEntry[]; images: MicrositeImageEditor; onChange: (update: (items: GalleryEntry[]) => GalleryEntry[]) => void;
}) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState("");
  const update = (id: string, change: (entry: GalleryEntry) => GalleryEntry) =>
    onChange((list) => list.map((entry) => entry.id === id ? change(entry) : entry));
  const count = entries.reduce((total, entry) => total + (entry.kind === "photo"
    ? Number(Boolean(entry.image || images.job(`${entry.id}:image`)))
    : Number(Boolean(entry.before || images.job(`${entry.id}:before`))) + Number(Boolean(entry.after || images.job(`${entry.id}:after`)))), 0);
  const pairs = entries.filter(({ kind }) => kind === "pair").length;
  const complete = (item: GalleryEntry) => galleryImages(item).every((image) => image?.alt.trim());
  const incomplete = entries.filter((item) => !complete(item) && !images.hasJobForEntry(item.id)).length;
  const visible = entries.filter((item) => item.enabled && complete(item)).length;
  const hidden = entries.filter(({ enabled }) => !enabled).length;
  const uploading = entries.filter(({ id }) => images.hasJobForEntry(id)).length;
  const capacity = Math.min(MEDIA_LIMITS.entries - entries.length, MEDIA_LIMITS.images - count, images.remaining);
  const setSlot = (id: string, slot: Exclude<Slot, "portrait">, image?: MediaImage) =>
    update(id, (entry) => ({ ...entry, [slot]: image }));
  const addPhotos = (files: File[]) => {
    const selected = files.slice(0, Math.max(0, capacity));
    const newEntries = selected.map((): GalleryEntry => ({ id: crypto.randomUUID(), enabled: true, kind: "photo", title: "", caption: "" }));
    onChange((items) => [...items, ...newEntries]);
    newEntries.forEach(({ id }, index) => images.choose(`${id}:image`, selected[index], "gallery", (image) => setSlot(id, "image", image)));
    setNotice(selected.length !== files.length ? t("miniSiteMedia.selectionLimit", { count: selected.length }) : "");
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">{t("miniSiteMedia.galleryHelp")}</p>
      <p className="text-sm text-gray-600">{t("miniSiteMedia.galleryCapacity", { entries: MEDIA_LIMITS.entries - entries.length, images: MEDIA_LIMITS.images - count, pairs: MEDIA_LIMITS.pairs - pairs, uploads: images.remaining })}</p>
      <p role="status" className="text-sm text-gray-600">{t("miniSiteMedia.summary", { visible, hidden, incomplete, uploading })} {notice}</p>
      <label className="block min-w-0 text-sm font-medium text-gray-800">
        {t("miniSiteMedia.addPhotos")}
        <input type="file" multiple accept={PHOTO_ACCEPT} disabled={capacity <= 0}
          className="mt-1 block w-full text-sm file:mr-2 file:rounded-md file:border-0 file:bg-primary-50 file:p-2 file:text-primary-800"
          onChange={(event) => { addPhotos(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
      </label>
      <button type="button" className="btn-secondary touch-target" disabled={entries.length >= MEDIA_LIMITS.entries || pairs >= MEDIA_LIMITS.pairs}
        onClick={() => onChange((items) => [...items, { id: crypto.randomUUID(), enabled: true, kind: "pair", title: "", caption: "" }])}>
        {t("miniSiteMedia.addPair")}
      </button>
      {entries.length === 0 && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{t("miniSiteMedia.galleryEmpty")}</p>}
      {entries.map((item, index) => {
        const label = item.title || t(item.kind === "photo" ? "miniSiteMedia.photoEntry" : "miniSiteMedia.pairEntry", { number: index + 1 });
        return (
          <fieldset key={item.id} className="min-w-0 space-y-3 rounded-lg border border-gray-200 p-3">
            <legend className="px-1 font-semibold [overflow-wrap:anywhere]">{label}</legend>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={item.enabled} onChange={(event) => update(item.id, (entry) => ({ ...entry, enabled: event.target.checked }))} />{t("miniSiteMedia.showEntry")}</label>
              <OrderButtons label={label} index={index} count={entries.length} onMove={(offset) => onChange((items) => reorder(items, index, offset))} />
              <button type="button" className="touch-target rounded px-2 text-sm text-red-700" aria-label={t("miniSiteSections.deleteItem", { label })}
                onClick={() => { for (const slot of ["image", "before", "after"]) images.removeJob(`${item.id}:${slot}`); onChange((items) => items.filter(({ id }) => id !== item.id)); }}>
                {t("common.delete")}
              </button>
            </div>
            <label className="block text-sm font-medium text-gray-700">{t("miniSiteMedia.title")}<input className="input-field mt-1" maxLength={MEDIA_LIMITS.title} value={item.title} onChange={(event) => update(item.id, (entry) => ({ ...entry, title: event.target.value }))} /></label>
            <label className="block text-sm font-medium text-gray-700">{t("miniSiteMedia.caption")}<textarea className="input-field mt-1" rows={2} maxLength={MEDIA_LIMITS.caption} value={item.caption} onChange={(event) => update(item.id, (entry) => ({ ...entry, caption: event.target.value }))} /></label>
            {item.kind === "photo"
              ? <ImageField id={item.id} slot="image" image={item.image} images={images} canAdd={count < MEDIA_LIMITS.images} onChange={(image) => setSlot(item.id, "image", image)} />
              : <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ImageField id={item.id} slot="before" image={item.before} images={images} canAdd={count < MEDIA_LIMITS.images} onChange={(image) => setSlot(item.id, "before", image)} />
                  <ImageField id={item.id} slot="after" image={item.after} images={images} canAdd={count < MEDIA_LIMITS.images} onChange={(image) => setSlot(item.id, "after", image)} />
                </div>
                <button type="button" className="btn-secondary touch-target" disabled={images.hasJobForEntry(item.id) || !(item.before || item.after)}
                  onClick={() => update(item.id, (entry) => entry.kind === "pair" ? { ...entry, before: entry.after, after: entry.before } : entry)}>
                  {t("miniSiteMedia.swap")}
                </button>
              </>}
            {!complete(item) && <p className="text-sm text-gray-600">{t("miniSiteMedia.incomplete")}</p>}
          </fieldset>
        );
      })}
    </div>
  );
}

export function TeamFields({ entries, images, onChange }: {
  entries: TeamEntry[]; images: MicrositeImageEditor; onChange: (update: (items: TeamEntry[]) => TeamEntry[]) => void;
}) {
  const { t } = useTranslation();
  const update = (id: string, changes: Partial<TeamEntry>) =>
    onChange((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
  const complete = (item: TeamEntry) => Boolean(item.name.trim() && item.role.trim());
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">{t("miniSiteMedia.teamHelp")}</p>
      <p className="text-sm text-gray-600">{t("miniSiteMedia.teamCapacity", { profiles: MEDIA_LIMITS.profiles - entries.length, uploads: images.remaining })}</p>
      <p role="status" className="text-sm text-gray-600">{t("miniSiteMedia.summary", {
        visible: entries.filter((item) => item.enabled && complete(item)).length,
        hidden: entries.filter((item) => !item.enabled).length,
        incomplete: entries.filter((item) => !complete(item) && !images.hasJobForEntry(item.id)).length,
        uploading: entries.filter((item) => images.hasJobForEntry(item.id)).length,
      })}</p>
      <button type="button" className="btn-secondary touch-target" disabled={entries.length >= MEDIA_LIMITS.profiles}
        onClick={() => onChange((items) => [...items, { id: crypto.randomUUID(), enabled: true, name: "", role: "", bio: "" }])}>
        {t("miniSiteMedia.addProfile")}
      </button>
      {!entries.length && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{t("miniSiteMedia.teamEmpty")}</p>}
      {entries.map((item, index) => {
        const label = item.name || t("miniSiteMedia.profileEntry", { number: index + 1 });
        return (
          <fieldset key={item.id} className="min-w-0 space-y-3 rounded-lg border border-gray-200 p-3">
            <legend className="px-1 font-semibold [overflow-wrap:anywhere]">{label}</legend>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={item.enabled} onChange={(event) => update(item.id, { enabled: event.target.checked })} />{t("miniSiteMedia.showEntry")}</label>
              <OrderButtons label={label} index={index} count={entries.length} onMove={(offset) => onChange((items) => reorder(items, index, offset))} />
              <button type="button" className="touch-target rounded px-2 text-sm text-red-700" aria-label={t("miniSiteSections.deleteItem", { label })}
                onClick={() => { images.removeJob(`${item.id}:portrait`); onChange((items) => items.filter(({ id }) => id !== item.id)); }}>
                {t("common.delete")}
              </button>
            </div>
            {(["name", "role"] as const).map((key) =>
              <label key={key} className="block text-sm font-medium text-gray-700">{t(`miniSiteMedia.${key}`)}<input className="input-field mt-1" maxLength={MEDIA_LIMITS.title} value={item[key]} onChange={(event) => update(item.id, { [key]: event.target.value })} /></label>)}
            <label className="block text-sm font-medium text-gray-700">{t("miniSiteMedia.bio")}<textarea className="input-field mt-1" rows={3} maxLength={MEDIA_LIMITS.bio} value={item.bio} onChange={(event) => update(item.id, { bio: event.target.value })} /></label>
            <ImageField id={item.id} slot="portrait" image={item.portrait} images={images} onChange={(portrait) => update(item.id, { portrait })} />
          </fieldset>
        );
      })}
    </div>
  );
}
