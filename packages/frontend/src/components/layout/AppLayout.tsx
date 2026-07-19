import { ReactNode, useState, useCallback, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { LiveJobBanner } from "../LiveJobBanner";
import { PageTransition } from "./PageTransition";
import { AddToHomeScreenTip } from "../shared/AddToHomeScreenTip";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex min-h-screen min-h-[100dvh] pt-[var(--safe-area-top)]">
      <Sidebar mobileOpen={sidebarOpen} onMobileClose={closeSidebar} triggerRef={menuButtonRef} />
      <div className="flex min-h-0 flex-1 flex-col pb-[var(--mobile-bottom-occlusion)] md:pb-0">
        <LiveJobBanner />
        <Header
          onMenuToggle={toggleSidebar}
          menuButtonRef={menuButtonRef}
          menuOpen={sidebarOpen}
        />
        <main className="flex-1 p-4 md:p-6">
          <AddToHomeScreenTip />
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
      </div>
      <MobileNav />
    </div>
  );
}
