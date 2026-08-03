import { Link, useParams } from "wouter";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { ClientPortalPage } from "@/components/client/ClientPortalPage";
import { ClientRequestDetailPresentation } from "@/components/client/ClientRequestPresentation";
import { useClientAuth } from "@/hooks/useClientAuth";

export function ClientRequestDetailPage() {
  const { t } = useTranslation(); const params = useParams<{ requestId: string }>(); const { clientUserId, sessionToken } = useClientAuth();
  const data = useQuery((api as any).queries.clientPortal.getClientRequestDetail, clientUserId && sessionToken && params.requestId ? { clientUserId, sessionToken, requestId: params.requestId } : "skip");
  const submitted = new URLSearchParams(window.location.search).get("submitted") === "1";
  return <ClientPortalPage title={t("clientRequests.detailTitle")} description={t("clientRequests.detailDescription")} data={data}>{submitted && data?.request && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"><p className="font-semibold">{t("clientRequests.confirmationTitle")}</p><p className="mt-1">{t("clientRequests.confirmationMessage")}</p></div>}{data?.request ? <ClientRequestDetailPresentation request={data.request} /> : data?.request === null ? <div className="card text-center"><p>{t("clientRequests.notFound")}</p><Link href="/client/requests" className="mt-3 inline-block font-medium text-primary-700">{t("clientRequests.backToRequests")}</Link></div> : null}</ClientPortalPage>;
}
