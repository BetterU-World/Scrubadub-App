import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { formatScheduleWindow } from "@/lib/jobSchedulePresentation";
export type ClientSchedulingEvent = {
  id: string; kind: "service_confirmed" | "service_rescheduled" | "service_cancelled"; occurredAt: number;
  requestId: string; timezone: string; locationName?: string; providerName?: string;
  before?: { scheduledDate: string; startTime?: string; durationMinutes: number };
  after: { scheduledDate: string; startTime?: string; durationMinutes: number };
};
export function ClientSchedulingEventDetails({ event }: { event: ClientSchedulingEvent }) {
  const { t, i18n } = useTranslation();
  const format = (window: ClientSchedulingEvent["after"]) => formatScheduleWindow(window, i18n.language, t("clientScheduling.timeUnknown"), t("clientScheduling.minutes"));
  return <div className="mt-2 min-w-0 space-y-1 break-words text-sm text-gray-700">
    {event.locationName && <p className="font-medium">{event.locationName}</p>}
    {event.before && <p>{t("clientScheduling.previous")}: {format(event.before)}</p>}
    <p>{t(event.kind === "service_cancelled" ? "clientScheduling.cancelledWindow" : "clientScheduling.updated")}: {format(event.after)}</p>
    <p className="text-xs">{t("clientScheduling.timezone", { timezone: event.timezone })}</p>
  </div>;
}
export function ClientSchedulingUpdates({ events }: { events: ClientSchedulingEvent[] }) {
  const { t } = useTranslation();
  if (!events.length) return null;
  return <section aria-labelledby="client-scheduling-updates" className="rounded-xl border border-primary-200 bg-white p-4 sm:p-6">
    <h2 id="client-scheduling-updates" className="text-lg font-semibold">{t("clientScheduling.title")}</h2>
    <ol className="mt-4 space-y-4">{events.map(event => <li key={event.id} className="min-w-0 border-b border-gray-100 pb-4 last:border-0 last:pb-0">
      <h3 className="break-words font-medium">{t("clientScheduling." + event.kind + ".label")}</h3>
      <p className="mt-1 break-words text-sm text-gray-600">{t("clientScheduling." + event.kind + ".description")}</p>
      {event.providerName && <p className="text-sm text-gray-600">{event.providerName}</p>}
      <ClientSchedulingEventDetails event={event} />
      <Link href={"/client/requests/" + event.requestId} className="touch-target mt-2 inline-flex rounded font-medium text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">{t("clientScheduling.viewRequest")}</Link>
    </li>)}</ol>
  </section>;
}
