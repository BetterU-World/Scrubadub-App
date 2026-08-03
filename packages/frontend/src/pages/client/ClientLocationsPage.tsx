import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { ClientPortalPage, ClientPortalSection } from "../../components/client/ClientPortalPage";
import { useClientAuth } from "../../hooks/useClientAuth";

export function ClientLocationsPresentation({ data }: { data: any }) {
  const { t } = useTranslation();
  const cards = (items: any[], commercial = false) => <div className="grid gap-3 sm:grid-cols-2">{items.map((item) => { const status = commercial ? item.status : item.active ? "active" : "inactive"; return <article key={item._id} className="min-w-0 rounded-lg border border-gray-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="break-words font-medium text-gray-900">{item.name}</h3><span className="badge bg-gray-100 text-gray-700">{t(`clientLocations.statuses.${status}`, { defaultValue: status })}</span></div><p className="mt-2 break-words text-sm text-gray-600">{item.address || t("clientHome.notSet")}</p><p className="mt-2 break-words text-sm text-gray-500">{item.providerName}</p></article>; })}</div>;
  return <div className="space-y-4"><ClientPortalSection title={t("clientLocations.residential")} empty={t("clientLocations.noResidential")} count={data.properties.length}>{cards(data.properties)}</ClientPortalSection><ClientPortalSection title={t("clientLocations.commercial")} empty={t("clientLocations.noCommercial")} count={data.commercialAccounts.length}>{cards(data.commercialAccounts, true)}</ClientPortalSection></div>;
}

export function ClientLocationsPage() { const { t } = useTranslation(); const { clientUserId, sessionToken } = useClientAuth(); const data = useQuery((api as any).queries.clientPortal.getClientLocations, clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip"); return <ClientPortalPage title={t("clientLocations.title")} description={t("clientLocations.description")} data={data}>{data && <ClientLocationsPresentation data={data} />}</ClientPortalPage>; }
