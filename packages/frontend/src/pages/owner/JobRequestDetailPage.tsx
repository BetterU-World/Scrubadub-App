import { useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RequestScheduleConfirmation } from "@/components/owner/RequestScheduleConfirmation";
import { Clock3, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

const TYPES = [
  "standard",
  "deep_clean",
  "turnover",
  "move_in_out",
  "maintenance",
  "post_construction",
];
export function JobRequestDetailPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const { requestId } = useParams<{ requestId: string }>();
  const request = useQuery(
    (api as any).queries.clientRequests.getJobRequestDetail,
    user && sessionToken && requestId
      ? { userId: user._id, sessionToken, requestId }
      : "skip",
  );
  const decline = useMutation(
    (api as any).mutations.clientRequests.declineJobRequest,
  );
  const propose = useMutation(
    (api as any).mutations.clientRequestScheduleProposals.createOrReplace,
  );
  const withdraw = useMutation(
    (api as any).mutations.clientRequestScheduleProposals.withdraw,
  );
  const [showDecline, setShowDecline] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showProposal, setShowProposal] = useState(false);
  const [proposal, setProposal] = useState({
    proposedDate: "",
    proposedStartTime: "",
    durationMinutes: 120,
    jobType: "standard",
    clientNote: "",
  });
  if (request === undefined) return <PageLoader />;
  if (!request)
    return <div className="card text-center">{t("jobRequests.notFound")}</div>;
  const doDecline = async () => {
    setBusy(true);
    setError("");
    try {
      await decline({
        userId: user!._id,
        sessionToken,
        requestId: request._id,
        clientFacingDecisionNote: note || undefined,
      });
      setShowDecline(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-w-0">
      <PageHeader
        title={request.requesterName}
        description={t("jobRequests.detailDescription")}
        back={{ href: "/jobs/requests", label: t("jobRequests.backToQueue") }}
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <section className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="badge bg-primary-50 text-primary-800">
            {t(`jobRequests.statuses.${request.status}`)}
          </span>
          <span className="badge bg-primary-50 text-primary-800">
            {t("jobRequests.authenticatedSource")}
          </span>
        </div>
        <h2 className="break-words font-semibold">
          {request.relationshipName || request.requesterName}
        </h2>
        <p className="break-words text-sm">
          {[request.locationName, request.locationAddress]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-sm">{request.requestedService}</p>
        {request.notes && (
          <p className="whitespace-pre-wrap break-words text-sm text-gray-600">
            {request.notes}
          </p>
        )}
      </section>
      <section className="card mt-4">
        <h2 className="font-semibold">{t("jobRequests.preferredSchedule")}</h2>
        <p className="mt-2 text-sm">
          {request.requestedDate || "—"} ·{" "}
          {t(`clientRequests.timeWindows.${request.timeWindow}`, {
            defaultValue: request.timeWindow,
          })}
        </p>
        <p className="mt-2 text-sm text-amber-700">
          {t("jobRequests.preferenceNotice")}
        </p>
      </section>
      {request.status === "declined" ? (
        <section className="card mt-4 border-red-200">
          <h2 className="font-semibold text-red-800">
            {t("jobRequests.statuses.declined")}
          </h2>
        </section>
      ) : request.linkedJob ? (
        <section className="card mt-4">
          <h2 className="font-semibold">{t("jobRequests.finalSchedule")}</h2>
          <p className="mt-2 text-sm">
            {request.linkedJob.scheduledDate} · {request.linkedJob.startTime}
          </p>
          <Link
            href={`/jobs/${request.linkedJob._id}`}
            className="mt-3 inline-block font-medium text-primary-700"
          >
            {t("jobRequests.viewJob")}
          </Link>
        </section>
      ) : (
        <>
          <RequestScheduleConfirmation request={request} />
          {request.currentScheduleProposal && (
            <section className="card mt-4 border-blue-200">
              <h2 className="font-semibold text-blue-900">
                {t("jobRequests.awaitingClient")}
              </h2>
              <p className="mt-2 text-sm">
                {request.currentScheduleProposal.proposedDate} ·{" "}
                {request.currentScheduleProposal.proposedStartTime} ·{" "}
                {t("jobRequests.minutes", {
                  count: request.currentScheduleProposal.durationMinutes,
                })}
              </p>
              {request.currentScheduleProposal.clientNote && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                  {request.currentScheduleProposal.clientNote}
                </p>
              )}
              <button
                className="btn-secondary mt-3"
                type="button"
                onClick={async () => {
                  try {
                    await withdraw({
                      userId: user!._id,
                      sessionToken,
                      proposalId: request.currentScheduleProposal._id,
                    });
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                {t("jobRequests.withdrawProposal")}
              </button>
            </section>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              className="btn-secondary flex items-center justify-center gap-2"
              type="button"
              onClick={() => setShowProposal(true)}
            >
              <Clock3 className="h-4 w-4" />
              {request.currentScheduleProposal
                ? t("jobRequests.replaceProposal")
                : t("jobRequests.proposeAnotherTime")}
            </button>
            <button
              className="btn-danger flex items-center justify-center gap-2"
              type="button"
              onClick={() => setShowDecline(true)}
            >
              <XCircle className="h-4 w-4" />
              {t("jobRequests.decline")}
            </button>
          </div>
        </>
      )}
      {showProposal && (
        <form
          className="card mt-4 border-blue-200"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await propose({
                userId: user!._id,
                sessionToken,
                requestId: request._id,
                ...proposal,
              });
              setShowProposal(false);
            } catch (err: any) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="font-semibold">{t("jobRequests.proposedSchedule")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              {t("jobRequests.proposedDate")}
              <input
                required
                type="date"
                className="input-field mt-1"
                value={proposal.proposedDate}
                onChange={(e) =>
                  setProposal((p) => ({ ...p, proposedDate: e.target.value }))
                }
              />
            </label>
            <label className="text-sm font-medium">
              {t("jobRequests.proposedTime")}
              <input
                required
                type="time"
                className="input-field mt-1"
                value={proposal.proposedStartTime}
                onChange={(e) =>
                  setProposal((p) => ({
                    ...p,
                    proposedStartTime: e.target.value,
                  }))
                }
              />
            </label>
            <label className="text-sm font-medium">
              {t("jobRequests.duration")}
              <input
                required
                min={30}
                max={1440}
                step={15}
                type="number"
                className="input-field mt-1"
                value={proposal.durationMinutes}
                onChange={(e) =>
                  setProposal((p) => ({
                    ...p,
                    durationMinutes: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label className="text-sm font-medium">
              {t("jobRequests.jobType")}
              <select
                className="input-field mt-1"
                value={proposal.jobType}
                onChange={(e) =>
                  setProposal((p) => ({ ...p, jobType: e.target.value }))
                }
              >
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`jobRequests.jobTypes.${type}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block text-sm font-medium">
            {t("jobRequests.companyNote")}
            <textarea
              maxLength={500}
              rows={3}
              className="input-field mt-1"
              value={proposal.clientNote}
              onChange={(e) =>
                setProposal((p) => ({ ...p, clientNote: e.target.value }))
              }
            />
          </label>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowProposal(false)}
            >
              {t("common.cancel")}
            </button>
            <button disabled={busy} className="btn-primary" type="submit">
              {t("jobRequests.sendProposal")}
            </button>
          </div>
        </form>
      )}
      {showDecline && (
        <section className="card mt-4 border-red-200">
          <label className="text-sm font-medium">
            {t("jobRequests.clientExplanation")}
            <textarea
              maxLength={500}
              rows={3}
              className="input-field mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowDecline(false)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => setConfirmDecline(true)}
            >
              {t("jobRequests.decline")}
            </button>
          </div>
        </section>
      )}
      <details className="card mt-4">
        <summary className="cursor-pointer font-semibold text-primary-700">
          {t("jobRequests.advancedTools")}
        </summary>
        <Link
          href={`/requests/${request._id}?advanced=1`}
          className="mt-3 inline-block font-medium text-primary-700"
        >
          {t("jobRequests.openAdvanced")}
        </Link>
      </details>
      <ConfirmDialog
        open={confirmDecline}
        onOpenChange={setConfirmDecline}
        title={t("jobRequests.declineTitle")}
        description={t("jobRequests.declineConfirm")}
        confirmLabel={t("jobRequests.declineConfirmAction")}
        confirmVariant="danger"
        onConfirm={doDecline}
        loading={busy}
      />
    </div>
  );
}
