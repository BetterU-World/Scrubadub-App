import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import {
  getMobileNavItemsForRole,
  ownerSections,
  workerSections,
} from "../components/layout/navigation";
import { Ellipsis } from "lucide-react";

interface DemoShellProps {
  children: ReactNode;
  presentation: boolean;
  persona?: "owner" | "worker";
}

export function DemoShell({ children, presentation, persona = "owner" }: DemoShellProps) {
  const { t } = useTranslation();
  const sections = persona === "worker" ? workerSections : ownerSections;
  const mobileItems = getMobileNavItemsForRole(persona);

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
        <nav className="flex-1 space-y-2 overflow-y-auto p-4" aria-label="Demo navigation">
          {sections.map((section) => (
            <section key={section.titleKey} aria-labelledby={`demo-${section.titleKey}`}>
              <h2
                id={`demo-${section.titleKey}`}
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400"
              >
                {t(section.titleKey)}
              </h2>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = item.href === "/";
                  return (
                    <div
                      key={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-1 text-[13px] font-medium transition-colors ${
                        active
                          ? "bg-primary-50 text-primary-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <item.icon aria-hidden="true" className="h-4.5 w-4.5 flex-shrink-0" />
                      <span>{t(item.labelKey)}</span>
                    </div>
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
            Demo Mode
          </p>
          <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
            Fictional workspace
          </span>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-[var(--safe-area-bottom)] md:hidden" aria-label="Demo mobile navigation">
        <div className="flex h-[var(--mobile-nav-height)] gap-1 px-2 py-2">
          {mobileItems.map((item) => (
            <div
              key={item.href}
              aria-current={item.href === "/" ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1 text-xs ${item.href === "/" ? "text-primary-600" : "text-gray-500"}`}
            >
              <item.icon aria-hidden="true" className="h-5 w-5" />
              <span className="whitespace-nowrap">{t(item.labelKey)}</span>
            </div>
          ))}
          {persona === "worker" && (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1 text-xs text-gray-500">
              <Ellipsis aria-hidden="true" className="h-5 w-5" />
              <span className="whitespace-nowrap">{t("nav.more")}</span>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
