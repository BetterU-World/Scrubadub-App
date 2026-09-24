import { Link } from "wouter";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { ClientPortalPage, ClientPortalSection, formatClientMoney } from "@/components/client/ClientPortalPage";
import { ServiceAgreementStatusBadge } from "@/components/ui/ServiceAgreementStatusBadge";
import { useClientAuth } from "@/hooks/useClientAuth";
import { getClientStatusTranslationKey } from "@/lib/clientPresentation";
import { useState } from "react";
import { resourceSiteUrl } from "../../components/documents/resourceModel";
import { fetchResourceBlob } from "../../components/documents/resourceTransfer";

type ClientResource = { resourceId: string; title: string; description?: string; providerName: string; mimeType: string; originalFileName: string; updatedAt: number };

function ClientResourceCards({ rows, sessionToken }: { rows: ClientResource[]; sessionToken: string }) {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const getFile = async (row: ClientResource, download: boolean) => {
    const tab = download ? null : window.open("", "_blank");
    setError("");
    try {
      const site = resourceSiteUrl(import.meta.env.VITE_CONVEX_URL, import.meta.env.VITE_CONVEX_SITE_URL);
      setProgress(t("resourcesHub.preparing"));
      const blob = await fetchResourceBlob({ site, route: "client", resourceId: row.resourceId, sessionToken,
        onProgress: fraction => setProgress(t("resourcesHub.downloadingProgress", { percent: Math.round(fraction * 100) })) });
      const objectUrl = URL.createObjectURL(blob);
      if (download) {
        const link = document.createElement("a");
        link.href = objectUrl; link.download = row.originalFileName;
        document.body.append(link); link.click(); link.remove();
      } else if (tab) tab.location.href = objectUrl;
      else throw new Error();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch { tab?.close(); setError(t("clientResources.openFailed")); }
    finally { setProgress(""); }
  };
  return <section className="space-y-3" aria-label={t("clientResources.portalTitle")}>
    <h2 className="text-lg font-semibold text-gray-900">{t("clientResources.portalTitle")}</h2>
    <p className="text-sm text-gray-600">{t("clientResources.portalDescription")}</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {progress && <p role="status" className="text-sm text-gray-600">{progress}</p>}
    <div className="grid gap-4 lg:grid-cols-2">{rows.map((row) => <article key={row.resourceId} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="break-words font-semibold text-gray-900">{row.title}</h3>
      {row.description && <p className="mt-1 break-words text-sm text-gray-600">{row.description}</p>}
      <p className="mt-2 text-sm text-gray-500">{row.providerName}</p>
      <p className="mt-1 text-xs text-gray-500">{row.mimeType} · {t("resourcesHub.updated", { date: new Date(row.updatedAt).toLocaleDateString() })}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => void getFile(row, false)}>{t("resourcesHub.open")}</button>
        <button type="button" className="btn-secondary" onClick={() => void getFile(row, true)}>{t("resourcesHub.download")}</button></div>
    </article>)}</div>
  </section>;
}

export function ClientDocumentsPresentation({ data }: { data: any }) {
  const { t } = useTranslation();
  return <div className="grid gap-4 lg:grid-cols-2">
    <ClientPortalSection title={t("clientHome.serviceAgreements")} empty={t("clientHome.noServiceAgreements")} count={data.agreements.length}>
      <div className="divide-y divide-gray-100">{data.agreements.map((agreement: any) => <Link key={agreement._id} href={`/client/service-agreements/${agreement._id}`} className="touch-target block rounded-sm py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"><div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between"><div className="min-w-0"><p className="break-words font-medium text-gray-900">{agreement.title}</p><p className="mt-1 break-words text-sm text-gray-500">{agreement.providerName}</p></div><ServiceAgreementStatusBadge agreement={agreement} audience="client" /></div></Link>)}</div>
    </ClientPortalSection>
    <ClientPortalSection title={t("clientHome.proposals")} empty={t("clientHome.noProposals")} count={data.proposals.length}>
      <div className="divide-y divide-gray-100">{data.proposals.map((proposal: any) => {
        const monthlyAmount = proposal.monthlyTotalCents ?? proposal.monthlyPriceCents;
        const oneTimeAmount = proposal.oneTimeTotalCents ?? proposal.oneTimePriceCents;
        const baseLabel = proposal.basePriceOnly ? ` (${t("clientDocuments.basePrice")})` : "";
        return <article key={proposal._id} className="py-3 text-sm first:pt-0 last:pb-0">
          <h3 className="break-words font-medium text-gray-900">{proposal.title}</h3>
          <p className="mt-1 text-gray-600">{t(getClientStatusTranslationKey("proposal", proposal.status))}</p>
          {monthlyAmount != null && <p className="mt-1 font-medium text-gray-900">{formatClientMoney(monthlyAmount)} {t("clientDocuments.perMonth")}{baseLabel}</p>}
          {oneTimeAmount != null && <p className="mt-1 font-medium text-gray-900">{formatClientMoney(oneTimeAmount)} {t("proposals.oneTime")}{baseLabel}</p>}
          <p className="mt-2 break-words text-gray-500">{proposal.providerName}</p>
        </article>;
      })}</div>
    </ClientPortalSection>
  </div>;
}

export function ClientDocumentsPage() {
  const { t } = useTranslation(); const { clientUserId, sessionToken } = useClientAuth();
  const data = useQuery((api as any).queries.clientPortal.getClientDocuments, clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip");
  const resources = useQuery((api as any).queries.clientResources.listVisible, clientUserId && sessionToken ? { sessionToken } : "skip") as { rows: ClientResource[]; limited: boolean } | undefined;
  const ready = data && resources ? data : undefined;
  const hasTransactions = Boolean(data?.agreements?.length || data?.proposals?.length);
  return <ClientPortalPage title={t("clientDocuments.title")} description={t("clientDocuments.description")} data={ready}>
    {ready && <div className="space-y-6">
      {hasTransactions && <ClientDocumentsPresentation data={data} />}
      {resources!.rows.length > 0 && sessionToken && <ClientResourceCards rows={resources!.rows} sessionToken={sessionToken} />}
      {resources!.limited && <p className="text-xs text-gray-500">{t("clientResources.limited")}</p>}
      {!hasTransactions && resources!.rows.length === 0 && <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">{t("clientResources.portalEmpty")}</p>}
    </div>}
  </ClientPortalPage>;
}
