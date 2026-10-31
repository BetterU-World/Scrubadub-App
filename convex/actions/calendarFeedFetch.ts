"use node";

import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { CalendarFeedError, isPublicCalendarAddress, validateCalendarUrl } from "../lib/calendarFeedSecurity";

export const FEED_LIMITS = { timeoutMs: 30_000, bytes: 2 * 1024 * 1024, redirects: 3 } as const;

function aborted(signal: AbortSignal): void {
  if (signal.aborted) throw new CalendarFeedError("timeout");
}

/** Deadline also covers DNS. The OS lookup can finish later but cannot dispatch a request. */
async function resolve(host: string, signal: AbortSignal) {
  aborted(signal);
  const answers = isIP(host) ? [{ address: host, family: isIP(host) }] : await new Promise<Awaited<ReturnType<typeof resolveDns>>>((accept, reject) => {
    const cancel = () => reject(new CalendarFeedError("timeout"));
    signal.addEventListener("abort", cancel, { once: true });
    resolveDns(host).then(accept, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
  aborted(signal);
  if (!answers.length || answers.some((a) => !isPublicCalendarAddress(a.address))) throw new CalendarFeedError("unsafe_destination");
  return answers.find((a) => a.family === 4) ?? answers[0];
}
function resolveDns(host: string) { return lookup(host, { all: true, verbatim: true }); }

type Hop = { redirect: string } | { body: string };
async function fetchHop(raw: string, signal: AbortSignal): Promise<Hop> {
  const target = validateCalendarUrl(raw);
  const pinned = await resolve(target.hostname, signal);
  aborted(signal);
  return new Promise((accept, reject) => {
    let settled = false;
    let response: import("node:http").IncomingMessage | undefined;
    let verified = false;
    const finish = (error?: unknown, result?: Hop) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", cancel);
      response?.destroy();
      req.destroy();
      if (error) reject(error instanceof CalendarFeedError ? error : new CalendarFeedError("unavailable"));
      else accept(result!);
    };
    const cancel = () => finish(new CalendarFeedError("timeout"));
    // No shared agent/proxy, no independent DNS lookup, no automatic redirects.
    // Original host remains the TLS certificate/SNI and Host authority.
    const req = request({
      protocol: "https:", hostname: target.hostname, port: 443, method: "GET",
      servername: isIP(target.hostname) ? undefined : target.hostname,
      path: target.path, agent: false, family: pinned.family,
      rejectUnauthorized: true, maxHeaderSize: 16 * 1024,
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
      headers: { "User-Agent": "SCRUB-CalendarSync/1.0", Accept: "text/calendar, text/plain, application/octet-stream", "Accept-Encoding": "identity" },
    });
    req.on("socket", (socket) => {
      const verify = () => {
        // Some platforms expose IPv4 peers as IPv4-mapped IPv6 socket addresses.
        const peer = socket.remoteAddress?.replace(/^::ffff:/i, "");
        const equal = peer && isIP(peer) && new URL(`https://${isIP(peer) === 6 ? `[${peer}]` : peer}/`).hostname
          === new URL(`https://${pinned.family === 6 ? `[${pinned.address}]` : pinned.address}/`).hostname;
        if (!equal || !isPublicCalendarAddress(peer!)) finish(new CalendarFeedError("unsafe_destination"));
        else verified = true;
      };
      socket.once("connect", verify);
      socket.once("secureConnect", verify);
    });
    req.once("error", (e) => finish(e));
    req.once("response", (res) => {
      response = res;
      res.on("error", (e) => finish(e));
      if (!verified) return finish(new CalendarFeedError("unsafe_destination"));
      const status = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        if (!res.headers.location) return finish(new CalendarFeedError("unavailable"));
        return finish(undefined, { redirect: res.headers.location });
      }
      if (status < 200 || status >= 300) return finish(new CalendarFeedError("unavailable"));
      const length = res.headers["content-length"];
      if (length && (!/^\d+$/.test(length) || Number(length) > FEED_LIMITS.bytes)) return finish(new CalendarFeedError("too_large"));
      if (res.headers["content-encoding"] && res.headers["content-encoding"].trim().toLowerCase() !== "identity") return finish(new CalendarFeedError("encoding"));
      if (/text\/html|application\/xhtml/i.test(String(res.headers["content-type"] ?? ""))) return finish(new CalendarFeedError("invalid_calendar"));
      let bytes = 0;
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > FEED_LIMITS.bytes) return finish(new CalendarFeedError("too_large"));
        chunks.push(chunk);
      });
      res.once("aborted", () => finish(new CalendarFeedError("unavailable")));
      res.once("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (!body.trim() || /^\s*(?:<!doctype\s+html|<html|<body)/i.test(body)) return finish(new CalendarFeedError("invalid_calendar"));
        finish(undefined, { body });
      });
    });
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    else req.end();
  });
}

export async function fetchCalendarFeed(raw: string, externalSignal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, FEED_LIMITS.timeoutMs);
  externalSignal?.addEventListener("abort", cancel, { once: true });
  if (externalSignal?.aborted) cancel();
  try {
    let current = raw;
    const visited = new Set<string>();
    for (let hop = 0; ; hop++) {
      const { url } = validateCalendarUrl(current);
      if (visited.has(url.href) || hop > FEED_LIMITS.redirects) throw new CalendarFeedError("redirects");
      visited.add(url.href);
      const result = await fetchHop(current, controller.signal);
      if ("body" in result) return result.body;
      try {
        // Absolute Location values retain signed path bytes. Relative locations
        // use standard URL resolution; policy still validates the resolved hop.
        current = /^https?:\/\//i.test(result.redirect) ? result.redirect : new URL(result.redirect, current).href;
      } catch { throw new CalendarFeedError("invalid_url"); }
    }
  } catch (error) {
    throw error instanceof CalendarFeedError ? error : new CalendarFeedError("unavailable");
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", cancel);
  }
}
