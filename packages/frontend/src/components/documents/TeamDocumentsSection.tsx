import { useQuery } from "convex/react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/LoadingSpinner";

export function TeamDocumentsSection() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const documents = useQuery((api as any).queries.companyOnboardingDocuments.listForOwner,
    user && sessionToken ? { userId: user._id, sessionToken } : "skip") as
    Array<{ documentKey: string; title: string; description?: string; storageId?: string | null;
      required: boolean; roleVisibility: "both" | "cleaner" | "maintenance"; status: "active" | "inactive"; updatedAt?: number | null }> | undefined;
  if (!documents) return <PageLoader />;
  const uploaded = documents.filter((document) => document.storageId).length;
  return <section className="min-w-0 space-y-4" aria-label={t("documentsHub.team")}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900">{t("documentsHub.team")}</h2>
        <p className="mt-1 text-sm text-gray-600">{t("documentsHub.teamDescription")}</p>
      </div>
      <Link href="/owner/settings/onboarding" className="btn-secondary w-full shrink-0 text-center text-sm sm:w-auto">{t("documentsHub.manageWorkerPdfs")}</Link>
    </div>
    {uploaded === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("documentsHub.noTeamPdfs")}</p>}
    {!documents.length ? <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">{t("documentsHub.teamEmpty")}</p>
      : <div className="grid min-w-0 gap-3 lg:grid-cols-2">{documents.map((document) => <article key={document.documentKey} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="break-words font-semibold text-gray-900">{document.title}</h3>
        {document.description && <p className="mt-1 break-words text-sm text-gray-600">{document.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-gray-100 px-2 py-1">{t(document.storageId ? "documentsHub.uploaded" : "documentsHub.missingPdf")}</span>
          <span className="rounded-full bg-gray-100 px-2 py-1">{t(document.required ? "documentsHub.required" : "documentsHub.optional")}</span>
          <span className="rounded-full bg-gray-100 px-2 py-1">{t(`documentsHub.audiences.${document.roleVisibility}`)}</span>
          <span className="rounded-full bg-gray-100 px-2 py-1">{t(document.status === "active" ? document.storageId ? "documentsHub.visibleToWorkers" : "documentsHub.visibleAfterUpload" : "documentsHub.hiddenFromWorkers")}</span>
        </div>
        {document.updatedAt && <p className="mt-2 text-xs text-gray-500">{t("documentsHub.dates.updated")}: {new Date(document.updatedAt).toLocaleDateString()}</p>}
      </article>)}</div>}
    <p className="text-xs text-gray-600">{t("documentsHub.teamMetadataNote")}</p>
  </section>;
}
