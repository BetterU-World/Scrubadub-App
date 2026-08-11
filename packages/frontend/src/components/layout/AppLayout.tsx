import { ReactNode, useState, useCallback, useRef } from "react";
import { clsx } from "clsx";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { LiveJobBanner } from "../LiveJobBanner";
import { PageTransition } from "./PageTransition";
import { AddToHomeScreenTip } from "../shared/AddToHomeScreenTip";
import { getMobileNavItemsForRole } from "./navigation";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();
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

  return (
    <div className="flex min-h-screen min-h-[100dvh] pt-[var(--safe-area-top)]">
      <Sidebar mobileOpen={sidebarOpen} onMobileClose={closeSidebar} triggerRef={menuTriggerRef} />
      <div
        className={clsx(
          "flex min-h-0 flex-1 flex-col md:pb-0",
          hasMobileNavigation && "pb-[var(--mobile-bottom-occlusion)]"
        )}
      >
        <LiveJobBanner />
        <Header
          onMenuToggle={toggleSidebar}
          menuOpen={sidebarOpen}
        />
        <main className="flex-1 p-4 md:p-6">
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
