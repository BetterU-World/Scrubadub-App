import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { useClientAuth } from "@/hooks/useClientAuth";
import { useTranslation } from "react-i18next";
import { CheckCircle, XCircle } from "lucide-react";
import { ClientPortalShell } from "@/components/client/ClientPortalShell";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ServiceAgreementStatusBadge } from "@/components/ui/ServiceAgreementStatusBadge";
import { AgreementContentView } from "@/components/AgreementContentView";
import { PageBack } from "@/components/ui/PageBack";
import { AsyncButton } from "@/components/ui/AsyncButton";

export function ClientServiceAgreementPage() {
  const { t } = useTranslation();
  const params = useParams<{ agreementId: string }>();
  const { clientUserId, sessionToken, isLoading, signOut } = useClientAuth();
  const agreementId = params.agreementId as Id<"serviceAgreements"> | undefined;
  const agreement = useQuery(
    (api as any).queries.serviceAgreements.getForClient,
    clientUserId && sessionToken && agreementId ? { clientUserId, sessionToken, agreementId } : "skip"
  );
  const acceptAgreement = useMutation((api as any).mutations.serviceAgreements.clientAccept);
  const declineAgreement = useMutation((api as any).mutations.serviceAgreements.clientDecline);
  const [note, setNote] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [loadingAction, setLoadingAction] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");

  if (isLoading || (clientUserId && agreement === undefined)) return <PageLoader />;

  if (!clientUserId) {
    const next = encodeURIComponent(`/client/service-agreements/${agreementId ?? ""}`);
    return (
      <ClientPortalShell contentClassName="max-w-3xl">
        <div className="card mx-auto max-w-md text-center">
          <h1 className="mb-3 text-xl font-semibold text-gray-900">{t("clientHome.signInRequired")}</h1>
          <Link href={`/client/login?next=${next}`} className="btn-primary inline-block">
            {t("clientAuth.signIn")}
          </Link>
        </div>
      </ClientPortalShell>
    );
  }

  if (!agreement || agreement.unavailable) {
    return (
      <ClientPortalShell onSignOut={signOut} contentClassName="max-w-3xl">
        <PageBack href="/client/home" label={t("navigation.backToClientHome")} className="mb-4" />
        <div className="card py-12 text-center">
          <h1 className="text-xl font-semibold text-gray-900">{agreement?.unavailable ? t("clientAgreements.updatedUnavailable") : t("clientAgreements.notFound")}</h1>
        </div>
      </ClientPortalShell>
    );
  }

  const canRespond = agreement.status === "sent";
  const handleAccept = async () => {
    setLoadingAction("accept");
    setError("");
    try {
      await acceptAgreement({ clientUserId, sessionToken, agreementId: agreement._id, issueId: agreement.issueId ?? undefined });
    } catch (err: any) {
      setError(err.message || t("clientAgreements.actionFailed"));
    } finally {
      setLoadingAction(null);
    }
  };
  const handleDecline = async () => {
    setLoadingAction("decline");
    setError("");
    try {
      await declineAgreement({
        clientUserId,
        sessionToken,
        agreementId: agreement._id,
        issueId: agreement.issueId ?? undefined,
        note: note.trim() || undefined,
      });
      setConfirmDecline(false);
      setShowDecline(false);
    } catch (err: any) {
      setError(err.message || t("clientAgreements.actionFailed"));
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <ClientPortalShell clientName={agreement.clientName} onSignOut={signOut} contentClassName="max-w-3xl">
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <PageBack href="/client/home" label={t("navigation.backToClientHome")} />
        <section className="card space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="break-words text-xs font-semibold uppercase text-primary-700">
                {agreement.companyName}
              </p>
              <h1 className="mt-2 break-words text-2xl font-semibold text-gray-900">{agreement.title}</h1>
              <p className="mt-1 text-sm text-gray-500">{t("guidance.client.agreementReview")}</p>
            </div>
            <ServiceAgreementStatusBadge agreement={agreement} audience="client" />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{t("clientAgreements.offlineSigningTitle")}</p>
            <p className="mt-1">{t("clientAgreements.offlineSigningMessage")}</p>
            {agreement.companyEmail && (
              <p className="mt-2">
                {t("clientAgreements.returnByEmail", { email: agreement.companyEmail })}
              </p>
            )}
          </div>

          {agreement.externalSignedReceiptWithoutIssue && (
            <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{t("clientAgreements.externalUnlinked")}</p>
          )}

          <AgreementContentView content={agreement} audience="client" />
        </section>

        <section className="card space-y-4">
          {agreement.status === "signed" && (
            <Result
              icon={<CheckCircle className="h-6 w-6 text-green-600" />}
              title={agreement.signedAt ? t("clientAgreements.signedReceived") : t("clientAgreements.acknowledged")}
              message={agreement.signedAt ? t("clientAgreements.signedReceivedMessage") : t("clientAgreements.acknowledgedMessage")}
            />
          )}
          {agreement.status === "cancelled" && agreement.declinedAt && (
            <Result
              icon={<XCircle className="h-6 w-6 text-red-600" />}
              title={t("clientAgreements.declined")}
              message={agreement.clientResponseNote || t("clientAgreements.declinedMessage")}
            />
          )}
          {agreement.status === "cancelled" && !agreement.declinedAt && (
            <Result
              icon={<XCircle className="h-6 w-6 text-gray-500" />}
              title={t("clientAgreements.cancelled")}
              message={t("clientAgreements.cancelledMessage")}
            />
          )}
          {canRespond && (
            <>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <AsyncButton
                  type="button"
                  pending={loadingAction === "accept"}
                  pendingLabel={t("common.acknowledging")}
                  disabled={loadingAction !== null && loadingAction !== "accept"}
                  onClick={handleAccept}
                  className="btn-primary touch-target flex flex-1 items-center justify-center gap-2"
                >
                  <CheckCircle aria-hidden="true" className="h-4 w-4" />
                  {t("clientAgreements.acknowledge")}
                </AsyncButton>
                <button
                  type="button"
                  disabled={loadingAction !== null}
                  onClick={() => setShowDecline((current) => !current)}
                  className="btn-secondary touch-target flex items-center justify-center gap-2 sm:flex-none"
                  aria-expanded={showDecline}
                  aria-controls="decline-agreement-panel"
                >
                  <XCircle className="h-4 w-4" />
                  {t("clientAgreements.decline")}
                </button>
              </div>
              {showDecline && (
                <div id="decline-agreement-panel" className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <label htmlFor="decline-note" className="block text-sm font-medium text-gray-700">
                      {t("clientAgreements.declineNote")}
                    </label>
                    <textarea
                      id="decline-note"
                      className="input-field mt-1"
                      rows={3}
                      maxLength={1000}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    <button type="button" className="btn-secondary touch-target" onClick={() => setShowDecline(false)}>
                      {t("common.cancel")}
                    </button>
                    <button type="button" className="btn-secondary touch-target" onClick={() => setConfirmDecline(true)}>
                      {t("clientAgreements.continueDecline")}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>
      <ConfirmDialog
        open={confirmDecline}
        onOpenChange={setConfirmDecline}
        title={t("clientAgreements.confirmDeclineTitle")}
        description={t("clientAgreements.confirmDeclineDescription")}
        confirmLabel={t("clientAgreements.confirmDecline")}
        confirmVariant="danger"
        onConfirm={handleDecline}
        loading={loadingAction === "decline"}
      />
    </ClientPortalShell>
  );
}

function Result({ icon, title, message }: { icon: ReactNode; title: string; message: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
  );
}
