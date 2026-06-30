import { Link } from "wouter";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useTranslation } from "react-i18next";

function formatDate(date: string | number | undefined, fallback: string) {
  if (!date) return fallback;
  if (typeof date === "number") return new Date(date).toLocaleDateString();
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

function formatCents(cents: number | undefined) {
  if (cents == null) return "$0.00";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function Section({ title, empty, children, count }: { title: string; empty: string; children: ReactNode; count: number }) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <span className="badge bg-gray-100 text-gray-700">{count}</span>
      </div>
      {count === 0 ? <p className="text-sm text-gray-500">{empty}</p> : children}
    </section>
  );
}

export function ClientHomePage() {
  const { t } = useTranslation();
  const { clientUserId, isLoading, signOut } = useClientAuth();
  const home = useQuery(
    api.queries.clientHome.getClientHome,
    clientUserId ? { clientUserId } : "skip"
  );

  if (isLoading || home === undefined) return <PageLoader />;
  if (!clientUserId || home === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="card w-full max-w-md text-center">
          <h1 className="mb-3 text-xl font-semibold text-gray-900">{t("clientHome.signInRequired")}</h1>
          <Link href="/client/login" className="btn-primary inline-block">{t("clientAuth.signIn")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <img src="/logo-icon.png" alt="SCRUB" className="h-9 w-9" />
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{t("clientHome.title")}</h1>
              <p className="text-sm text-gray-500">{home.clientUser.displayName}</p>
            </div>
          </div>
          <button type="button" onClick={signOut} className="btn-secondary text-sm">{t("auth.signOut")}</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section className="card">
          <h2 className="text-base font-semibold text-gray-900">{t("clientHome.profile")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-gray-500">{t("auth.email")}</p>
              <p className="text-sm text-gray-900">{home.clientUser.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">{t("common.phone")}</p>
              <p className="text-sm text-gray-900">{home.clientUser.phone || t("clientHome.notSet")}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">{t("clientHome.providers")}</p>
              <p className="text-sm text-gray-900">{home.relationships.length}</p>
            </div>
          </div>
        </section>

        <Section title={t("clientHome.relationships")} empty={t("clientHome.noRelationships")} count={home.relationships.length}>
          <div className="grid gap-3 sm:grid-cols-2">
            {home.relationships.map((relationship: any) => (
              <div key={relationship._id} className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-gray-900">{relationship.companyName}</p>
                <p className="text-sm text-gray-500">{relationship.businessName || relationship.displayName}</p>
              </div>
            ))}
          </div>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title={t("clientHome.upcomingJobs")} empty={t("clientHome.noUpcomingJobs")} count={home.upcomingJobs.length}>
            <div className="divide-y divide-gray-100">
              {home.upcomingJobs.map((job: any) => (
                <div key={job._id} className="py-3 text-sm">
                  <p className="font-medium text-gray-900">{formatDate(job.scheduledDate, t("clientHome.notSet"))}</p>
                  <p className="text-gray-500">{job.startTime || t("clientHome.notSet")} · {job.status}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("clientHome.completedJobs")} empty={t("clientHome.noCompletedJobs")} count={home.completedJobs.length}>
            <div className="divide-y divide-gray-100">
              {home.completedJobs.map((job: any) => (
                <div key={job._id} className="py-3 text-sm">
                  <p className="font-medium text-gray-900">{formatDate(job.scheduledDate, t("clientHome.notSet"))}</p>
                  <p className="text-gray-500">{job.status}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("clientHome.properties")} empty={t("clientHome.noProperties")} count={home.properties.length + home.commercialAccounts.length}>
            <div className="divide-y divide-gray-100">
              {[...home.properties, ...home.commercialAccounts].map((item: any) => (
                <div key={item._id} className="py-3 text-sm">
                  <p className="font-medium text-gray-900">{item.name || item.clientName}</p>
                  <p className="text-gray-500">{item.address || item.serviceAddress || t("clientHome.notSet")}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("clientHome.invoices")} empty={t("clientHome.noInvoices")} count={home.invoices.length}>
            <div className="divide-y divide-gray-100">
              {home.invoices.map((invoice: any) => (
                <div key={invoice._id} className="flex justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                    <p className="text-gray-500">{invoice.status} · {formatDate(invoice.dueDate, t("clientHome.notSet"))}</p>
                  </div>
                  <p className="font-medium text-gray-900">{formatCents(invoice.totalCents)}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("clientHome.proposals")} empty={t("clientHome.noProposals")} count={home.proposals.length}>
            <div className="divide-y divide-gray-100">
              {home.proposals.map((proposal: any) => (
                <div key={proposal._id} className="py-3 text-sm">
                  <p className="font-medium text-gray-900">{proposal.title}</p>
                  <p className="text-gray-500">{proposal.status}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("clientHome.serviceAgreements")} empty={t("clientHome.noServiceAgreements")} count={home.serviceAgreements.length}>
            <div className="divide-y divide-gray-100">
              {home.serviceAgreements.map((agreement: any) => (
                <Link
                  key={agreement._id}
                  href={`/client/service-agreements/${agreement._id}`}
                  className="block py-3 text-sm hover:text-primary-700"
                >
                  <p className="font-medium text-gray-900">{agreement.title}</p>
                  <p className="text-gray-500">{agreement.status}</p>
                </Link>
              ))}
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
