import { Link } from "wouter";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useTranslation } from "react-i18next";
import { ServiceAgreementStatusBadge } from "@/components/ui/ServiceAgreementStatusBadge";
import { getClientStatusTranslationKey } from "@/lib/clientPresentation";

const DUE_SOON_DAYS = 7;
const ATTENTION_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 3;

function formatDate(date: string | number | undefined, fallback: string) {
  if (!date) return fallback;
  if (typeof date === "number") return new Date(date).toLocaleDateString();
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

function formatCents(cents: number | undefined) {
  if (cents == null) return "$0.00";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function daysUntil(date: string, today: string) {
  const due = new Date(`${date}T00:00:00`).getTime();
  const current = new Date(`${today}T00:00:00`).getTime();
  return Math.round((due - current) / 86_400_000);
}

function localDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Section({
  title,
  empty,
  children,
  count,
  emphasis = "standard",
}: {
  title: string;
  empty: string;
  children: ReactNode;
  count?: number;
  emphasis?: "primary" | "standard" | "reference";
}) {
  const styles = emphasis === "primary"
    ? "border-primary-200 bg-white shadow-sm"
    : emphasis === "reference"
      ? "border-gray-200 bg-white"
      : "border-gray-200 bg-white shadow-sm";

  return (
    <section className={`space-y-3 rounded-xl border p-6 ${styles}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="badge bg-gray-100 text-gray-700">{count}</span>
        )}
      </div>
      {count === 0 ? <p className="text-sm text-gray-500">{empty}</p> : children}
    </section>
  );
}

type AttentionItem = {
  id: string;
  kind: "invoice" | "proposal" | "agreement";
  labelKey: string;
  title: string;
  detail?: string;
  companyName?: string;
  priority: number;
  href?: string;
};

function AttentionCard({ item, t }: { item: AttentionItem; t: (key: string, options?: any) => string }) {
  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{t(item.labelKey)}</p>
          <p className="mt-1 font-medium text-gray-900">{item.title}</p>
        </div>
        {item.detail && <p className="text-sm font-semibold text-gray-900">{item.detail}</p>}
      </div>
      {item.companyName && <p className="mt-2 text-sm text-gray-600">{item.companyName}</p>}
    </>
  );

  const classes = "block rounded-lg border border-primary-200 bg-primary-50 p-4";
  return item.href ? (
    <Link href={item.href} className={`${classes} focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 hover:border-primary-300`}>
      {content}
    </Link>
  ) : (
    <div className={classes}>{content}</div>
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

  const companyByRelationshipId = new Map(
    home.relationships.map((relationship: any) => [String(relationship._id), relationship.companyName])
  );
  const companyFor = (record: any) => companyByRelationshipId.get(String(record.clientRelationshipId));
  const today = localDateString();
  const attentionItems: AttentionItem[] = [];

  for (const invoice of home.invoices) {
    if (invoice.status !== "issued" || !invoice.dueDate) continue;
    const remainingDays = daysUntil(invoice.dueDate, today);
    if (remainingDays < 0 || remainingDays <= DUE_SOON_DAYS) {
      attentionItems.push({
        id: String(invoice._id),
        kind: "invoice",
        labelKey: remainingDays < 0 ? "clientHome.attention.invoiceOverdue" : "clientHome.attention.invoiceDueSoon",
        title: invoice.title || invoice.invoiceNumber,
        detail: `${formatCents(invoice.totalCents)} · ${t("clientHome.dueDate", { date: formatDate(invoice.dueDate, "") })}`,
        companyName: companyFor(invoice),
        priority: remainingDays < 0 ? 0 : 3,
      });
    }
  }
  for (const agreement of home.serviceAgreements) {
    if (agreement.status !== "sent") continue;
    attentionItems.push({
      id: String(agreement._id),
      kind: "agreement",
      labelKey: "clientHome.attention.agreementReady",
      title: agreement.title,
      companyName: companyFor(agreement),
      priority: 1,
      href: `/client/service-agreements/${agreement._id}`,
    });
  }
  for (const proposal of home.proposals) {
    if (proposal.status !== "sent") continue;
    attentionItems.push({
      id: String(proposal._id),
      kind: "proposal",
      labelKey: "clientHome.attention.proposalReady",
      title: proposal.title,
      companyName: companyFor(proposal),
      priority: 2,
    });
  }

  const displayedAttention = attentionItems.sort((a, b) => a.priority - b.priority).slice(0, ATTENTION_LIMIT);
  const attentionIds = new Set(displayedAttention.map((item) => `${item.kind}:${item.id}`));
  const visibleInvoices = home.invoices.filter((invoice: any) => !attentionIds.has(`invoice:${invoice._id}`));
  const visibleProposals = home.proposals.filter((proposal: any) => !attentionIds.has(`proposal:${proposal._id}`));
  const visibleAgreements = home.serviceAgreements.filter((agreement: any) => !attentionIds.has(`agreement:${agreement._id}`));
  const nextJob = home.upcomingJobs[0];
  const recentJobs = home.completedJobs.slice(0, RECENT_ACTIVITY_LIMIT);

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
        {displayedAttention.length > 0 && (
          <Section title={t("clientHome.needsAttention")} empty="" count={displayedAttention.length} emphasis="primary">
            <div className="grid gap-3 md:grid-cols-2">
              {displayedAttention.map((item) => <AttentionCard key={`${item.kind}:${item.id}`} item={item} t={t} />)}
            </div>
          </Section>
        )}

        <Section title={t("clientHome.upcomingJobs")} empty={t("clientHome.noUpcomingJobs")} count={nextJob ? 1 : 0} emphasis="primary">
          {nextJob && (
            <div className="text-sm">
              <p className="text-lg font-semibold text-gray-900">{formatDate(nextJob.scheduledDate, t("clientHome.notSet"))}</p>
              <p className="mt-1 text-gray-600">
                {nextJob.startTime || t("clientHome.notSet")} · {t(getClientStatusTranslationKey("job", nextJob.status))}
              </p>
              {companyFor(nextJob) && <p className="mt-2 text-gray-500">{companyFor(nextJob)}</p>}
            </div>
          )}
        </Section>

        <Section title={t("clientHome.recentActivity")} empty={t("clientHome.noRecentActivity")} count={recentJobs.length}>
          <div className="divide-y divide-gray-100">
            {recentJobs.map((job: any) => (
              <div key={job._id} className="py-3 text-sm first:pt-0 last:pb-0">
                <p className="font-medium text-gray-900">{t("clientHome.completedService")}</p>
                <p className="text-gray-500">{formatDate(job.completedAt || job.scheduledDate, t("clientHome.notSet"))}</p>
                {companyFor(job) && <p className="text-gray-500">{companyFor(job)}</p>}
              </div>
            ))}
          </div>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title={t("clientHome.invoices")}
            empty={home.invoices.length ? t("clientHome.noOtherInvoices") : t("clientHome.noInvoices")}
            count={visibleInvoices.length}
          >
            <div className="divide-y divide-gray-100">
              {visibleInvoices.map((invoice: any) => (
                <div key={invoice._id} className="flex justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                    <p className="text-gray-500">
                      {t(getClientStatusTranslationKey("invoice", invoice.status))}
                      {invoice.dueDate && ` · ${t("clientHome.dueDate", { date: formatDate(invoice.dueDate, "") })}`}
                    </p>
                  </div>
                  <p className="font-medium text-gray-900">{formatCents(invoice.totalCents)}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title={t("clientHome.proposals")}
            empty={home.proposals.length ? t("clientHome.noOtherProposals") : t("clientHome.noProposals")}
            count={visibleProposals.length}
          >
            <div className="divide-y divide-gray-100">
              {visibleProposals.map((proposal: any) => (
                <div key={proposal._id} className="py-3 text-sm">
                  <p className="font-medium text-gray-900">{proposal.title}</p>
                  <p className="text-gray-500">{t(getClientStatusTranslationKey("proposal", proposal.status))}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title={t("clientHome.serviceAgreements")}
            empty={home.serviceAgreements.length ? t("clientHome.noOtherServiceAgreements") : t("clientHome.noServiceAgreements")}
            count={visibleAgreements.length}
          >
            <div className="divide-y divide-gray-100">
              {visibleAgreements.map((agreement: any) => (
                <Link
                  key={agreement._id}
                  href={`/client/service-agreements/${agreement._id}`}
                  className="block py-3 text-sm hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                >
                  <p className="font-medium text-gray-900">{agreement.title}</p>
                  <ServiceAgreementStatusBadge agreement={agreement} audience="client" className="mt-1" />
                </Link>
              ))}
            </div>
          </Section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title={t("clientHome.properties")} empty={t("clientHome.noProperties")} count={home.properties.length + home.commercialAccounts.length} emphasis="reference">
            <div className="divide-y divide-gray-100">
              {[...home.properties, ...home.commercialAccounts].map((item: any) => (
                <div key={item._id} className="py-3 text-sm">
                  <p className="font-medium text-gray-900">{item.name || item.clientName}</p>
                  <p className="text-gray-500">{item.address || item.serviceAddress || t("clientHome.notSet")}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("clientHome.relationships")} empty={t("clientHome.noRelationships")} count={home.relationships.length} emphasis="reference">
            <div className="grid gap-3 sm:grid-cols-2">
              {home.relationships.map((relationship: any) => (
                <div key={relationship._id} className="rounded-lg border border-gray-200 p-3">
                  <p className="font-medium text-gray-900">{relationship.companyName}</p>
                  <p className="text-sm text-gray-500">{relationship.businessName || relationship.displayName}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <Section title={t("clientHome.profile")} empty="" emphasis="reference">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-gray-500">{t("auth.email")}</p>
              <p className="text-sm text-gray-900">{home.clientUser.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">{t("common.phone")}</p>
              <p className="text-sm text-gray-900">{home.clientUser.phone || t("clientHome.notSet")}</p>
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}
