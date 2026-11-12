import { api } from "../../_generated/api";

/** Existing job-focused fixtures represent owner-verified separate bookings.
 * Exercise explicit identity/date review before guest confirmation; do not use
 * this helper in ambiguity tests, which must assert that automation stays held.
 */
export async function confirmGuestForTest(t: any, reservationId: any, sessionToken: string) {
  const load = () => t.run(async (ctx: any) => {
    const reservation = await ctx.db.get(reservationId);
    return { reservation, connection: await ctx.db.get(reservation.connectionId) };
  });
  let { reservation, connection } = await load();
  if (reservation.identityReview?.state === "pending") {
    for (let retry = 0; retry < 2; retry++) {
      const result = await t.mutation(api.mutations.calendarSync.reviewReservationIdentity, {
        sessionToken, reservationId, expectedEventVersion: reservation.eventVersion,
        expectedFeedRevision: connection.feedRevision ?? 0, expectedRevision: reservation.identityReview.revision, decision: "distinct",
      });
      ({ reservation, connection } = await load());
      if (result !== "stale") break;
    }
  }
  if (reservation.dateReview?.state === "pending") {
    await t.mutation(api.mutations.calendarSync.acknowledgeReservationDates, {
      sessionToken, reservationId, expectedEventVersion: reservation.eventVersion,
      expectedFeedRevision: connection.feedRevision ?? 0, expectedRevision: reservation.dateReview.revision,
    });
    ({ reservation, connection } = await load());
  }
  return t.mutation(api.mutations.calendarSync.confirmEventClassification, {
    sessionToken, reservationId, kind: "guest_reservation", expectedEventVersion: reservation.eventVersion,
    expectedRevision: reservation.classification?.revision ?? 0,
    expectedFeedRevision: connection.feedRevision ?? 0, expectedMissingEpisode: reservation.missing?.episodeId,
  });
}

export const reservationEvent = (uid = "reservation-one") => [
  "BEGIN:VEVENT", `UID:${uid}`, "DTSTART;VALUE=DATE:20261026",
  "DTEND;VALUE=DATE:20261027", "SUMMARY:Reserved", "END:VEVENT",
].join("\r\n");
export const calendar = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR`;
export const normalSnapshot = calendar(reservationEvent());
export const cancelledEvent = (uid = "reservation-one") => `BEGIN:VEVENT\r\nUID:${uid}\r\nSTATUS:CANCELLED\r\nEND:VEVENT`;

export const unsafeSnapshots = [
  { name: "HTTP 200 HTML", content: "<html>temporarily unavailable</html>", status: "invalid" },
  { name: "missing VCALENDAR envelope", content: reservationEvent(), status: "invalid" },
  { name: "missing calendar end", content: normalSnapshot.replace("END:VCALENDAR", ""), status: "invalid" },
  { name: "mismatched component end", content: normalSnapshot.replace("END:VEVENT", "END:VTODO"), status: "invalid" },
  { name: "malformed content line", content: normalSnapshot.replace("SUMMARY:Reserved", "not a content line"), status: "invalid" },
  { name: "nested calendar", content: calendar(normalSnapshot), status: "invalid" },
  { name: "missing DTSTART", content: normalSnapshot.replace("DTSTART;VALUE=DATE:20261026\r\n", ""), status: "degraded" },
  { name: "missing DTEND", content: normalSnapshot.replace("DTEND;VALUE=DATE:20261027\r\n", ""), status: "degraded" },
  { name: "DURATION without explicit DTEND", content: normalSnapshot.replace("DTEND;VALUE=DATE:20261027", "DURATION:P1D"), status: "degraded" },
  { name: "invalid DTSTART", content: normalSnapshot.replace("20261026", "invalid"), status: "degraded" },
  { name: "invalid DTEND", content: normalSnapshot.replace("20261027", "invalid"), status: "degraded" },
  { name: "rolled-over date", content: normalSnapshot.replace("20261027", "20260230"), status: "degraded" },
  { name: "checkout before check-in", content: normalSnapshot.replace("20261027", "20261025"), status: "degraded" },
  { name: "checkout equal to check-in", content: normalSnapshot.replace("20261027", "20261026"), status: "degraded" },
  { name: "duplicate UID", content: calendar(`${reservationEvent()}\r\n${reservationEvent()}`), status: "degraded" },
  { name: "conflicting duplicate UID", content: calendar(`${reservationEvent()}\r\n${reservationEvent().replace("20261027", "20261028")}`), status: "degraded" },
  { name: "missing UID", content: normalSnapshot.replace("UID:reservation-one\r\n", ""), status: "degraded" },
  { name: "duplicate date field", content: normalSnapshot.replace("SUMMARY:Reserved", "DTEND;VALUE=DATE:20261028"), status: "degraded" },
  { name: "valid plus malformed event", content: calendar(`${reservationEvent("new-valid")}\r\n${reservationEvent().replace("20261027", "invalid")}`), status: "degraded" },
  { name: "valid empty calendar", content: calendar(""), status: "valid_empty" },
] as const;
