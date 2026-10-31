/** Raw checks run before node-ical can default dates or collapse duplicate UIDs. */
interface Field { value: string; valueType?: string }
export interface RawCalendarEvent {
  uid: string;
  cancelled: boolean;
  start?: Field;
  end?: Field;
  /** Used only to hash relevant evidence; never persisted or logged as raw text. */
  materialContent: string;
}
type RawSnapshot =
  | { status: "valid"; events: RawCalendarEvent[]; content: string }
  | { status: "invalid" | "degraded"; diagnostic: string };

/** Respect quoted parameter values, including colons in TZIDs and URLs. */
function contentLine(line: string) {
  const parts: string[] = [];
  let quoted = false;
  let start = 0;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (!quoted && (line[i] === ";" || line[i] === ":")) {
      parts.push(line.slice(start, i));
      start = i + 1;
      if (line[i] === ":") { colon = i; break; }
    }
  }
  const [rawName, ...parameters] = parts;
  if (colon < 1 || !/^[A-Za-z0-9_-]+$/.test(rawName)) throw new Error("Invalid content line");
  const name = rawName.toUpperCase();
  const headers = [name];
  let valueType: string | undefined;
  const parameterNames = new Set<string>();
  for (const parameter of parameters) {
    const equals = parameter.indexOf("=");
    const key = parameter.slice(0, equals).toUpperCase();
    if (equals < 1 || !/^[A-Z0-9_-]+$/.test(key) || !parameter.slice(equals + 1) || parameterNames.has(key)) {
      throw new Error("Invalid parameter");
    }
    parameterNames.add(key);
    headers.push(`${key}=${parameter.slice(equals + 1)}`);
    if (key === "VALUE") valueType = parameter.slice(equals + 1).replace(/^"(.*)"$/, "$1").toUpperCase();
  }
  const value = line.slice(colon + 1);
  return { name, value, valueType, hasParameters: parameters.length > 0,
    normalized: `${headers.join(";")}:${name === "BEGIN" || name === "END" ? value.toUpperCase() : value}` };
}

function validDate(field: Field | undefined): boolean {
  if (!field) return false;
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(field.value);
  if (!match) return false;
  const [, y, m, d, h, minute, second] = match;
  if (field.valueType && field.valueType !== (h === undefined ? "DATE" : "DATE-TIME")) return false;
  const date = new Date(0);
  date.setUTCFullYear(Number(y), Number(m) - 1, Number(d));
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d) &&
    (h === undefined || (Number(h) < 24 && Number(minute) < 60 && Number(second) < 60));
}

/** Match node-ical's TEXT decoding for identity checks. */
function uidValue(value: string): string {
  return value.replace(/\\,/g, ",").replace(/\\;/g, ";")
    .replace(/\\[nN]/g, "\n").replace(/\\\\/g, "\\").replace(/^"(.*)"$/, "$1").trim();
}

/** Validate syntax, not semantic reservation classification or provider completeness. */
export function validateRawCalendar(raw: string): RawSnapshot {
  const stack: string[] = [];
  const events: Map<string, Field>[] = [];
  const material = new Map<Map<string, Field>, string[]>();
  let current: Map<string, Field> | undefined;
  let opened = false;
  let closed = false;
  const normalized: string[] = [];
  try {
    const lines: string[] = [];
    for (const line of raw.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)) {
      if (/^[ \t]/.test(line)) {
        if (!lines.length || !lines[lines.length - 1]) throw new Error("Orphan folded line");
        lines[lines.length - 1] += line.slice(1);
      } else lines.push(line);
    }
    for (const line of lines) {
      if (!line) continue;
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(line)) throw new Error("Invalid control character");
      const field = contentLine(line);
      normalized.push(field.normalized);
      if (field.name === "BEGIN") {
        const component = field.value.toUpperCase();
        if (!/^[A-Z0-9_-]+$/.test(component) || field.hasParameters) throw new Error("Invalid component");
        if (!stack.length) {
          if (opened || component !== "VCALENDAR") throw new Error("Invalid envelope");
          opened = true;
        } else if (component === "VCALENDAR") throw new Error("Nested calendar");
        if (component === "VEVENT") {
          if (stack.length !== 1) throw new Error("Invalid event nesting");
          current = new Map();
          material.set(current, []);
          events.push(current);
        }
        stack.push(component);
      } else if (field.name === "END") {
        if (field.hasParameters || !stack.length || stack.pop() !== field.value.toUpperCase()) throw new Error("Mismatched component");
        if (field.value.toUpperCase() === "VEVENT") current = undefined;
        if (!stack.length) closed = true;
      } else {
        if (!stack.length || closed) throw new Error("Content outside calendar");
        if (stack[stack.length - 1] === "VEVENT" && current) {
          if (!["DTSTAMP", "LAST-MODIFIED", "CREATED", "SEQUENCE"].includes(field.name)) material.get(current)!.push(field.normalized);
          if (["UID", "DTSTART", "DTEND", "STATUS"].includes(field.name)) {
            if (current.has(field.name)) return { status: "degraded", diagnostic: "Duplicate required event field" };
            current.set(field.name, field);
          }
        }
      }
    }
    if (!opened || !closed || stack.length) throw new Error("Incomplete envelope");
    const seen = new Set<string>();
    const result: RawCalendarEvent[] = [];
    for (const fields of events) {
      const uid = uidValue(fields.get("UID")?.value ?? "");
      if (!uid || seen.has(uid)) return { status: "degraded", diagnostic: "Missing or duplicate event UID" };
      seen.add(uid);
      const cancelled = fields.get("STATUS")?.value.toUpperCase() === "CANCELLED";
      const start = fields.get("DTSTART");
      const end = fields.get("DTEND");
      // UID + STATUS suffices for explicit cancellation; no invented stay dates.
      if (!cancelled && (!validDate(start) || !validDate(end))) {
        return { status: "degraded", diagnostic: "Missing or invalid explicit DTSTART or DTEND" };
      }
      result.push({ uid, cancelled, start, end, materialContent: material.get(fields)!.sort().join("\r\n") });
    }
    return { status: "valid", events: result, content: normalized.join("\r\n") };
  } catch {
    // Never include provider data or private URLs in diagnostics.
    return { status: "invalid", diagnostic: "Invalid iCalendar envelope or component structure" };
  }
}
