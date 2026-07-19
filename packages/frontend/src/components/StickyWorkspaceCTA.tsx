import { ReactNode } from "react";

interface StickyWorkspaceCTAProps {
  children: ReactNode;
  visible: boolean;
}

export function StickyWorkspaceCTA({ children, visible }: StickyWorkspaceCTAProps) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-[var(--mobile-bottom-occlusion)] left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.08)] md:bottom-0">
      <div className="mx-auto max-w-2xl px-4 py-3">
        {children}
      </div>
    </div>
  );
}
