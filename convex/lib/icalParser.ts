/**
 * iCal feed parser — extracts normalized reservation candidates from raw .ics content.
 *
 * Uses node-ical for parsing. This is a pure utility with no DB access.
 * Designed to run inside a "use node" Convex action.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
import ical from "node-ical";
import { createHash } from "crypto";

export interface ParsedReservation {
  /** The iCal UID — primary dedup key */
  uid: string;
  /** VEVENT SUMMARY (often "Reserved", guest name, or "Not available") */
  summary: string | undefined;
  /** ISO date string "YYYY-MM-DD" — check-in date */
  checkIn: string;
  /** ISO date string "YYYY-MM-DD" — checkout date */
  checkOut: string;
  /** DTSTAMP value as ISO string, if present */
  dtStamp: string | undefined;
  /** SHA-256 of the key VEVENT fields — used for change detection */
  rawHash: string;
}

/**
 * Extract a date-only ISO string ("YYYY-MM-DD") from an ical date value.
 * Handles both VALUE=DATE (dateOnly) and VALUE=DATE-TIME formats.
 *
 * For VALUE=DATE (dateOnly === true):
 *   node-ical stores these as midnight UTC. The UTC date components are the
 *   exact calendar date from the feed. Safe to use getUTC*().
 *
 * For VALUE=DATE-TIME (dateOnly falsy):
 *   node-ical converts to a JS Date in UTC. If the original event had a
 *   timezone (e.g. America/New_York 11:00 AM → UTC 15:00), the UTC date
 *   could differ from the local date. However Airbnb and Vrbo feeds
 *   consistently use VALUE=DATE for reservations, so timed events are rare.
 *   For the uncommon timed case we still extract the UTC date — this is safe
 *   because checkout times are typically morning/midday, well before the UTC
 *   date boundary for any US timezone. A property in UTC-12 with a late-night
 *   checkout could shift by one day, but that scenario doesn't occur with
 *   real Airbnb/Vrbo feeds which always use VALUE=DATE.
 */
function toDateString(d: Date | undefined | null): string | null {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Compute a stable hash of the key event fields for change detection.
 * If any field changes between syncs, the hash changes.
 */
function computeHash(uid: string, checkIn: string, checkOut: string, summary: string | undefined): string {
  const input = [uid, checkIn, checkOut, summary ?? ""].join("|");
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Parse raw .ics content into normalized reservation candidates.
 *
 * Parsing rules (V1, conservative):
 * - Skip VEVENTs without a UID
 * - Skip VEVENTs without DTEND (no checkout = no job possible)
 * - Skip VEVENTs where STATUS is CANCELLED
 * - Skip zero-length events where DTSTART === DTEND
 * - Normalize all dates to date-only ISO strings
 *
 * Returns only valid, parseable reservations. Invalid events are counted
 * in the `skipped` field for logging.
 */
export function parseICalFeed(rawIcs: string): {
  reservations: ParsedReservation[];
  totalEvents: number;
  skipped: number;
} {
  const parsed = ical.sync.parseICS(rawIcs);

  let totalEvents = 0;
  let skipped = 0;
  const reservations: ParsedReservation[] = [];

  for (const key of Object.keys(parsed)) {
    const event = parsed[key];

    // Only process VEVENT components
    if (!event || event.type !== "VEVENT") continue;
    totalEvents++;

    // Skip: no UID
    const uid = event.uid;
    if (!uid || typeof uid !== "string" || uid.trim() === "") {
      skipped++;
      continue;
    }

    // Skip: STATUS is CANCELLED (case-insensitive)
    if (
      typeof event.status === "string" &&
      event.status.toUpperCase() === "CANCELLED"
    ) {
      skipped++;
      continue;
    }

    // Skip: no DTSTART or DTEND
    const startDate = toDateString(event.start as Date | undefined);
    const endDate = toDateString(event.end as Date | undefined);

    if (!startDate || !endDate) {
      skipped++;
      continue;
    }

    // Skip: zero-length event (DTSTART === DTEND)
    if (startDate === endDate) {
      skipped++;
      continue;
    }

    // Extract optional fields
    const summary =
      typeof event.summary === "string" ? event.summary : undefined;
    const dtStamp = toDateString(event.dtstamp as Date | undefined) ?? undefined;

    const rawHash = computeHash(uid.trim(), startDate, endDate, summary);

    reservations.push({
      uid: uid.trim(),
      summary,
      checkIn: startDate,
      checkOut: endDate,
      dtStamp,
      rawHash,
    });
  }

  return { reservations, totalEvents, skipped };
}
