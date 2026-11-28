/** Shared deterministic policy; never include input in an exception. */
export const FEED_ERRORS = {
  invalid_url: "Invalid feed URL. Use a complete HTTPS calendar URL without credentials or fragments.",
  unsafe_destination: "Unsafe destination. Use a public calendar provider.",
  unavailable: "Feed unavailable. Check the private URL and provider access.",
  timeout: "Request timed out. Try again later.",
  redirects: "Too many redirects or a redirect loop. Check the provider URL.",
  too_large: "Feed response too large. Use a smaller calendar feed.",
  invalid_calendar: "Invalid calendar content. Check the provider export URL.",
  encoding: "Unsupported feed encoding. The provider must support an uncompressed response.",
  processing: "Calendar processing failed. Try again later.",
} as const;
export type FeedErrorCode = keyof typeof FEED_ERRORS;
export class CalendarFeedError extends Error {
  constructor(public readonly code: FeedErrorCode) { super(FEED_ERRORS[code]); }
}
export function safeFeedError(error: unknown, fallback: FeedErrorCode = "unavailable"): string {
  return error instanceof CalendarFeedError ? FEED_ERRORS[error.code] : FEED_ERRORS[fallback];
}
/** Allowlisting also removes secrets in legacy diagnostics, including non-URL tokens. */
export function sanitizeFeedDiagnostic(value: string): string {
  for (const message of Object.values(FEED_ERRORS)) {
    if (value === message) return message;
    for (const stage of ["Fetch", "Parse", "Processing"]) {
      if (value === `${stage} error: ${message}`) return value;
    }
  }
  return FEED_ERRORS.unavailable;
}

function ipv4(address: string): number | null {
  if (!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(address)) return null;
  const parts = address.split(".").map(Number);
  return parts.every((p) => p <= 255) ? parts.reduce((n, p) => n * 256 + p, 0) : null;
}
function inV4(n: number, base: string, bits: number): boolean {
  return Math.floor(n / 2 ** (32 - bits)) === Math.floor(ipv4(base)! / 2 ** (32 - bits));
}
export function isPublicCalendarAddress(address: string): boolean {
  const n = ipv4(address);
  if (n !== null) return !([
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
    ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ["168.63.129.16", 32], // Azure platform virtual address
  ] as const).some(([base, bits]) => inV4(n, base, bits));
  // Only native global unicast. Excludes mapped IPv4, NAT64, ULA, local,
  // multicast and transition space; conservatively excludes special 2001::/23.
  if (!/^[0-9a-f:]+$/i.test(address) || !address.includes(":")) return false;
  let canonical: string;
  try { canonical = new URL(`https://[${address}]/`).hostname.slice(1, -1); } catch { return false; }
  const first = parseInt(canonical.split(":")[0], 16);
  const second = parseInt(canonical.split(":")[1] || "0", 16);
  return first >= 0x2000 && first <= 0x3fff
    && !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
    && first !== 0x2002 && !(first === 0x3fff && second < 0x1000);
}

export function validateCalendarUrl(raw: string): { url: URL; hostname: string; path: string } {
  const invalid = () => { throw new CalendarFeedError("invalid_url"); };
  if (raw.length > 4096 || /[\s\x00-\x20\x7f\\#]/.test(raw)) return invalid();
  const match = /^https:\/\/([^/?#]+)(.*)$/i.exec(raw);
  if (!match || /[@%]/.test(match[1])) return invalid();
  if (!(match[1].startsWith("[") ? /^\[[0-9a-f:.]+\](?::443)?$/i : /^[^:]+(?::443)?$/).test(match[1])) return invalid();
  let url: URL;
  try { url = new URL(raw); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return invalid();
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const rawHost = match[1].startsWith("[") ? match[1].slice(1, match[1].indexOf("]")) : match[1].split(":")[0];
  if (hostname.includes(":") || ipv4(hostname) !== null) {
    if (!hostname.includes(":") && rawHost !== hostname) return invalid();
    if (!isPublicCalendarAddress(hostname)) throw new CalendarFeedError("unsafe_destination");
  } else {
    if (hostname.length > 253 || !hostname.includes(".") || hostname.endsWith(".")
      || hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
      || /^\d+$/.test(hostname.split(".").slice(-1)[0])) return invalid();
    if (/(^|\.)(localhost|local|internal|lan|home|invalid|onion)$/.test(hostname)
      || hostname === "metadata.google.internal") throw new CalendarFeedError("unsafe_destination");
  }
  // Preserve the supplied path/query bytes, including signature ordering and dot segments.
  const path = match[2] === "" ? "/" : match[2].startsWith("?") ? `/${match[2]}` : match[2];
  if (/[^\x21-\x7e]/.test(path)) return invalid();
  return { url, hostname, path };
}
