import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ClientPortalShell } from "./ClientPortalShell";
import { PageLoader } from "../ui/LoadingSpinner";
import { useClientAuth } from "../../hooks/useClientAuth";

export function ClientPortalPage({ title, description, data, children }: { title: string; description: string; data: any; children: ReactNode }) {
  const { t } = useTranslation();
  const { clientUserId, sessionToken, isLoading, signOut } = useClientAuth();
  const queryActive = Boolean(clientUserId && sessionToken);
  if (isLoading || (queryActive && data === undefined)) return <PageLoader />;
  if (!queryActive || data === null || data === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4"><div className="card w-full max-w-md text-center"><h1 className="mb-3 text-xl font-semibold text-gray-900">{t("clientHome.signInRequired")}</h1><Link href="/client/login" className="btn-primary inline-block">{t("clientAuth.signIn")}</Link></div></div>;
  }
  const clientName = data.clientName ?? data.clientUser?.displayName;
  return <ClientPortalShell clientName={clientName} onSignOut={signOut} pageTitle={title}><main className="space-y-6 px-4 py-6 sm:py-8"><header><h1 className="break-words text-2xl font-semibold text-gray-900 sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl break-words text-sm text-gray-600">{description}</p></header>{children}</main></ClientPortalShell>;
}

export function ClientPortalSection({ title, empty, count, children }: { title: string; empty: string; count: number; children: ReactNode }) {
  return <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex items-start justify-between gap-3"><h2 className="break-words text-base font-semibold text-gray-900">{title}</h2>{count > 0 && <span className="badge bg-gray-100 text-gray-700">{count}</span>}</div>{count === 0 ? <p className="text-sm text-gray-500">{empty}</p> : children}</section>;
}

export function formatClientDate(value: string | number | undefined, fallback: string) {
  if (!value) return fallback;
  return typeof value === "number" ? new Date(value).toLocaleDateString() : new Date(`${value}T00:00:00`).toLocaleDateString();
}

export function formatClientMoney(cents: number | undefined) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);
}
