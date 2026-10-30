import { Component, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useClientSession } from "@/hooks/useClientSession";
import { invalidateClientSession } from "@/lib/clientSession";
import { isClientSessionError } from "@/lib/clientSessionError";
import { isClientAuthPath } from "@/lib/clientAuthNavigation";
import { PageLoader } from "@/components/ui/LoadingSpinner";

class ClientQueryBoundary extends Component<{
  children: ReactNode;
  credential: string;
}, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error) {
    if (this.props.credential && isClientSessionError(error)) invalidateClientSession(this.props.credential);
  }

  render() {
    if (this.state.error) {
      if (!this.props.credential || !isClientSessionError(this.state.error)) throw this.state.error;
      return <PageLoader />;
    }
    return this.props.children;
  }
}

/** Scoped inside /client/*: never reads, clears, or keys content on staff credentials. */
export function ClientSessionRecovery({ children }: { children: ReactNode }) {
  const session = useClientSession();
  const [pathname, navigate] = useLocation();
  useEffect(() => {
    if (pathname.startsWith("/client/") && !isClientAuthPath(pathname) && !session.token) {
      navigate(`/client/login?next=${encodeURIComponent(pathname)}`, { replace: true });
    }
  }, [pathname, session.token, navigate]);

  return <ClientQueryBoundary key={session.revision} credential={session.token}>{children}</ClientQueryBoundary>;
}
