import Markdown from "react-markdown";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import ownerMd from "@/manuals/owner.md?raw";
import cleanerMd from "@/manuals/cleaner.md?raw";
import ownerMdEs from "@/manuals/owner.es.md?raw";
import cleanerMdEs from "@/manuals/cleaner.es.md?raw";

const MANUALS: Record<string, { titleKey: string; content: Record<string, string>; lastUpdated: string }> = {
  owner: { titleKey: "manuals.ownerManual", content: { en: ownerMd, es: ownerMdEs }, lastUpdated: "March 1, 2026" },
  cleaner: { titleKey: "manuals.cleanerManual", content: { en: cleanerMd, es: cleanerMdEs }, lastUpdated: "March 1, 2026" },
};

export function ManualViewerPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const manual = MANUALS[slug];

  if (!manual) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t("manuals.notFound")}
        </h1>
        <Link href="/manuals" className="text-primary-600 hover:text-primary-700">
          {t("manuals.backToManuals")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/manuals"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t("manuals.backToManuals")}
      </Link>
      <div className="mb-4 text-xs text-gray-400">
        {t("manuals.lastUpdated", { date: manual.lastUpdated })}
      </div>
      <article className="prose prose-gray max-w-none sm:max-w-2xl mx-auto">
        <Markdown>{manual.content[i18n.language] || manual.content.en}</Markdown>
      </article>
    </div>
  );
}
