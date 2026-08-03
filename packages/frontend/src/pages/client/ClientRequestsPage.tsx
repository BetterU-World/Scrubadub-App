import { Link } from "wouter";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { ClientPortalPage } from "@/components/client/ClientPortalPage";
import { ClientRequestsPresentation } from "@/components/client/ClientRequestPresentation";
import { useClientAuth } from "@/hooks/useClientAuth";

export function ClientRequestsPage() {
  const { t } = useTranslation(); const { clientUserId, sessionToken } = useClientAuth();
  const data = useQuery((api as any).queries.clientPortal.listClientRequests, clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip");
  return <ClientPortalPage title={t("clientRequests.title")} description={t("clientRequests.description")} data={data}><div className="flex justify-end"><Link href="/client/requests/new" className="btn-primary touch-target">{t("clientRequests.requestService")}</Link></div>{data && <ClientRequestsPresentation data={data} />}</ClientPortalPage>;
}
