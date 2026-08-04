import { Link, useParams } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useClientAuth } from "@/hooks/useClientAuth";
import { ClientPortalPage } from "@/components/client/ClientPortalPage";
import { ClientRequestDetailPresentation } from "@/components/client/ClientRequestPresentation";
import { useTranslation } from "react-i18next";

export function ClientRequestDetailPage() {
  const { clientUserId, sessionToken } = useClientAuth();
  const { t } = useTranslation();
  const params = useParams<{ requestId: string }>();
  const data = useQuery((api as any).queries.clientPortal.getClientRequestDetail, clientUserId && sessionToken && params.requestId ? { clientUserId, sessionToken, requestId: params.requestId } : "skip");
  const submitted = new URLSearchParams(window.location.search).get("submitted") === "1";
  return <ClientPortalPage title={t("clientRequests.detailTitle")} description={t("clientRequests.detailDescription")} data={data}>
    {submitted && data?.request && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"><p className="font-semibold">{t("clientRequests.confirmationTitle")}</p><p className="mt-1">{t("clientRequests.confirmationMessage")}</p></div>}
    {data?.request?.status === "declined" && data.request.clientFacingDecisionNote && <section className="rounded-xl border border-red-200 bg-red-50 p-4 sm:p-6"><h2 className="font-semibold text-red-900">{t("jobRequests.clientExplanation")}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-red-800">{data.request.clientFacingDecisionNote}</p></section>}
    {data?.request ? <ClientRequestDetailPresentation request={data.request} /> : data?.request === null ? <div className="card text-center"><p>{t("clientRequests.notFound")}</p><Link href="/client/requests" className="mt-3 inline-block font-medium text-primary-700">{t("clientRequests.backToRequests")}</Link></div> : null}
  </ClientPortalPage>;
}
