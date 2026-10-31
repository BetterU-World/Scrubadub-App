import { afterEach, describe, expect, it, vi } from "vitest";
import ical from "node-ical";
import { parseICalFeed } from "../../actions/icalParser";
import { calendar, cancelledEvent, normalSnapshot, reservationEvent, unsafeSnapshots } from "./calendarSnapshotFixtures";

afterEach(() => vi.restoreAllMocks());

describe("iCalendar snapshot validation", () => {
  it("preserves valid dates and stable hashes", () => {
    const first = parseICalFeed(normalSnapshot);
    expect(first).toMatchObject({ status: "valid", totalEvents: 1, skipped: 0, cancelledUids: [] });
    expect(first.reservations).toEqual([expect.objectContaining({ uid: "reservation-one", checkIn: "2026-10-26", checkOut: "2026-10-27" })]);
    expect(parseICalFeed(normalSnapshot)).toEqual(first);
  });

  it.each(unsafeSnapshots)("rejects $name without partial candidates", ({ content, status }) => {
    expect(parseICalFeed(content)).toMatchObject({ status, reservations: [], cancelledUids: [] });
  });

  it("accepts UID-only explicit cancellation without inventing a stay", () => {
    expect(parseICalFeed(calendar(cancelledEvent()))).toMatchObject({ status: "valid", totalEvents: 1, reservations: [], cancelledUids: ["reservation-one"] });
  });

  it("preserves cancellations alongside active reservations", () => {
    expect(parseICalFeed(calendar(`${reservationEvent()}\r\n${cancelledEvent("cancelled")}`))).toMatchObject({ status: "valid", totalEvents: 2, cancelledUids: ["cancelled"] });
  });

  it("accepts folded lines, BOM, extensions, quoted parameters and alarms", () => {
    const event = reservationEvent().replace("SUMMARY:Reserved", 'SUMMARY:Reser\r\n ved\r\nX-PROVIDER;X-URL="https://example.test/a:b":value\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Reminder\r\nEND:VALARM');
    expect(parseICalFeed(`\uFEFF${calendar(event)}`)).toMatchObject({ status: "valid", reservations: [expect.objectContaining({ summary: "Reserved" })] });
  });

  it("supports explicit timed dates while retaining UTC-date normalization", () => {
    const content = normalSnapshot.replace("DTSTART;VALUE=DATE:20261026", "DTSTART:20261026T100000Z")
      .replace("DTEND;VALUE=DATE:20261027", "DTEND:20261027T110000Z");
    expect(parseICalFeed(content).status).toBe("valid");
    expect(parseICalFeed(content.replace("110000Z", "250000Z")).status).toBe("degraded");
  });

  it("accepts case-insensitive names and a provider timezone component", () => {
    const zone = "BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\nBEGIN:STANDARD\r\nDTSTART:19701101T020000\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nEND:STANDARD\r\nEND:VTIMEZONE";
    const content = calendar(`${zone}\r\n${reservationEvent()}`).replace("BEGIN:VCALENDAR", "begin:vcalendar").replace("UID:", "uid:");
    expect(parseICalFeed(content).status).toBe("valid");
  });

  it("does not add reservation classification heuristics", () => {
    expect(parseICalFeed(normalSnapshot.replace("SUMMARY:Reserved", "SUMMARY:Not available")).status).toBe("valid");
  });

  it.each([
    ["floating date-time", "DTSTART:20261026T110000", "DTEND:20261027T110000"],
    ["IANA TZID", "DTSTART;TZID=America/New_York:20261026T110000", "DTEND;TZID=America/New_York:20261027T110000"],
    ["quoted TZID and VALUE", 'DTSTART;VALUE=DATE-TIME;TZID="America/New_York":20261026T110000', 'DTEND;VALUE=DATE-TIME;TZID="America/New_York":20261027T110000'],
    ["Windows TZID", 'DTSTART;TZID="Pacific Standard Time":20261026T110000', 'DTEND;TZID="Pacific Standard Time":20261027T110000'],
    ["explicit UTC date-time", "DTSTART;VALUE=DATE-TIME:20261026T110000Z", "DTEND;VALUE=DATE-TIME:20261027T110000Z"],
    ["quoted date VALUE", 'DTSTART;VALUE="DATE":20261026', 'DTEND;VALUE="DATE":20261027'],
  ])("accepts common provider format: %s", (_label, start, end) => {
    const content = normalSnapshot.replace("DTSTART;VALUE=DATE:20261026", start)
      .replace("DTEND;VALUE=DATE:20261027", end)
      .replace("VERSION:2.0", "VERSION:2.0\r\nPRODID:-//Synthetic Provider//EN\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Rental")
      .replace("SUMMARY:Reserved", "SUMMARY:Reserved\r\nDTSTAMP:20261020T100000Z\r\nDESCRIPTION:Provider extension data\r\nTRANSP:OPAQUE\r\nSEQUENCE:1");
    expect(parseICalFeed(content)).toMatchObject({ status: "valid", totalEvents: 1, reservations: [expect.objectContaining({ checkIn: "2026-10-26", checkOut: "2026-10-27" })] });
  });

  it("reports valid-empty for calendars containing timezone metadata only", () => {
    expect(parseICalFeed(calendar("BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\nEND:VTIMEZONE"))).toMatchObject({ status: "valid_empty", totalEvents: 0, reservations: [], cancelledUids: [] });
  });

  it("detects parser omissions even when the library returns successfully", () => {
    vi.spyOn(ical.sync, "parseICS").mockReturnValue({});
    expect(parseICalFeed(normalSnapshot)).toMatchObject({ status: "degraded", diagnostic: "Parser omitted calendar events", reservations: [] });
  });

  it("sanitizes parser exceptions without exposing input", () => {
    vi.spyOn(ical.sync, "parseICS").mockImplementation(() => { throw new Error("https://private.example/secret-token"); });
    const result = parseICalFeed(normalSnapshot);
    expect(result).toMatchObject({ status: "invalid", diagnostic: "iCalendar parser failed", reservations: [] });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
