import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

const state = vi.hoisted(() => ({ site: null as Record<string, unknown> | null }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query() { return Promise.resolve(state.site); } } }));

import handler from "../api/mini-site";

function response() {
  const headers: Record<string, string> = {};
  const result = { statusCode: 200, body: "", setHeader(name: string, value: string) { headers[name] = value; }, end(value: string) { result.body = value; } };
  return { result, headers };
}

async function request(slug: string, subpage = "") {
  const { result, headers } = response();
  await handler({ url: `/api/mini-site?slug=${encodeURIComponent(slug)}${subpage ? `&subpage=${subpage}` : ""}` } as IncomingMessage, result as unknown as ServerResponse);
  return { ...result, headers };
}

describe("raw mini-site HTTP response", () => {
  beforeEach(() => {
    process.env.VITE_CONVEX_URL = "https://example.convex.cloud";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(readFileSync("packages/frontend/index.html", "utf8"), { status: 200 })));
    state.site = null;
  });

  it("returns company HTML and metadata before React runs", async () => {
    state.site = { slug: "cleaning-example", templateId: "A", brandName: "Cleaning Example", bio: "House cleaning in Central Florida.", serviceArea: "Davenport, FL", additionalServiceAreas: ["Clermont, FL"], services: ["Home cleaning"], logoUrl: null, heroImageUrl: null, publicEmail: "hello@example.test", publicPhone: null, metaDescription: null, publicRequestToken: null };
    const result = await request("cleaning-example");
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<h1>Cleaning Example</h1>");
    expect(result.body).toContain("<meta name=\"description\"");
    expect(result.body).toContain("https://scrubscrubscrub.com/cleaning-example");
    expect(result.body).toContain("application/ld+json");
    expect(result.body).toContain("Clermont, FL");
  });

  it("returns a real 404 and noindex for draft and missing sites", async () => {
    for (const slug of ["draft-example", "missing-example"]) {
      const result = await request(slug);
      expect(result.statusCode).toBe(404);
      expect(result.headers["X-Robots-Tag"]).toBe("noindex");
    }
  });

  it("rejects invalid slugs and preserves reserved app routes", async () => {
    expect((await request("bad_slug")).statusCode).toBe(404);
    const reserved = await request("showcase");
    expect(reserved.statusCode).toBe(200);
    expect(reserved.body).toContain('<div id="root"></div>');
  });

  it("keeps the cleaner application working without indexing it", async () => {
    state.site = { slug: "cleaning-example" };
    const result = await request("cleaning-example", "cleaner");
    expect(result.statusCode).toBe(200);
    expect(result.headers["X-Robots-Tag"]).toBe("noindex");
    expect(result.body).toContain('<div id="root"></div>');
  });

  it("reports unavailable if the Convex URL is missing at function runtime", async () => {
    delete process.env.VITE_CONVEX_URL;
    const result = await request("cleaning-example");
    expect(result.statusCode).toBe(503);
    expect(result.headers["X-Robots-Tag"]).toBe("noindex");
  });
});
