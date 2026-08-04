import { useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";

const serviceTypes: Record<string, string> = {
  "Standard Clean": "standard",
  "Deep Clean": "deep_clean",
  Turnover: "turnover",
  "Move In/Out": "move_in_out",
  Maintenance: "maintenance",
};

export function RequestScheduleConfirmation({ request }: { request: any }) {
  const { t } = useTranslation();
  const { user, sessionToken } = useAuth();
  const confirmSchedule = useMutation(
    (api as any).mutations.jobs.confirmClientRequestSchedule,
  );
  const [date, setDate] = useState(request.requestedDate ?? "");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("120");
  const [type, setType] = useState(
    serviceTypes[request.requestedService] ?? "standard",
  );
  const [note, setNote] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState(request.scheduledJob?._id);
  const allowed =
    user?.role === "owner" ||
    (user?.role === "manager" && user.canManageSchedule);
  const eligible =
    request.source === "authenticated_client" &&
    request.clientRelationship?.status === "active" &&
    !["declined", "archived"].includes(request.status) &&
    (request.propertyId || request.commercialAccountId) &&
    serviceTypes[request.requestedService];
  if (!allowed || (!eligible && !request.scheduledJob)) return null;
  if (request.scheduledJob || jobId)
    return (
      <section className="card mt-4" aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className="font-semibold text-gray-900">
          {t("requests.scheduling.title")}
        </h2>
        <p className="mt-2 text-sm text-green-700">
          {t("requests.scheduling.scheduled")}
        </p>
        <p className="mt-1 text-sm text-gray-700">
          {request.scheduledJob?.scheduledDate ?? date} ·{" "}
          {request.scheduledJob?.startTime ?? time}
        </p>
        <Link
          href={`/jobs/${request.scheduledJob?._id ?? jobId}`}
          className="mt-3 inline-block font-medium text-primary-700"
        >
          {t("requests.scheduling.viewJob")}
        </Link>
      </section>
    );
  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const result = await confirmSchedule({
        userId: user!._id,
        sessionToken,
        requestId: request._id,
        scheduledDate: date,
        startTime: time,
        durationMinutes: Number(duration),
        type,
        clientSchedulingNote: note || undefined,
        idempotencyKey: idempotencyKey.current,
      });
      setJobId(result.jobId);
      setConfirming(false);
    } catch (e: any) {
      const message = e.message || "";
      setError(
        message.includes("relationship")
          ? t("requests.scheduling.errors.relationship")
          : message.includes("location")
            ? t("requests.scheduling.errors.location")
            : message.includes("past") || message.includes("schedule")
              ? t("requests.scheduling.errors.schedule")
              : t("requests.scheduling.errors.generic"),
      );
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section className="card mt-4" aria-labelledby="schedule-heading">
      <h2 id="schedule-heading" className="font-semibold text-gray-900">
        {t("requests.scheduling.title")}
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        {t("requests.scheduling.description")}
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-gray-500">
            {t("requests.scheduling.requestedDate")}
          </dt>
          <dd className="break-words text-sm">
            {request.requestedDate || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">
            {t("requests.scheduling.requestedTime")}
          </dt>
          <dd className="break-words text-sm">{request.timeWindow || "—"}</dd>
        </div>
      </dl>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          {t("requests.scheduling.finalDate")} *
          <input
            required
            type="date"
            className="input-field mt-1 min-w-0"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {t("requests.scheduling.finalTime")} *
          <input
            required
            type="time"
            className="input-field mt-1 min-w-0"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {t("requests.scheduling.duration")}
          <input
            type="number"
            min="30"
            max="1440"
            step="15"
            className="input-field mt-1"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          {t("requests.scheduling.serviceType")}
          <select
            className="input-field mt-1"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {Object.entries(serviceTypes).map(([label, value]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          {t("requests.scheduling.note")}
          <textarea
            maxLength={500}
            rows={3}
            className="input-field mt-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="mt-1 block text-xs text-gray-500">
            {note.length}/500
          </span>
        </label>
      </div>
      <button
        type="button"
        disabled={!date || !time || submitting}
        onClick={() => setConfirming(true)}
        className="btn-primary mt-4 w-full sm:w-auto"
      >
        {t("jobRequestsActions.acceptAndSchedule")}
      </button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("requests.scheduling.confirmTitle")}
        description={t("requests.scheduling.confirmDescription", {
          date,
          time,
        })}
        confirmLabel={t("requests.scheduling.confirmAction")}
        onConfirm={submit}
        loading={submitting}
      />
    </section>
  );
}
