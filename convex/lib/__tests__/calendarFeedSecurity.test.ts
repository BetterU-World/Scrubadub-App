import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { CalendarFeedError, FEED_ERRORS, isPublicCalendarAddress, sanitizeFeedDiagnostic, validateCalendarUrl } from "../calendarFeedSecurity";
import { fetchCalendarFeed, FEED_LIMITS } from "../../actions/calendarFeedFetch";

const network = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("node:https", () => ({ request: network.request }));
const ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
const URL_SECRET = "https://calendar.example.com/private-secret?token=query-secret";
type Reply = { status?: number; headers?: Record<string, string>; chunks?: Buffer[]; stall?: boolean; peer?: string; error?: string };
let replies: Reply[];
let requests: Array<{ options: any; req: any; res: any }>;
beforeEach(() => {
  replies = []; requests = [];
  network.lookup.mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  network.request.mockReset().mockImplementation((options) => {
    const reply = replies.shift() ?? {};
    const req = new EventEmitter() as any;
    const res = new EventEmitter() as any;
    req.destroy = vi.fn(); res.destroy = vi.fn();
    res.statusCode = reply.status ?? 200; res.headers = reply.headers ?? {};
    requests.push({ options, req, res });
    req.end = () => queueMicrotask(() => {
      const socket = new EventEmitter() as any; socket.remoteAddress = reply.peer ?? "93.184.216.34";
      req.emit("socket", socket); socket.emit("connect"); socket.emit("secureConnect");
      if (req.destroy.mock.calls.length) return;
      if (reply.error) return req.emit("error", new Error(reply.error));
      req.emit("response", res);
      if (reply.stall || res.destroy.mock.calls.length) return;
      for (const chunk of reply.chunks ?? [Buffer.from(ICS)]) {
        if (res.destroy.mock.calls.length) break;
        res.emit("data", chunk);
      }
      if (!res.destroy.mock.calls.length) res.emit("end");
    });
    return req;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("calendar URL and address policy", () => {
  it("preserves signed path/query bytes and accepts IDNA and public literals", () => {
    const signed = "https://Calendar.Example.com:443/a/../feed?b=2&a=x%2Fy+z";
    expect(validateCalendarUrl(signed).path).toBe("/a/../feed?b=2&a=x%2Fy+z");
    expect(validateCalendarUrl("https://bücher.de/feed").hostname).toBe("xn--bcher-kva.de");
    expect(validateCalendarUrl("https://8.8.8.8/feed").hostname).toBe("8.8.8.8");
    expect(validateCalendarUrl("https://[2606:4700:4700::1111]/feed").hostname).toBe("2606:4700:4700::1111");
  });
  it.each([
    "http://calendar.example.com/feed", "ftp://example.com/feed", "file:///etc/passwd", "data:text/calendar,hello", "javascript:alert(1)", "gopher://example.com",
    "https://user:secret@example.com/feed", "https://user@example.com/feed", "https://localhost/feed", "https://foo.localhost/feed", "https://foo.internal/feed",
    "https://127.0.0.1/feed", "https://10.0.0.1/feed", "https://172.16.0.1", "https://192.168.1.1", "https://169.254.169.254/latest/meta-data", "https://168.63.129.16/",
    "https://[::1]/", "https://[fc00::1]/", "https://[fe80::1]/", "https://[::ffff:127.0.0.1]/", "https://[::ffff:8.8.8.8]/", "https://[ff02::1]/", "https://[::]/",
    "https://metadata.google.internal/", "https://2130706433/", "https://0x7f000001/", "https://0177.0.0.1/", "https://127.1/", "https://%31%32%37.0.0.1/",
    "https://calendar.example.com/#token", "https://calendar.example.com/#", "https://calendar.example.com:8443/", "https://calendar.example.com./", "https://a..com/", "https://example.com\\@127.0.0.1/", " https://example.com/", "https://example.com/\nsecret", "https://example.com/" + "a".repeat(4096),
  ])("rejects unsafe or ambiguous URL %s", (value) => {
    expect(() => validateCalendarUrl(value)).toThrow(CalendarFeedError);
    try { validateCalendarUrl(value); } catch (e) { expect((e as Error).message).not.toContain(value); }
  });
  it.each(["0.0.0.0", "100.100.100.200", "198.18.0.1", "192.0.2.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "2001:db8::1", "2001::1", "2002:808:808::", "3fff::1", "64:ff9b::808:808"])("blocks non-public range %s", (ip) => expect(isPublicCalendarAddress(ip)).toBe(false));
  it("discards legacy raw diagnostics entirely", () => {
    expect(sanitizeFeedDiagnostic(`Fetch error: ${URL_SECRET}\nsecret-body`)).toBe(FEED_ERRORS.unavailable);
    expect(sanitizeFeedDiagnostic(`Fetch error: ${FEED_ERRORS.timeout}`)).toContain(FEED_ERRORS.timeout);
  });
});

describe("bounded pinned HTTPS calendar transport", () => {
  it("pins the validated DNS answer while retaining hostname/TLS and exact signed request path", async () => {
    await expect(fetchCalendarFeed(URL_SECRET)).resolves.toBe(ICS);
    const options = requests[0].options;
    expect(options).toMatchObject({ hostname: "calendar.example.com", family: 4, agent: false, rejectUnauthorized: true, path: "/private-secret?token=query-secret", maxHeaderSize: 16384 });
    const callback = vi.fn(); options.lookup("rebind.example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(network.lookup).toHaveBeenCalledTimes(1);
    expect(requests[0].req.destroy).toHaveBeenCalled(); expect(requests[0].res.destroy).toHaveBeenCalled();
  });
  it("rejects all answers if any resolved IP is private, without dispatch", async () => {
    network.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toMatchObject({ code: "unsafe_destination" });
    expect(network.request).not.toHaveBeenCalled();
  });
  it("rejects a mismatched actual socket destination", async () => {
    replies.push({ peer: "127.0.0.1" });
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toMatchObject({ code: "unsafe_destination" });
    expect(requests[0].req.destroy).toHaveBeenCalled();
  });
  it("pins native IPv6 and validates the connected IPv6 peer", async () => {
    network.lookup.mockResolvedValue([{ address: "2606:4700:4700::1111", family: 6 }]);
    replies.push({ peer: "2606:4700:4700:0:0:0:0:1111" });
    await expect(fetchCalendarFeed(URL_SECRET)).resolves.toBe(ICS);
    expect(requests[0].options.family).toBe(6);
  });
  it.each([{ answers: [] }, { answers: [{ address: "fc00::1", family: 6 }] }, { answers: [{ address: "::ffff:8.8.8.8", family: 6 }] }])("rejects absent or unsafe DNS answers", async ({ answers }) => {
    network.lookup.mockResolvedValue(answers);
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toMatchObject({ code: "unsafe_destination" });
    expect(network.request).not.toHaveBeenCalled();
  });
  it("does not use DNS for a validated public literal", async () => {
    replies.push({ peer: "8.8.8.8" });
    await expect(fetchCalendarFeed("https://8.8.8.8/feed")).resolves.toBe(ICS);
    expect(network.lookup).not.toHaveBeenCalled();
  });
  it("handles safe relative and cross-origin redirects with fresh validation and no credential headers", async () => {
    replies.push({ status: 302, headers: { location: "/next?new-secret=yes" } }, { status: 307, headers: { location: "https://other.example.com/feed" } }, {});
    await expect(fetchCalendarFeed(URL_SECRET)).resolves.toBe(ICS);
    expect(network.lookup).toHaveBeenCalledTimes(3);
    expect(requests.map((r) => r.options.path)).toEqual(["/private-secret?token=query-secret", "/next?new-secret=yes", "/feed"]);
    for (const r of requests) expect(Object.keys(r.options.headers).sort()).toEqual(["Accept", "Accept-Encoding", "User-Agent"]);
  });
  it("retains absolute redirect signed path/query bytes", async () => {
    replies.push({ status: 302, headers: { location: "https://other.example.com/a/../feed?b=%2F&a=+" } }, {});
    await fetchCalendarFeed(URL_SECRET);
    expect(requests[1].options.path).toBe("/a/../feed?b=%2F&a=+");
  });
  it.each(["https://127.0.0.1/feed", "http://calendar.example.com/feed", "https://user:secret@example.com/"])("rejects redirect %s before another request", async (location) => {
    replies.push({ status: 302, headers: { location } });
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toBeInstanceOf(CalendarFeedError);
    expect(requests).toHaveLength(1);
  });
  it("rejects a redirect whose DNS changes to private", async () => {
    network.lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]).mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
    replies.push({ status: 302, headers: { location: "/next" } });
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toMatchObject({ code: "unsafe_destination" });
    expect(requests).toHaveLength(1);
  });
  it("detects loops", async () => {
    replies.push({ status: 302, headers: { location: URL_SECRET } });
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toMatchObject({ code: "redirects" });
    expect(requests).toHaveLength(1);
  });
  it("bounds distinct redirects", async () => {
    replies.push(...Array.from({ length: 5 }, (_, i) => ({ status: 302, headers: { location: `/next-${i}` } })));
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toMatchObject({ code: "redirects" });
    expect(requests).toHaveLength(4);
  });
  it("rejects excessive Content-Length without reading body", async () => {
    replies.push({ headers: { "content-length": String(FEED_LIMITS.bytes + 1) } });
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toMatchObject({ code: "too_large" });
    expect(requests[0].res.destroy).toHaveBeenCalled();
  });
  it.each([{}, { "content-length": "5" }])("counts actual bytes even with missing or dishonest length", async (headers) => {
    replies.push({ headers, chunks: [Buffer.alloc(FEED_LIMITS.bytes), Buffer.from("x"), Buffer.from("must-not-read")] });
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toMatchObject({ code: "too_large" });
    expect(requests[0].res.destroy).toHaveBeenCalled();
  });
  it("accepts the exact byte limit", async () => {
    replies.push({ chunks: [Buffer.from(ICS.padEnd(FEED_LIMITS.bytes, " "))] });
    expect((await fetchCalendarFeed(URL_SECRET)).length).toBe(FEED_LIMITS.bytes);
  });
  it.each([{ status: 403 }, { headers: { "content-type": "text/html" } }, { chunks: [Buffer.from("<!doctype html><html>private-body</html>")] }, { chunks: [] }, { headers: { "content-encoding": "gzip" } }])("rejects HTTP, HTML, blank and encoded content safely", async (reply) => {
    replies.push(reply);
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toBeInstanceOf(CalendarFeedError);
  });
  it("times out stalled streams and destroys request/response", async () => {
    vi.useFakeTimers(); replies.push({ stall: true });
    const result = fetchCalendarFeed(URL_SECRET); const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(FEED_LIMITS.timeoutMs);
    await assertion; expect(requests[0].req.destroy).toHaveBeenCalled(); expect(requests[0].res.destroy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts an active request and cleans up", async () => {
    replies.push({ stall: true }); const controller = new AbortController();
    const result = fetchCalendarFeed(URL_SECRET, controller.signal);
    const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
    await new Promise<void>((r) => setTimeout(r, 0)); controller.abort(); await assertion;
    expect(requests[0].req.destroy).toHaveBeenCalled(); expect(requests[0].res.destroy).toHaveBeenCalled();
  });
  it("deadlines DNS and never dispatches after late lookup completion", async () => {
    vi.useFakeTimers(); let resolve!: (a: unknown) => void;
    network.lookup.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const result = fetchCalendarFeed(URL_SECRET); const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(FEED_LIMITS.timeoutMs); await assertion;
    resolve([{ address: "93.184.216.34", family: 4 }]); await Promise.resolve();
    expect(network.request).not.toHaveBeenCalled();
  });
  it("does not dispatch an already-aborted request", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(fetchCalendarFeed(URL_SECRET, controller.signal)).rejects.toMatchObject({ code: "timeout" });
    expect(network.request).not.toHaveBeenCalled(); expect(network.lookup).not.toHaveBeenCalled();
  });
  it("uses one overall deadline across DNS and body reading", async () => {
    vi.useFakeTimers();
    network.lookup.mockImplementation(() => new Promise(r => setTimeout(() => r([{ address: "93.184.216.34", family: 4 }]), 20_000)));
    replies.push({ stall: true });
    const result = fetchCalendarFeed(URL_SECRET); const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(20_000); expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000); await assertion;
    expect(requests[0].req.destroy).toHaveBeenCalled();
  });
  it("never exposes raw network exceptions or secret response bodies", async () => {
    const logger = vi.spyOn(console, "error");
    replies.push({ error: `${URL_SECRET} password response-body stack` });
    await expect(fetchCalendarFeed(URL_SECRET)).rejects.toMatchObject({ message: FEED_ERRORS.unavailable });
    expect(logger).not.toHaveBeenCalled();
  });
});
