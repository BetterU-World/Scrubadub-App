import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

type Reservation = Doc<"calendarReservations">;
const reasons: Record<string, string> = {
  overlapping_dates: "Stay dates overlap another imported event.",
  same_uid_other_feed: "The same provider UID appears in another feed.",
  absent_uid_same_feed: "Another UID is missing or canceled in this feed; the provider may have changed its identity.",
  incomplete_scan: "The bounded review scan is incomplete. Automation stays blocked; arrange manual review.",
};
export function CalendarReconciliationReview({ reservation, neighbors, feedRevision, canReview, sessionToken, userId }: {
  reservation: Reservation; neighbors: Reservation[]; feedRevision?: number; canReview: boolean;
  sessionToken: string; userId: Id<"users">;
}) {
  const decide = useMutation(api.mutations.calendarSync.reviewReservationIdentity);
  const acknowledge = useMutation(api.mutations.calendarSync.acknowledgeReservationDates);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ version?: string; text: string } | null>(null);
  const [candidateId, setCandidateId] = useState("");
  const identity = reservation.identityReview;
  const dates = reservation.dateReview;
  const current = reservation.status === "active" && feedRevision !== undefined && reservation.eventVersion?.startsWith(`${feedRevision}:`);
  const selected = identity?.candidateIds.find(id => id === candidateId) ?? identity?.candidateIds[0];
  const act = async (decision?: "distinct" | "duplicate") => {
    if (!canReview || !current || !reservation.eventVersion || feedRevision === undefined) return;
    setBusy(true); setMessage(null);
    try {
      const args = { sessionToken, userId, reservationId: reservation._id, expectedEventVersion: reservation.eventVersion, expectedFeedRevision: feedRevision };
      const result = decision
        ? await decide({ ...args, expectedRevision: identity!.revision, decision, ...(decision === "duplicate" ? { duplicateOf: selected } : {}) })
        : await acknowledge({ ...args, expectedRevision: dates!.revision });
      setMessage({ version: reservation.eventVersion, text: result === "stale"
        ? "Review evidence changed. Inspect the refreshed candidates and try again."
        : "Review submitted. Existing jobs were kept unchanged; the current review state is shown here." });
    } catch {
      setMessage({ version: reservation.eventVersion, text: "Could not save this review. Refresh and ask the property owner to review again." });
    } finally { setBusy(false); }
  };
  if (!identity && !dates) return null;
  return <div className="mt-2 space-y-2 text-xs break-words [overflow-wrap:anywhere]">
    {identity && <section aria-label="Reservation identity review" className="rounded border border-amber-300 bg-amber-50 p-3 space-y-2 text-amber-950">
      {identity.state === "pending" ? <>
        <p className="font-semibold">Possible duplicate or changed identity — owner review required</p>
        <p>These hints do not prove that two events are the same booking. No records will be merged and no new job can be created while this review is pending.</p>
        {identity.reasons.map(reason => <p key={reason}>{reasons[reason]}</p>)}
        <ul className="space-y-1">{identity.candidateIds.map(id => {
          const candidate = neighbors.find(row => row._id === id);
          return <li key={id}>{candidate ? `${candidate.checkIn} → ${candidate.checkOut} · ${candidate.summary || "Untitled event"} · feed ${String(candidate.connectionId).slice(-6)}` : `Reservation ${String(id).slice(-6)} — details unavailable`}
            {candidate?.linkedJobId ? " · existing cleaning job retained" : ""}</li>;
        })}</ul>
        {canReview && current ? <div className="space-y-2">
          <p>A separate-booking decision can permit future automation if guest classification and all other rules allow it. Suppression only blocks additional automation; it does not reconcile dates or modify existing jobs.</p>
          <button type="button" disabled={busy || identity.incomplete} onClick={() => act("distinct")}
            className="btn-secondary text-xs min-h-11 focus-visible:ring-2 focus-visible:ring-primary-600">Confirm this is a separate booking</button>
          {identity.candidateIds.length > 0 && <div className="flex flex-wrap gap-2 items-center">
            <select aria-label="Possible existing reservation" value={selected ?? ""} onChange={e => setCandidateId(e.target.value)} disabled={busy} className="input-field text-xs max-w-full">
              {identity.candidateIds.map(id => {
                const candidate = neighbors.find(row => row._id === id);
                return <option key={id} value={id}>{candidate ? `${candidate.checkIn} → ${candidate.checkOut}` : String(id).slice(-6)}</option>;
              })}
            </select>
            <button type="button" disabled={busy || !selected} onClick={() => act("duplicate")}
              className="btn-secondary text-xs min-h-11 focus-visible:ring-2 focus-visible:ring-primary-600">Same booking — suppress additional automation</button>
          </div>}
        </div> : <p>Only the owner can decide, using a current observation from an existing feed.</p>}
      </> : <>
        <p className="font-semibold">{identity.state === "duplicate" ? "Additional automation suppressed by owner" : "Owner marked this as a separate booking"}</p>
        <p>{identity.state === "duplicate" ? "Records and job links were not merged. Review the original booking, missing/date evidence and any existing work separately." : "Guest classification and all other job-creation checks still apply."}</p>
      </>}
    </section>}
    {dates && <section aria-label="Reservation date review" className="rounded border border-blue-300 bg-blue-50 p-3 space-y-1 text-blue-950">
      <p className="font-semibold">Arrival/departure changed — {dates.state === "pending" ? "owner review required" : "acknowledged; job review remains separate"}</p>
      <p>Previous: {dates.previousCheckIn} → {dates.previousCheckOut}</p>
      <p>Proposed by feed: {dates.proposedCheckIn} → {dates.proposedCheckOut}</p>
      <p>Reservation dates reflect the feed. No cleaning job was rescheduled, canceled, recreated or edited. Use View job for a separate authorized manual review.</p>
      {dates.state === "pending" && canReview && current && <button type="button" disabled={busy} onClick={() => act()}
        className="btn-secondary text-xs min-h-11 focus-visible:ring-2 focus-visible:ring-primary-600">Acknowledge date change; keep job unchanged</button>}
      {dates.state === "pending" && (!canReview || !current) && <p>Owner acknowledgement requires a current feed observation.</p>}
    </section>}
    {message?.version === reservation.eventVersion && <p role="status" aria-live="polite">{message?.text}</p>}
  </div>;
}
