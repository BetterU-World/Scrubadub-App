import { Component, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useStaffSession } from "@/hooks/useStaffSession";
import { invalidateStaffSession } from "@/lib/staffSession";
import { isStaffSessionError } from "@/lib/staffSessionError";
import { PageLoader } from "@/components/ui/LoadingSpinner";

class SessionQueryBoundary extends Component<{
  children: ReactNode;
  credential: string;
  enabled: boolean;
}, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error) {
    if (this.props.enabled && isStaffSessionError(error)) {
      // This instance belongs to one session revision, even if a new login won the race.
      invalidateStaffSession(this.props.credential);
    }
  }

  render() {
    if (this.state.error) {
      if (!this.props.enabled || !isStaffSessionError(this.state.error)) throw this.state.error;
      return <PageLoader />;
    }
    return this.props.children;
  }
}

/** Above App so billing and shell failures can recover before any inner boundary. */
export function StaffSessionRecovery({ children }: { children: ReactNode }) {
  const session = useStaffSession();
  const handledRecovery = useRef<number | null>(null);
  const [pathname, navigate] = useLocation();
  const staffRoute = !pathname.startsWith("/client/");
  const authRoute = pathname === "/login" || pathname === "/signup" || pathname === "/forgot-password" ||
    pathname.startsWith("/reset-password/") || pathname.startsWith("/invite/") || pathname === "/setup";

  useEffect(() => {
    if (staffRoute && session.recoveryRequired && !session.token && handledRecovery.current !== session.revision) {
      handledRecovery.current = session.revision;
      if (!authRoute) navigate("/login", { replace: true });
    }
  }, [staffRoute, authRoute, session.recoveryRequired, session.token, session.revision, navigate]);

  return <SessionQueryBoundary key={staffRoute ? session.revision : "client"} credential={session.token} enabled={staffRoute && !!session.token}>
    {children}
  </SessionQueryBoundary>;
}
