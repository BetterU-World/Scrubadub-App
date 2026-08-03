import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { ClientPortalPage, ClientPortalSection, formatClientDate } from "@/components/client/ClientPortalPage";
import { useClientAuth } from "@/hooks/useClientAuth";
import { getClientStatusTranslationKey } from "@/lib/clientPresentation";

export function ClientServicesPresentation({ data }: { data: any }) {
  const { t } = useTranslation();
  const list = (items: any[]) => <div className="divide-y divide-gray-100">{items.map((job) => <article key={job._id} className="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"><div className="min-w-0"><h3 className="break-words font-medium text-gray-900">{t(`jobTypes.${job.type}`, { defaultValue: String(job.type).replace(/_/g, " ") })}</h3>{job.locationName && <p className="mt-1 break-words text-sm text-gray-600">{job.locationName}</p>}{job.locationAddress && <p className="break-words text-sm text-gray-500">{job.locationAddress}</p>}<p className="mt-2 break-words text-sm text-gray-500">{job.providerName}</p></div><div className="sm:text-right"><p className="font-medium text-gray-900">{formatClientDate(job.scheduledDate, t("clientHome.notSet"))}</p><p className="text-sm text-gray-600">{job.startTime || t("clientHome.timeToBeConfirmed")}</p><p className="mt-1 text-sm font-medium text-primary-700">{t(getClientStatusTranslationKey("job", job.status))}</p></div></article>)}</div>;
  return <div className="space-y-4"><ClientPortalSection title={t("clientServices.current")} empty={t("clientServices.noCurrent")} count={data.current.length}>{list(data.current)}</ClientPortalSection><ClientPortalSection title={t("clientServices.upcoming")} empty={t("clientServices.noUpcoming")} count={data.upcoming.length}>{list(data.upcoming)}</ClientPortalSection><ClientPortalSection title={t("clientServices.recent")} empty={t("clientServices.noRecent")} count={data.recent.length}>{list(data.recent)}</ClientPortalSection></div>;
}

export function ClientServicesPage() {
  const { t } = useTranslation();
  const { clientUserId, sessionToken } = useClientAuth();
  const data = useQuery((api as any).queries.clientPortal.getClientServices, clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip");
  return <ClientPortalPage title={t("clientServices.title")} description={t("clientServices.description")} data={data}>{data && <ClientServicesPresentation data={data} />}</ClientPortalPage>;
}
