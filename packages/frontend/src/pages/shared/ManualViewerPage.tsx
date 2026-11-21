import { useEffect } from "react";
import type { Components } from "react-markdown";
import { useAuth } from "@/hooks/useAuth";
import Markdown from "react-markdown";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { PageBack } from "@/components/ui/PageBack";
import ownerMd from "@/manuals/owner.md?raw";
import cleanerMd from "@/manuals/cleaner.md?raw";
import ownerMdEs from "@/manuals/owner.es.md?raw";
import cleanerMdEs from "@/manuals/cleaner.es.md?raw";
import managerMd from "@/manuals/manager.md?raw";
import managerMdEs from "@/manuals/manager.es.md?raw";

const MANUALS: Record<string, { titleKey: string; content: Record<string, string>; lastUpdated: string }> = {
  owner: { titleKey: "manuals.ownerManual", content: { en: ownerMd, es: ownerMdEs }, lastUpdated: "October 30, 2026" },
  cleaner: { titleKey: "manuals.cleanerManual", content: { en: cleanerMd, es: cleanerMdEs }, lastUpdated: "October 30, 2026" },
  manager: { titleKey: "manuals.managerGuide", content: { en: managerMd, es: managerMdEs }, lastUpdated: "October 30, 2026" },
};

// Owner guides use the same numbered chapters in both languages.
const OWNER_CHAPTER_IDS: Partial<Record<string, string>> = {
  "5": "property-setup",
  "6": "cleaner-invitations",
  "8": "job-scheduling",
  "9": "calendar",
  "10": "quality-review",
  "21": "troubleshooting",
};

const ownerHeadings: Components = {
  h2: ({ children }) => {
    const chapter = typeof children === "string" ? /^(\d+)\./.exec(children)?.[1] : undefined;
    const id = chapter ? OWNER_CHAPTER_IDS[chapter] : undefined;
    return id ? <h2 id={id} className="scroll-mt-4">{children}</h2> : <h2>{children}</h2>;
  },
};

export function ManualViewerPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const manual = Object.prototype.hasOwnProperty.call(MANUALS, slug) ? MANUALS[slug] : undefined;
  const backLabel = t(user?.role === "owner" ? "learningCenter.back" : "navigation.backToManuals");

  useEffect(() => {
    function scrollToChapter() {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    }

    scrollToChapter();
    window.addEventListener("hashchange", scrollToChapter);
    return () => window.removeEventListener("hashchange", scrollToChapter);
  }, [slug, i18n.language]);

  if (!manual) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t("manuals.notFound")}
        </h1>
        <PageBack href="/manuals" label={backLabel} className="mt-4" />
      </div>
    );
  }

  return (
    <div>
      <PageBack href="/manuals" label={backLabel} className="mb-4" />
      <div className="mb-4 text-xs text-gray-400">
        {t("manuals.lastUpdated", { date: manual.lastUpdated })}
      </div>
      <article className="prose prose-gray max-w-none sm:max-w-2xl mx-auto">
        <Markdown components={slug === "owner" ? ownerHeadings : undefined}>
          {manual.content[i18n.language] || manual.content.en}
        </Markdown>
      </article>
    </div>
  );
}
