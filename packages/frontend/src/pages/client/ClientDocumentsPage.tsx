import { Link } from "wouter";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { ClientPortalPage, ClientPortalSection, formatClientMoney } from "@/components/client/ClientPortalPage";
import { ServiceAgreementStatusBadge } from "@/components/ui/ServiceAgreementStatusBadge";
import { useClientAuth } from "@/hooks/useClientAuth";
import { getClientStatusTranslationKey } from "@/lib/clientPresentation";

export function ClientDocumentsPresentation({ data }: { data: any }) {
  const { t } = useTranslation();
  return <div className="grid gap-4 lg:grid-cols-2"><ClientPortalSection title={t("clientHome.serviceAgreements")} empty={t("clientHome.noServiceAgreements")} count={data.agreements.length}><div className="divide-y divide-gray-100">{data.agreements.map((agreement: any) => <Link key={agreement._id} href={`/client/service-agreements/${agreement._id}`} className="touch-target block rounded-sm py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"><div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between"><div className="min-w-0"><p className="break-words font-medium text-gray-900">{agreement.title}</p><p className="mt-1 break-words text-sm text-gray-500">{agreement.providerName}</p></div><ServiceAgreementStatusBadge agreement={agreement} audience="client" /></div></Link>)}</div></ClientPortalSection><ClientPortalSection title={t("clientHome.proposals")} empty={t("clientHome.noProposals")} count={data.proposals.length}><div className="divide-y divide-gray-100">{data.proposals.map((proposal: any) => <article key={proposal._id} className="py-3 text-sm first:pt-0 last:pb-0"><h3 className="break-words font-medium text-gray-900">{proposal.title}</h3><p className="mt-1 text-gray-600">{t(getClientStatusTranslationKey("proposal", proposal.status))}</p>{(proposal.oneTimePriceCents != null || proposal.monthlyPriceCents != null) && <p className="mt-1 font-medium text-gray-900">{proposal.oneTimePriceCents != null ? formatClientMoney(proposal.oneTimePriceCents) : `${formatClientMoney(proposal.monthlyPriceCents)} ${t("clientDocuments.perMonth")}`}</p>}<p className="mt-2 break-words text-gray-500">{proposal.providerName}</p></article>)}</div></ClientPortalSection></div>;
}

export function ClientDocumentsPage() {
  const { t } = useTranslation(); const { clientUserId, sessionToken } = useClientAuth();
  const data = useQuery((api as any).queries.clientPortal.getClientDocuments, clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip");
  return <ClientPortalPage title={t("clientDocuments.title")} description={t("clientDocuments.description")} data={data}>{data && <ClientDocumentsPresentation data={data} />}</ClientPortalPage>;
}
