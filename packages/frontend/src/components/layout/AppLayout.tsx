import { ReactNode, useState, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { LiveJobBanner } from "../LiveJobBanner";
import { PageTransition } from "./PageTransition";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={sidebarOpen} onMobileClose={closeSidebar} />
      <div className="flex-1 flex flex-col min-h-screen">
        <LiveJobBanner />
        <Header onMenuToggle={toggleSidebar} />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
      </div>
      <MobileNav />
    </div>
  );
}
