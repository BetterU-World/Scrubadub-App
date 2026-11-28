import { Download, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PublicResource } from "../../../../../convex/lib/micrositeResourcesModel";

export function safeResourceUrl(value?: string) {
  try {
    const url = new URL(value ?? "");
    if ((url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
      !url.username && !url.password && !url.search && !url.hash && /^\/microsite-resource\/[a-z0-9-]+\/[\w-]+\/[\w-]+$/.test(url.pathname)) return url.href;
  } catch { /* An invalid destination must never become a public link. */ }
}

export function ResourceCards({ heading, entries, isDark, preview }: {
  heading: string; entries: PublicResource[]; isDark: boolean; preview?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const numbers = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 });
  if (!entries.length) return null;
  return <section className={`px-4 py-16 sm:py-20 ${isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900"}`}>
    <div className="mx-auto max-w-6xl">
      <h2 className="mb-8 text-center text-3xl font-bold">{heading}</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{entries.map((entry) => {
        const url = preview ? undefined : safeResourceUrl(entry.url);
        if (!url && !preview) return null;
        const label = t("miniSiteResources.download", { title: entry.title });
        const content = <><Download aria-hidden="true" className="h-4 w-4" />{t("miniSiteResources.downloadPdf")}</>;
        return <li key={entry.id} className={`flex min-w-0 flex-col items-start gap-2 rounded-xl border p-5 ${isDark
          ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}>
          <FileText aria-hidden="true" className="h-6 w-6" />
          <h3 className="text-lg font-semibold [overflow-wrap:anywhere]">{entry.title}</h3>
          <p className="text-sm opacity-80">PDF · {entry.bytes < 1024 ** 2
            ? `${numbers.format(Math.ceil(entry.bytes / 1024))} KB` : `${numbers.format(entry.bytes / 1024 ** 2)} MB`}</p>
          {entry.description && <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{entry.description}</p>}
          {url ? <a href={url} aria-label={label} className="btn-secondary touch-target mt-2 inline-flex items-center gap-2">{content}</a>
            : <button type="button" disabled aria-label={label} className="btn-secondary touch-target mt-2 inline-flex items-center gap-2 opacity-60">{content}</button>}
        </li>;
      })}</ul>
    </div>
  </section>;
}
