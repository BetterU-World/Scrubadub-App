"use node";

/**
 * iCal feed parser — extracts normalized reservation candidates from raw .ics content.
 *
 * Uses node-ical for parsing. This is a pure utility with no DB access.
 * Imported only by the calendarSync action.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
import ical from "node-ical";
import { createHash } from "crypto";
import { validateRawCalendar } from "../lib/icalSnapshot";

export interface CalendarSnapshot {
  status: "valid" | "valid_empty" | "invalid" | "degraded";
  diagnostic?: string;
  reservations: ParsedReservation[];
  cancelledUids: string[];
  totalEvents: number;
  skipped: number;
}

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
  classificationHash?: string;
  eventMetadata?: { status?: string; transparency?: string; categories?: string[] };
}

/**
 * Extract a date-only ISO string ("YYYY-MM-DD") from an ical date value.
 * Handles both VALUE=DATE (dateOnly) and VALUE=DATE-TIME formats.
 *
 * Used for timed events and DTSTAMP only. Date-only stay fields are preserved
 * directly from the validated feed, independently of the server timezone.
 * Timed events retain existing UTC-date behavior; property TZ is follow-up work.
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
 * Reject the entire snapshot for invalid structure or any malformed candidate.
 * Account for every raw VEVENT after parsing to detect silent parser omissions.
 * Explicit cancellations carry UIDs without requiring irrelevant stay dates.
 * Syntactic validity does not establish provider snapshot completeness.
 */
export function parseICalFeed(rawIcs: string): CalendarSnapshot {
  const raw = validateRawCalendar(rawIcs);
  const reject = (status: "invalid" | "degraded", diagnostic: string): CalendarSnapshot => ({
    status, diagnostic, reservations: [], cancelledUids: [], totalEvents: 0, skipped: 0,
  });
  if (raw.status !== "valid") return reject(raw.status, raw.diagnostic);
  const rawByUid = new Map(raw.events.map((event) => [event.uid, event]));
  let parsed: ReturnType<typeof ical.sync.parseICS>;
  try {
    parsed = ical.sync.parseICS(raw.content);
  } catch {
    return reject("invalid", "iCalendar parser failed");
  }

  let totalEvents = 0;
  const skipped = 0;
  const reservations: ParsedReservation[] = [];
  const cancelledUids: string[] = [];
  const seen = new Set<string>();

  for (const key of Object.keys(parsed)) {
    const event = parsed[key];

    // Only process VEVENT components
    if (!event || event.type !== "VEVENT") continue;
    totalEvents++;

    // Match parsed events to the validated raw identities.
    const uid = typeof event.uid === "string" ? event.uid.trim() : "";
    const source = rawByUid.get(uid);
    if (!source || seen.has(uid)) return reject("degraded", "Parser event identity mismatch");
    seen.add(uid);

    // Explicit cancellation is not a malformed or silently skipped stay.
    if (source.cancelled) {
      cancelledUids.push(uid);
      continue;
    }

    // Raw validation already requires explicitly supplied stay dates.
    // Preserve DATE values verbatim: node-ical represents them in the server's
    // local timezone. Timed events retain existing UTC normalization.
    const normalize = (value: string, date: Date | undefined) => /^\d{8}$/.test(value)
      ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : toDateString(date);
    const startDate = normalize(source.start!.value, event.start as Date | undefined);
    const endDate = normalize(source.end!.value, event.end as Date | undefined);

    if (!startDate || !endDate) {
      return reject("degraded", "Invalid event dates");
    }

    // Do not create turnovers for same-date or reversed stays.
    if (endDate <= startDate || !(event.start instanceof Date) || !(event.end instanceof Date) ||
        !Number.isFinite(event.start.getTime()) || !Number.isFinite(event.end.getTime()) ||
        event.end.getTime() <= event.start.getTime()) {
      return reject("degraded", "Checkout must be after check-in");
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
      classificationHash: createHash("sha256").update(source.materialContent).digest("hex"),
      eventMetadata: {
        ...(typeof event.status === "string" ? { status: event.status } : {}),
        ...(typeof event.transparency === "string" ? { transparency: event.transparency } : {}),
        ...(Array.isArray(event.categories) ? { categories: event.categories.filter((value): value is string => typeof value === "string") } : {}),
      },
    });
  }

  if (seen.size !== raw.events.length) return reject("degraded", "Parser omitted calendar events");
  return {
    status: totalEvents === 0 ? "valid_empty" : "valid",
    ...(totalEvents === 0 ? { diagnostic: "Empty calendar is not authoritative cancellation evidence" } : {}),
    reservations, cancelledUids, totalEvents, skipped,
  };
}
