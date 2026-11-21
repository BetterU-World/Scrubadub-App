import { ReactNode, useState, useCallback, useLayoutEffect, useRef } from "react";
import { clsx } from "clsx";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { LiveJobBanner } from "../LiveJobBanner";
import { PageTransition } from "./PageTransition";
import { AddToHomeScreenTip } from "../shared/AddToHomeScreenTip";
import { getMobileNavItemsForRole } from "./navigation";
import { ForegroundPresence } from "../shared/ForegroundPresence";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();
  const [pathname] = useLocation();
  const previousPathname = useRef(pathname);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hasMobileNavigation = getMobileNavItemsForRole(
    user?.role,
    user?.canManageBusinessConfiguration === true,
    user?.canManageSchedule === true,
    user?.canManageClients === true,
    user?.canManageSalesAndCommercial === true,
    user?.canManageTeam === true,
    user?.canManageDocuments === true,
    user?.canViewFinancials === true,
    user?.canManageInvoices === true,
    user?.canViewAnalytics === true,
    user?.canCreateJobs === true,
  ).length > 0;

  const toggleSidebar = useCallback((trigger: HTMLButtonElement) => {
    menuTriggerRef.current = trigger;
    setSidebarOpen((open) => !open);
  }, []);
  const openSidebar = useCallback((trigger: HTMLButtonElement) => {
    menuTriggerRef.current = trigger;
    setSidebarOpen(true);
  }, []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useLayoutEffect(() => {
    if (previousPathname.current !== pathname && window.matchMedia("(min-width: 768px)").matches) {
      const workspace = workspaceRef.current;
      if (workspace) workspace.scrollTop = 0;
    }
    previousPathname.current = pathname;
  }, [pathname]);

  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full min-w-0 max-w-full pt-[var(--safe-area-top)] md:h-[100dvh] md:min-h-0">
      <ForegroundPresence />
      <Sidebar mobileOpen={sidebarOpen} onMobileClose={closeSidebar} triggerRef={menuTriggerRef} />
      {/* Keep absolutely positioned content, such as screen-reader-only captions, inside the desktop scroll pane. */}
      <div
        ref={workspaceRef}
        className={clsx(
          "flex min-h-0 min-w-0 max-w-full flex-1 flex-col md:relative md:overflow-x-hidden md:overflow-y-auto md:overscroll-y-contain md:pb-0",
          hasMobileNavigation && "pb-[var(--mobile-bottom-occlusion)]"
        )}
      >
        <LiveJobBanner />
        <Header
          onMenuToggle={toggleSidebar}
          menuOpen={sidebarOpen}
        />
        <main className="min-w-0 max-w-full flex-1 p-4 md:p-6">
          <AddToHomeScreenTip />
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
      </div>
      {hasMobileNavigation && (
        <MobileNav menuOpen={sidebarOpen} onMoreOpen={openSidebar} />
      )}
    </div>
  );
}
