import { Ellipsis, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  buildShowcasePath,
  getShowcaseNavigationSections,
  getShowcaseRelativePath,
  type ShowcasePageDefinition,
} from "./showcaseRegistry";

interface DemoShellProps {
  children: ReactNode;
  presentation: boolean;
  persona?: "owner" | "worker";
  currentPath?: string;
}

export function DemoShell({
  children,
  presentation,
  persona = "owner",
  currentPath = `/internal/demo/${persona}`,
}: DemoShellProps) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const sections = getShowcaseNavigationSections(persona);
  const pages = sections.flatMap((section) => section.pages);
  const mobileItems = pages
    .filter((page) => page.mobile.visible)
    .sort((a, b) => (a.mobile.priority ?? 0) - (b.mobile.priority ?? 0));
  const moreItems = pages.filter((page) => !page.mobile.visible);
  const relativePath = getShowcaseRelativePath(currentPath, persona) ?? "/";
  const moreIsActive = moreItems.some((page) => isPageActive(page, relativePath));

  if (presentation) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen min-h-[100dvh] bg-gray-50">
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="SCRUB" className="h-10 w-10" />
            <img src="/logo-word.png" alt="SCRUB" className="h-12 w-auto" />
          </div>
          <p className="mt-1 text-sm text-gray-500">BrightSide Cleaning Co.</p>
        </div>
        <nav className="flex-1 space-y-2 overflow-y-auto p-4" aria-label="Showcase navigation">
          {sections.map((section) => (
            <section key={section.titleKey} aria-labelledby={`showcase-${section.titleKey}`}>
              <h2
                id={`showcase-${section.titleKey}`}
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400"
              >
                {t(section.titleKey)}
              </h2>
              <div className="space-y-0.5">
                {section.pages.map((page) => {
                  const active = isPageActive(page, relativePath);
                  return (
                    <Link
                      key={page.id}
                      href={buildShowcasePath(persona, page.relativePath)}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-1 text-[13px] font-medium outline-none ring-primary-500 transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 ${
                        active
                          ? "bg-primary-50 text-primary-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <page.icon aria-hidden="true" className="h-4.5 w-4.5 flex-shrink-0" />
                      <span>{t(page.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-[var(--mobile-bottom-occlusion)] md:pb-0">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <img src="/logo-icon.png" alt="SCRUB" className="h-8 w-8" />
            <img src="/logo-word.png" alt="SCRUB" className="h-9 w-auto" />
          </div>
          <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 md:block">
            SCRUB Showcase
          </p>
          <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
            Fictional workspace
          </span>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-[var(--safe-area-bottom)] md:hidden" aria-label="Showcase mobile navigation">
        <div className="flex h-[var(--mobile-nav-height)] gap-1 px-2 py-2">
          {mobileItems.map((page) => {
            const active = isPageActive(page, relativePath);
            return (
              <Link
                key={page.id}
                href={buildShowcasePath(persona, page.relativePath)}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded px-1 py-1 text-xs outline-none ring-inset ring-primary-500 focus-visible:ring-2 ${active ? "text-primary-600" : "text-gray-500"}`}
              >
                <page.icon aria-hidden="true" className="h-5 w-5" />
                <span className="whitespace-nowrap">{t(page.labelKey)}</span>
              </Link>
            );
          })}
          {moreItems.length > 0 && (
            <button
              type="button"
              aria-controls="showcase-mobile-more"
              aria-expanded={moreOpen}
              aria-current={moreIsActive ? "page" : undefined}
              onClick={() => setMoreOpen(true)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded px-1 py-1 text-xs outline-none ring-inset ring-primary-500 focus-visible:ring-2 ${moreIsActive ? "text-primary-600" : "text-gray-500"}`}
            >
              <Ellipsis aria-hidden="true" className="h-5 w-5" />
              <span className="whitespace-nowrap">{t("nav.more")}</span>
            </button>
          )}
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-gray-950/40"
            aria-label="Close navigation"
            onClick={() => setMoreOpen(false)}
          />
          <section
            id="showcase-mobile-more"
            role="dialog"
            aria-modal="true"
            aria-labelledby="showcase-mobile-more-title"
            className="absolute bottom-0 left-0 right-0 max-h-[78dvh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(var(--safe-area-bottom)+1rem)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 id="showcase-mobile-more-title" className="font-semibold text-gray-900">More</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-lg p-2 text-gray-500 outline-none ring-primary-500 hover:bg-gray-100 focus-visible:ring-2"
                aria-label="Close navigation"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 grid gap-1 sm:grid-cols-2">
              {moreItems.map((page) => {
                const active = isPageActive(page, relativePath);
                return (
                  <Link
                    key={page.id}
                    href={buildShowcasePath(persona, page.relativePath)}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 font-medium outline-none ring-primary-500 focus-visible:ring-2 ${active ? "bg-primary-50 text-primary-700" : "text-gray-700 hover:bg-gray-50"}`}
                  >
                    <page.icon aria-hidden="true" className="h-5 w-5 flex-none" />
                    {t(page.labelKey)}
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function isPageActive(page: ShowcasePageDefinition, relativePath: string): boolean {
  if (page.relativePath === "/") return relativePath === "/";
  return relativePath === page.relativePath || relativePath.startsWith(`${page.relativePath}/`);
}
