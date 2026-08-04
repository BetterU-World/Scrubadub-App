import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { useClientAuth } from "@/hooks/useClientAuth";
import { ClientPortalPage } from "@/components/client/ClientPortalPage";
import { ClientRequestDetailPresentation } from "@/components/client/ClientRequestPresentation";
import { useTranslation } from "react-i18next";

export function ClientRequestDetailPage() {
  const { clientUserId, sessionToken } = useClientAuth();
  const { t } = useTranslation();
  const params = useParams<{ requestId: string }>();
  const data = useQuery(
    (api as any).queries.clientPortal.getClientRequestDetail,
    clientUserId && sessionToken && params.requestId
      ? { clientUserId, sessionToken, requestId: params.requestId }
      : "skip",
  );
  const submitted =
    new URLSearchParams(window.location.search).get("submitted") === "1";
  const accept = useMutation(
    (api as any).mutations.clientRequestScheduleProposals.accept,
  );
  const decline = useMutation(
    (api as any).mutations.clientRequestScheduleProposals.decline,
  );
  const [confirm, setConfirm] = useState<"accept" | "decline" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const respond = async () => {
    if (!confirm || !data?.request?.currentScheduleProposal) return;
    setBusy(true);
    setError("");
    try {
      await (confirm === "accept" ? accept : decline)({
        clientUserId: clientUserId!,
        sessionToken,
        proposalId: data.request.currentScheduleProposal._id,
      });
      setConfirm(null);
    } catch (e: any) {
      setError(e.message || t("clientRequests.proposalUnavailable"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ClientPortalPage
      title={t("clientRequests.detailTitle")}
      description={t("clientRequests.detailDescription")}
      data={data}
    >
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {submitted && data?.request && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          <p className="font-semibold">
            {t("clientRequests.confirmationTitle")}
          </p>
          <p className="mt-1">{t("clientRequests.confirmationMessage")}</p>
        </div>
      )}
      {data?.request?.status === "declined" &&
        data.request.clientFacingDecisionNote && (
          <section className="rounded-xl border border-red-200 bg-red-50 p-4 sm:p-6">
            <h2 className="font-semibold text-red-900">
              {t("jobRequests.clientExplanation")}
            </h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-red-800">
              {data.request.clientFacingDecisionNote}
            </p>
          </section>
        )}
      {data?.request?.currentScheduleProposal && (
        <section
          className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4 shadow-sm sm:p-6"
          aria-labelledby="proposed-schedule"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            {t("clientRequests.newTimeProposed")}
          </p>
          <h2 id="proposed-schedule" className="mt-1 text-xl font-semibold">
            {t("clientRequests.proposedSchedule")}
          </h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-500">
                {t("clientRequests.finalDate")}
              </dt>
              <dd>{data.request.currentScheduleProposal.proposedDate}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">
                {t("clientRequests.finalTime")}
              </dt>
              <dd>{data.request.currentScheduleProposal.proposedStartTime}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">
                {t("clientRequests.duration")}
              </dt>
              <dd>
                {t("jobRequests.minutes", {
                  count: data.request.currentScheduleProposal.durationMinutes,
                })}
              </dd>
            </div>
          </dl>
          {data.request.currentScheduleProposal.clientNote && (
            <p className="mt-4 whitespace-pre-wrap break-words text-sm">
              {data.request.currentScheduleProposal.clientNote}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => setConfirm("accept")}
            >
              {t("clientRequests.acceptProposedTime")}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirm("decline")}
            >
              {t("clientRequests.declineProposedTime")}
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-600">
            {t("clientRequests.declineDoesNotCancel")}
          </p>
        </section>
      )}
      {confirm && (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="proposal-confirm-title"
          className="card border-primary-200"
        >
          <h2 id="proposal-confirm-title" className="font-semibold">
            {confirm === "accept"
              ? t("clientRequests.acceptConfirmation")
              : t("clientRequests.declineConfirmation")}
          </h2>
          <p className="mt-2 text-sm">
            {confirm === "accept"
              ? t("clientRequests.acceptConfirmationBody")
              : t("clientRequests.declineConfirmationBody")}
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
            <button
              className="btn-secondary"
              type="button"
              onClick={() => setConfirm(null)}
            >
              {t("common.cancel")}
            </button>
            <button
              className={confirm === "accept" ? "btn-primary" : "btn-danger"}
              disabled={busy}
              type="button"
              onClick={respond}
            >
              {t("common.confirm")}
            </button>
          </div>
        </section>
      )}
      {data?.request ? (
        <ClientRequestDetailPresentation request={data.request} />
      ) : data?.request === null ? (
        <div className="card text-center">
          <p>{t("clientRequests.notFound")}</p>
          <Link
            href="/client/requests"
            className="mt-3 inline-block font-medium text-primary-700"
          >
            {t("clientRequests.backToRequests")}
          </Link>
        </div>
      ) : null}
    </ClientPortalPage>
  );
}
