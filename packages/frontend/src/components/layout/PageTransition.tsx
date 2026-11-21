import { ReactNode } from "react";
import { useLocation } from "wouter";

export function PageTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    // Release the desktop transform after entry so fixed overlays can escape the scroll pane.
    <div key={location} className="min-w-0 max-w-full animate-page-in md:[animation-fill-mode:backwards]">
      {children}
    </div>
  );
}
