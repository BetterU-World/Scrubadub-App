import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { DialogShell } from "@/components/ui/DialogShell";
import type { PublicMedia } from "../../../../../convex/lib/micrositeMediaModel";

type Image = NonNullable<PublicMedia["team"][number]["portrait"]>;
type Slide = { image: Image; label?: string; caption: string };

export function GallerySection({ heading, entries, isDark }: { heading: string; entries: PublicMedia["gallery"]; isDark: boolean }) {
  const { t } = useTranslation();
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  if (!entries.length) return null;
  const labels = { before: t("miniSiteMedia.slots.before"), after: t("miniSiteMedia.slots.after") };
  const slides = entries.flatMap((entry): Slide[] => entry.kind === "photo"
    ? [{ image: entry.image, caption: entry.caption }]
    : [{ image: entry.before, label: labels.before, caption: entry.caption }, { image: entry.after, label: labels.after, caption: entry.caption }]);
  const current = slides.findIndex(({ image }) => image.url === selectedUrl);
  const selected = slides[current];
  const go = (offset: -1 | 1) => {
    const next = slides[current + offset];
    if (next) setSelectedUrl(next.image.url);
  };
  const tile = ({ image, label }: Slide) => (
    <button type="button" aria-label={t("miniSiteMedia.enlarge", { alt: label ? `${label} — ${image.alt}` : image.alt })}
      onClick={() => setSelectedUrl(image.url)}
      className={`group relative block w-full overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
      <img src={image.url} alt={image.alt} width={image.width} height={image.height} loading="lazy" decoding="async"
        className="aspect-[4/3] w-full object-contain" />
      {label && <span className="absolute left-2 top-2 rounded bg-gray-950/90 px-2 py-1 text-xs font-semibold text-white">{label}</span>}
      <Maximize2 aria-hidden="true" className="absolute bottom-2 right-2 h-7 w-7 rounded bg-gray-950/80 p-1.5 text-white" />
    </button>
  );
  return (
    <section className={`px-4 py-16 sm:py-20 ${isDark ? "bg-gray-950 text-white" : "bg-white text-gray-900"}`}>
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-8 text-center text-3xl font-bold">{heading}</h2>
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <figure key={entry.id} className={`min-w-0 rounded-xl border p-3 ${isDark ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"} ${entry.kind === "pair" ? "sm:col-span-2" : ""}`}>
              {entry.kind === "photo" ? tile({ image: entry.image, caption: entry.caption }) : (
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  {tile({ image: entry.before, label: labels.before, caption: entry.caption })}
                  {tile({ image: entry.after, label: labels.after, caption: entry.caption })}
                </div>
              )}
              {(entry.title.trim() || entry.caption.trim()) && <figcaption className="mt-3 space-y-1 px-1 pb-1">
                {entry.title.trim() && <p className="font-semibold">{entry.title}</p>}
                {entry.caption.trim() && <p className={`whitespace-pre-wrap text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>{entry.caption}</p>}
              </figcaption>}
            </figure>
          ))}
        </div>
      </div>
      <DialogShell open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedUrl(null); }}
        title={selected?.label || t("miniSiteMedia.galleryViewer")} description={selected?.image.alt} className="!max-w-5xl"
        footer={selected && <>
          <button type="button" className="btn-secondary touch-target inline-flex items-center justify-center gap-2" disabled={current <= 0} onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" />{t("miniSiteMedia.previous")}</button>
          <button type="button" className="btn-secondary touch-target inline-flex items-center justify-center gap-2" disabled={current >= slides.length - 1} onClick={() => go(1)}>{t("miniSiteMedia.next")}<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </>}>
        {selected && <figure>
          <img src={selected.image.url} alt={selected.image.alt} width={selected.image.width} height={selected.image.height}
            className="mx-auto max-h-[64dvh] w-auto max-w-full rounded-lg object-contain" />
          {selected.caption && <figcaption className="mt-3 whitespace-pre-wrap text-center text-sm text-gray-700">{selected.caption}</figcaption>}
        </figure>}
      </DialogShell>
    </section>
  );
}

export function TeamSection({ heading, profiles, isDark }: { heading: string; profiles: PublicMedia["team"]; isDark: boolean }) {
  if (!profiles.length) return null;
  return (
    <section className={`px-4 py-16 sm:py-20 ${isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-8 text-center text-3xl font-bold">{heading}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map(({ id, name, role, bio, portrait }) => (
            <article key={id} className={`flex min-w-0 flex-col items-center rounded-xl border p-5 text-center ${isDark ? "border-gray-700 bg-gray-950" : "border-gray-200 bg-white"}`}>
              {portrait ? <img src={portrait.url} alt={portrait.alt} width={portrait.width} height={portrait.height} loading="lazy" decoding="async"
                className="mb-4 h-24 w-24 rounded-full object-cover object-top" />
                : <span aria-hidden="true" className={`mb-4 flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold ${isDark ? "bg-primary-950 text-primary-200" : "bg-primary-100 text-primary-800"}`}>
                  {name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase()}
                </span>}
              <h3 className="text-lg font-bold">{name}</h3>
              <p className={`mt-1 text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-600"}`}>{role}</p>
              {bio.trim() && <p className={`mt-3 whitespace-pre-wrap text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{bio}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
