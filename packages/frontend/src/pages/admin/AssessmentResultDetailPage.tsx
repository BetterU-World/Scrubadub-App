import { useQuery } from "convex/react";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { OperationsAssessmentReport, type AssessmentReport } from "@/pages/public/OperationsAssessmentReport";
import type { AssessmentRoadmap } from "@/pages/public/OperationsAssessmentRoadmap";

export function AssessmentResultDetailPage() {
  const { t } = useTranslation();
  const { attemptId } = useParams<{ attemptId: string }>();
  const { user, sessionToken, isLoading } = useAuth();
  const canAccess = user?.isSuperadmin === true && Boolean(sessionToken);
  const result = useQuery(
    api.queries.assessmentAdmin.getAssessmentResultDetail,
    canAccess && attemptId
      ? { userId: user!._id, sessionToken, attemptId: attemptId as Id<"assessmentAttempts"> }
      : "skip"
  );

  if (isLoading || result === undefined) return <PageLoader />;
  if (!canAccess) return null;
  if (!result) {
    return <div>
      <PageHeader title={t("assessmentAdmin.resultUnavailable")} back={{ href: "/admin/assessments", label: t("assessmentAdmin.backToResults") }} />
      <div role="alert" className="card text-sm text-gray-600">{t("assessmentAdmin.resultUnavailableCopy")}</div>
    </div>;
  }

  const contact = result.summary.contact;
  return <div className="min-w-0">
    <PageHeader
      title={contact?.businessName || contact?.firstName || t("assessmentAdmin.anonymousResult")}
      description={t("assessmentAdmin.detailDescription")}
      back={{ href: "/admin/assessments", label: t("assessmentAdmin.backToResults") }}
    />

    <section aria-labelledby="assessment-contact-heading" className="card mb-8 print:hidden">
      <h2 id="assessment-contact-heading" className="font-semibold text-gray-900">{t("assessmentAdmin.contactAndFollowUp")}</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t("assessmentAdmin.business")} value={contact?.businessName || t("assessmentAdmin.notProvided")} />
        <Fact label={t("assessmentAdmin.name")} value={contact?.firstName || t("assessmentAdmin.notProvided")} />
        <Fact label={t("assessmentAdmin.email")} value={contact?.email || t("assessmentAdmin.notProvided")} />
        <Fact label={t("assessmentAdmin.scrubInterest")} value={contact ? t(`assessmentAdmin.interest.${contact.scrubInterest}`) : t("assessmentAdmin.notProvided")} />
        <Fact label={t("assessmentAdmin.deliveryStatus")} value={contact ? t(`assessmentAdmin.delivery.${contact.deliveryStatus}`) : t("assessmentAdmin.notProvided")} />
        <Fact label={t("assessmentAdmin.marketingConsent")} value={contact?.marketingConsent ? t("assessmentAdmin.yes") : t("assessmentAdmin.no")} />
        <Fact label={t("assessmentAdmin.branch")} value={t(`assessmentAdmin.${result.summary.branchType}`)} />
        <Fact label={t("assessmentAdmin.language")} value={result.summary.language.toUpperCase()} />
      </dl>
      <p className="mt-4 border-t border-gray-100 pt-4 text-xs leading-5 text-gray-500">{t("assessmentAdmin.privacyNote")}</p>
    </section>

    <OperationsAssessmentReport
      report={result.report as AssessmentReport}
      roadmap={result.roadmap as AssessmentRoadmap}
      showContinuity={false}
    />
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt><dd className="mt-1 break-words font-medium text-gray-900">{value}</dd></div>;
}
