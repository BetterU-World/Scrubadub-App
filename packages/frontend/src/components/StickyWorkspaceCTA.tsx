import { ReactNode } from "react";

interface StickyWorkspaceCTAProps {
  children: ReactNode;
  visible: boolean;
}

export function StickyWorkspaceCTA({ children, visible }: StickyWorkspaceCTAProps) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
      <div className="max-w-2xl mx-auto px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </div>
    </div>
  );
}
