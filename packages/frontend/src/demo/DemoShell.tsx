import {
  BarChart3,
  Building2,
  Calendar,
  ClipboardCheck,
  Flag,
  Inbox,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

interface DemoShellProps {
  children: ReactNode;
  presentation: boolean;
}

const desktopItems = [
  { labelKey: "nav.overview", icon: LayoutDashboard, active: true },
  { labelKey: "nav.properties", icon: Building2, active: false },
  { labelKey: "nav.employees", icon: Users, active: false },
  { labelKey: "nav.jobs", icon: ClipboardCheck, active: false },
  { labelKey: "nav.calendar", icon: Calendar, active: false },
  { labelKey: "nav.redFlags", icon: Flag, active: false },
  { labelKey: "nav.performance", icon: BarChart3, active: false },
] as const;

const mobileItems = [
  { labelKey: "nav.overview", icon: LayoutDashboard, active: true },
  { labelKey: "nav.jobs", icon: ClipboardCheck, active: false },
  { labelKey: "nav.requests", icon: Inbox, active: false },
  { labelKey: "nav.properties", icon: Building2, active: false },
] as const;

export function DemoShell({ children, presentation }: DemoShellProps) {
  const { t } = useTranslation();

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
        <nav className="flex-1 space-y-1 p-4" aria-label="Demo navigation">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {t("nav.dashboard")}
          </p>
          {desktopItems.map((item) => (
            <div
              key={item.labelKey}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                item.active ? "bg-primary-50 text-primary-700" : "text-gray-600"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {t(item.labelKey)}
            </div>
          ))}
        </nav>
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
              M
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Maya</p>
              <p className="text-xs capitalize text-gray-500">Owner</p>
            </div>
          </div>
        </div>
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
              key={item.labelKey}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-1 text-xs ${item.active ? "text-primary-600" : "text-gray-500"}`}
            >
              <item.icon className="h-5 w-5" />
              <span className="whitespace-nowrap">{t(item.labelKey)}</span>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
