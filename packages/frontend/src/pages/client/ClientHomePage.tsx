import { Link } from "wouter";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { ClientPortalShell } from "@/components/client/ClientPortalShell";
import { ClientPortalSection, formatClientDate, formatClientMoney } from "@/components/client/ClientPortalPage";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { getClientStatusTranslationKey } from "@/lib/clientPresentation";

const DUE_SOON_DAYS = 7;

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function daysUntil(date: string, today: string) {
  return Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
}

export function ClientHomePresentation({ home }: { home: any }) {
  const { t } = useTranslation();
  const companyByRelationshipId = new Map(home.relationships.map((item: any) => [String(item._id), item.companyName]));
  const propertyById = new Map(home.properties.map((item: any) => [String(item._id), item]));
  const accountById = new Map(home.commercialAccounts.map((item: any) => [String(item._id), item]));
  const provider = (record: any): string => String(companyByRelationshipId.get(String(record.clientRelationshipId)) ?? "");
  const location = (job: any): any => job.propertyId ? propertyById.get(String(job.propertyId)) : job.commercialAccountId ? accountById.get(String(job.commercialAccountId)) : null;
  const today = localDateString();
  const attention = [
    ...home.invoices.filter((invoice: any) => invoice.status === "issued" && invoice.dueDate && daysUntil(invoice.dueDate, today) <= DUE_SOON_DAYS).map((invoice: any) => ({ id: invoice._id, title: invoice.title || invoice.invoiceNumber, detail: formatClientMoney(invoice.totalCents), provider: provider(invoice), href: "/client/billing", kind: daysUntil(invoice.dueDate, today) < 0 ? "invoiceOverdue" : "invoiceDueSoon" })),
    ...home.serviceAgreements.filter((agreement: any) => agreement.status === "sent").map((agreement: any) => ({ id: agreement._id, title: agreement.title, provider: provider(agreement), href: `/client/service-agreements/${agreement._id}`, kind: "agreementReady" })),
    ...home.proposals.filter((proposal: any) => proposal.status === "sent").map((proposal: any) => ({ id: proposal._id, title: proposal.title, provider: provider(proposal), href: "/client/documents", kind: "proposalReady" })),
  ].slice(0, 5);
  const featured = home.upcomingJobs.find((job: any) => job.status === "in_progress") ?? home.upcomingJobs[0];
  const upcoming = home.upcomingJobs.filter((job: any) => job._id !== featured?._id).slice(0, 3);
  const recent = home.completedJobs.slice(0, 3);
  const serviceRow = (job: any) => { const place = location(job); return <article key={job._id} className="grid min-w-0 gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="break-words font-medium text-gray-900">{t(`jobTypes.${job.type}`, { defaultValue: String(job.type).replace(/_/g, " ") })}</p>{place && <p className="break-words text-sm text-gray-500">{place.name || place.clientName}</p>}<p className="break-words text-sm text-gray-500">{provider(job)}</p></div><div className="text-sm sm:text-right"><p>{formatClientDate(job.scheduledDate, t("clientHome.notSet"))}</p><p className="text-gray-500">{job.startTime || t("clientHome.timeToBeConfirmed")}</p></div></article>; };
  return <>
    <header><p className="break-words text-sm font-medium text-primary-700">{t("clientHome.welcome", { name: home.clientUser.displayName })}</p><h1 className="mt-1 break-words text-2xl font-semibold text-gray-900 sm:text-3xl">{t("clientHome.overviewTitle")}</h1><p className="mt-2 max-w-2xl text-sm text-gray-600">{t("clientHome.overviewDescription")}</p>{home.relationships.length > 0 && <p className="mt-3 break-words text-sm text-gray-500">{t("clientHome.connectedProviders", { providers: home.relationships.map((item: any) => item.companyName).join(", ") })}</p>}</header>
    {attention.length > 0 && <ClientPortalSection title={t("clientHome.needsAttention")} empty="" count={attention.length}><div className="grid gap-3 md:grid-cols-2">{attention.map((item: any) => <Link key={`${item.kind}:${item.id}`} href={item.href} className="touch-target rounded-lg border border-primary-200 bg-primary-50 p-4 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"><p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{t(`clientHome.attention.${item.kind}`)}</p><p className="mt-1 break-words font-medium text-gray-900">{item.title}</p>{item.detail && <p className="mt-1 text-sm font-semibold text-gray-900">{item.detail}</p>}<p className="mt-2 break-words text-sm text-gray-600">{item.provider}</p></Link>)}</div></ClientPortalSection>}
    <ClientPortalSection title={featured?.status === "in_progress" ? t("clientHome.serviceInProgress") : t("clientHome.nextService")} empty={t("clientHome.noUpcomingJobs")} count={featured ? 1 : 0}>{featured && <div>{serviceRow(featured)}<p className="mt-2 text-sm font-medium text-primary-700">{t(getClientStatusTranslationKey("job", featured.status))}</p></div>}</ClientPortalSection>
    <div className="grid gap-4 lg:grid-cols-2"><ClientPortalSection title={t("clientHome.upcomingServices")} empty={t("clientHome.noAdditionalUpcoming")} count={upcoming.length}><div className="divide-y divide-gray-100">{upcoming.map(serviceRow)}</div></ClientPortalSection><ClientPortalSection title={t("clientHome.recentServices")} empty={t("clientHome.noRecentActivity")} count={recent.length}><div className="divide-y divide-gray-100">{recent.map(serviceRow)}</div></ClientPortalSection></div>
    <nav aria-label={t("clientHome.explorePortal")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["services", "documents", "billing", "locations"] as const).map((page) => <Link key={page} href={`/client/${page}`} className="touch-target rounded-xl border border-gray-200 bg-white p-4 font-medium text-primary-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">{t(`clientHome.viewPages.${page}`)}</Link>)}</nav>
  </>;
}

export function ClientHomePage() {
  const { t } = useTranslation(); const { clientUserId, sessionToken, isLoading, signOut } = useClientAuth();
  const home = useQuery(api.queries.clientHome.getClientHome, clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip");
  const homeQueryActive = Boolean(clientUserId && sessionToken);
  if (isLoading || (homeQueryActive && home === undefined)) return <PageLoader />;
  if (!homeQueryActive || home === null || home === undefined) return <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4"><div className="card w-full max-w-md text-center"><h1 className="mb-3 text-xl font-semibold text-gray-900">{t("clientHome.signInRequired")}</h1><Link href="/client/login" className="btn-primary inline-block">{t("clientAuth.signIn")}</Link></div></div>;
  return <ClientPortalShell clientName={home.clientUser.displayName} onSignOut={signOut} pageTitle={t("clientHome.title")}><main className="space-y-6 px-4 py-6 sm:space-y-8 sm:py-8"><ClientHomePresentation home={home} /></main></ClientPortalShell>;
}
