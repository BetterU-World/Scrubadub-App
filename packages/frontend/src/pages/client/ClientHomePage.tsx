import { Link } from "wouter";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { ClientPortalShell } from "@/components/client/ClientPortalShell";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { ServiceAgreementStatusBadge } from "@/components/ui/ServiceAgreementStatusBadge";
import { useClientAuth } from "@/hooks/useClientAuth";
import { getClientStatusTranslationKey } from "@/lib/clientPresentation";

const DUE_SOON_DAYS = 7;
const ATTENTION_LIMIT = 5;
const RECENT_SERVICE_LIMIT = 3;
const UPCOMING_SERVICE_LIMIT = 3;

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
  id,
  title,
  description,
  empty,
  children,
  count,
  emphasis = "standard",
}: {
  id?: string;
  title: string;
  description?: string;
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
    <section id={id} className={`scroll-mt-32 space-y-3 rounded-xl border p-5 sm:p-6 ${styles}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        </div>
        {count !== undefined && count > 0 && (
          <span className="badge bg-gray-100 text-gray-700" aria-label={`${count} ${title}`}>{count}</span>
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
      <p className="mt-3 text-sm font-medium text-primary-700">
        {item.href ? t("clientHome.reviewAgreement") : t("clientHome.viewDetailsBelow")}
      </p>
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

function GroupHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

export function ClientHomePage() {
  const { t } = useTranslation();
  const { clientUserId, sessionToken, isLoading, signOut } = useClientAuth();
  const home = useQuery(
    api.queries.clientHome.getClientHome,
    clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip"
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
  const propertyById = new Map(home.properties.map((property: any) => [String(property._id), property]));
  const accountById = new Map(home.commercialAccounts.map((account: any) => [String(account._id), account]));
  const locationFor = (job: any) => {
    const property: any = job.propertyId ? propertyById.get(String(job.propertyId)) : undefined;
    const account: any = job.commercialAccountId ? accountById.get(String(job.commercialAccountId)) : undefined;
    return property
      ? { name: property.name, address: property.address }
      : account
        ? { name: account.clientName, address: account.serviceAddress }
        : null;
  };
  const serviceType = (job: any) => t(`jobTypes.${job.type}`, { defaultValue: String(job.type).replace(/_/g, " ") });
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
  const inProgressService = home.upcomingJobs.find((job: any) => job.status === "in_progress");
  const featuredService = inProgressService ?? home.upcomingJobs[0];
  const additionalUpcoming = home.upcomingJobs
    .filter((job: any) => job._id !== featuredService?._id)
    .slice(0, UPCOMING_SERVICE_LIMIT);
  const recentServices = home.completedJobs.slice(0, RECENT_SERVICE_LIMIT);
  const locations = [...home.properties, ...home.commercialAccounts];
  const navItems = [
    { href: "#overview", label: t("clientHome.navigation.overview") },
    { href: "#documents", label: t("clientHome.navigation.documents") },
    { href: "#billing", label: t("clientHome.navigation.billing") },
    { href: "#locations", label: t("clientHome.navigation.locations") },
    { href: "#account", label: t("clientHome.navigation.account") },
  ];

  return (
    <ClientPortalShell clientName={home.clientUser.displayName} onSignOut={signOut} navigation={navItems}>
      <main className="space-y-8 px-4 py-6 sm:py-8">
        <div id="overview" className="scroll-mt-32">
          <p className="text-sm font-medium text-primary-700">{t("clientHome.welcome", { name: home.clientUser.displayName })}</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900 sm:text-3xl">{t("clientHome.overviewTitle")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">{t("clientHome.overviewDescription")}</p>
        </div>

        {displayedAttention.length > 0 && (
          <Section title={t("clientHome.needsAttention")} empty="" count={displayedAttention.length} emphasis="primary">
            <div className="grid gap-3 md:grid-cols-2">
              {displayedAttention.map((item) => <AttentionCard key={`${item.kind}:${item.id}`} item={item} t={t} />)}
            </div>
          </Section>
        )}

        <Section
          title={inProgressService ? t("clientHome.serviceInProgress") : t("clientHome.nextService")}
          empty={t("clientHome.noUpcomingJobs")}
          count={featuredService ? 1 : 0}
          emphasis="primary"
        >
          {featuredService && (() => {
            const location = locationFor(featuredService);
            return (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <p className="text-lg font-semibold text-gray-900">{serviceType(featuredService)}</p>
                  {location && (
                    <div className="mt-1 text-sm text-gray-600">
                      <p>{location.name}</p>
                      {location.address && <p>{location.address}</p>}
                    </div>
                  )}
                  {companyFor(featuredService) && <p className="mt-2 text-sm text-gray-500">{companyFor(featuredService)}</p>}
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-semibold text-gray-900">{formatDate(featuredService.scheduledDate, t("clientHome.notSet"))}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {featuredService.startTime || t("clientHome.timeToBeConfirmed")}
                  </p>
                  <p className="mt-2 text-sm font-medium text-primary-700">
                    {t(getClientStatusTranslationKey("job", featuredService.status))}
                  </p>
                </div>
              </div>
            );
          })()}
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title={t("clientHome.upcomingServices")} empty={t("clientHome.noAdditionalUpcoming")} count={additionalUpcoming.length}>
            <div className="divide-y divide-gray-100">
              {additionalUpcoming.map((job: any) => {
                const location = locationFor(job);
                return (
                  <div key={job._id} className="grid gap-2 py-3 text-sm first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div>
                      <p className="font-medium text-gray-900">{serviceType(job)}</p>
                      {location && <p className="text-gray-500">{location.name}{location.address ? ` · ${location.address}` : ""}</p>}
                    </div>
                    <div className="sm:text-right">
                      <p className="text-gray-900">{formatDate(job.scheduledDate, t("clientHome.notSet"))}</p>
                      <p className="text-gray-500">{job.startTime || t("clientHome.timeToBeConfirmed")}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={t("clientHome.recentServices")} empty={t("clientHome.noRecentActivity")} count={recentServices.length}>
            <div className="divide-y divide-gray-100">
              {recentServices.map((job: any) => {
                const location = locationFor(job);
                return (
                  <div key={job._id} className="py-3 text-sm first:pt-0 last:pb-0">
                    <p className="font-medium text-gray-900">{serviceType(job)}</p>
                    <p className="text-gray-500">{formatDate(job.completedAt || job.scheduledDate, t("clientHome.notSet"))}</p>
                    {location && <p className="text-gray-500">{location.name}</p>}
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        <div id="documents" className="scroll-mt-32 space-y-4">
          <GroupHeading title={t("clientHome.documents")} description={t("clientHome.documentsDescription")} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t("clientHome.serviceAgreements")} empty={t("clientHome.noServiceAgreements")} count={home.serviceAgreements.length}>
              <div className="divide-y divide-gray-100">
                {home.serviceAgreements.map((agreement: any) => (
                  <Link
                    key={agreement._id}
                    href={`/client/service-agreements/${agreement._id}`}
                    className="block rounded-sm py-3 text-sm hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">{agreement.title}</p>
                        {companyFor(agreement) && <p className="mt-1 text-gray-500">{companyFor(agreement)}</p>}
                      </div>
                      <ServiceAgreementStatusBadge agreement={agreement} audience="client" />
                    </div>
                  </Link>
                ))}
              </div>
            </Section>

            <Section title={t("clientHome.proposals")} description={t("clientHome.proposalsDescription")} empty={t("clientHome.noProposals")} count={home.proposals.length}>
              <div className="divide-y divide-gray-100">
                {home.proposals.map((proposal: any) => (
                  <div key={proposal._id} className="py-3 text-sm first:pt-0 last:pb-0">
                    <p className="font-medium text-gray-900">{proposal.title}</p>
                    <p className="text-gray-500">{t(getClientStatusTranslationKey("proposal", proposal.status))}</p>
                    {companyFor(proposal) && <p className="text-gray-500">{companyFor(proposal)}</p>}
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>

        <div id="billing" className="scroll-mt-32 space-y-4">
          <GroupHeading title={t("clientHome.billing")} description={t("clientHome.billingDescription")} />
          <Section title={t("clientHome.invoices")} description={t("clientHome.invoicesDescription")} empty={t("clientHome.noInvoices")} count={home.invoices.length}>
            <div className="divide-y divide-gray-100">
              {home.invoices.map((invoice: any) => (
                <div key={invoice._id} className="grid gap-2 py-3 text-sm first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <p className="font-medium text-gray-900">{invoice.title || invoice.invoiceNumber}</p>
                    {invoice.title && <p className="text-gray-500">{invoice.invoiceNumber}</p>}
                    <p className="text-gray-500">
                      {t(getClientStatusTranslationKey("invoice", invoice.status))}
                      {invoice.dueDate && ` · ${t("clientHome.dueDate", { date: formatDate(invoice.dueDate, "") })}`}
                    </p>
                    {companyFor(invoice) && <p className="text-gray-500">{companyFor(invoice)}</p>}
                  </div>
                  <p className="font-semibold text-gray-900 sm:text-right">{formatCents(invoice.totalCents)}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div id="locations" className="scroll-mt-32 space-y-4">
          <GroupHeading title={t("clientHome.properties")} description={t("clientHome.locationsDescription")} />
          <Section title={t("clientHome.serviceLocationsOnFile")} empty={t("clientHome.noProperties")} count={locations.length} emphasis="reference">
            <div className="grid gap-3 sm:grid-cols-2">
              {locations.map((item: any) => (
                <div key={item._id} className="rounded-lg border border-gray-200 p-4 text-sm">
                  <p className="font-medium text-gray-900">{item.name || item.clientName}</p>
                  <p className="mt-1 text-gray-500">{item.address || item.serviceAddress || t("clientHome.notSet")}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div id="account" className="scroll-mt-32 space-y-4">
          <GroupHeading title={t("clientHome.accountInformation")} description={t("clientHome.accountDescription")} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t("clientHome.contactInformation")} empty="" emphasis="reference">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-gray-500">{t("auth.email")}</p>
                  <p className="text-sm text-gray-900 break-words">{home.clientUser.email}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t("common.phone")}</p>
                  <p className="text-sm text-gray-900">{home.clientUser.phone || t("clientHome.notSet")}</p>
                </div>
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
        </div>
      </main>
    </ClientPortalShell>
  );
}
