import { Component, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";

class Boundary extends Component<
  { children: ReactNode; fallback: (error: Error) => ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error
      ? this.props.fallback(this.state.error)
      : this.props.children;
  }
}

/** Query failures stay local: no raw server traces or knowingly partial financial totals. */
export function FinancialBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  return (
    <Boundary
      key={attempt}
      fallback={(error) => (
        <section className="card space-y-3 min-w-0" role="alert">
          <p className="break-words">
            {t(
              /too large|safe bound|Too many|history limit/i.test(error.message)
                ? user?.role === "owner" || user?.role === "manager"
                  ? "compensation.limitError"
                  : "compensation.workerLimitError"
                : "compensation.readError",
            )}
          </p>
          <button
            className="btn-secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t("compensation.retryRead")}
          </button>
        </section>
      )}
    >
      {children}
    </Boundary>
  );
}
