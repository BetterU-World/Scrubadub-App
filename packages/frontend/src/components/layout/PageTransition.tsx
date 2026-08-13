import { ReactNode } from "react";
import { useLocation } from "wouter";

export function PageTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <div key={location} className="min-w-0 max-w-full animate-page-in">
      {children}
    </div>
  );
}
