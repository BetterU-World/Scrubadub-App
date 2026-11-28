import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

const state = vi.hoisted(() => ({ site: null as Record<string, unknown> | null }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { query() { return Promise.resolve(state.site); } } }));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => readFileSync("packages/frontend/index.html", "utf8")
    .replace('<script type="module" src="/src/main.tsx"></script>', '<script type="module" crossorigin src="/assets/index-test.js"></script><link rel="stylesheet" href="/assets/index-test.css">')),
}));

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
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("App shell must not use deployment HTTP"); }));
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
    expect(result.body).toContain('src="/assets/index-test.js"');
    expect(result.body).toContain('href="/assets/index-test.css"');
    expect(result.body).not.toContain("/src/main.tsx");
  });

  it("renders public gallery and team content with escaped text and only gated image destinations", async () => {
    const gated = "https://example.convex.site/microsite-media/cleaning-example/gallery/photo/image/key";
    const raw = "https://example.convex.cloud/api/storage/private";
    const image = { url: gated, width: 200, height: 160, alt: '"Clean" & ready' };
    state.site = {
      slug: "cleaning-example", templateId: "B", brandName: "Cleaning Example", bio: "Local cleaners",
      serviceArea: "Tampa", additionalServiceAreas: [], services: [], sections: [{ id: "team" }, { id: "gallery", heading: "Our work" }],
      media: {
        gallery: [{ id: "photo", kind: "photo", image, title: "Kitchen <detail>", caption: "Clean & dry" }],
        team: [{ id: "alex", name: "Alex", role: "Owner", bio: "Local team", portrait: { ...image, url: raw } }],
      },
    };
    const result = await request("cleaning-example");
    expect(result.statusCode).toBe(200);
    expect(result.body.indexOf("Meet our team")).toBeLessThan(result.body.indexOf("Our work"));
    expect(result.body).toContain(`src="${gated}"`);
    expect(result.body).toContain("Kitchen &lt;detail&gt;");
    expect(result.body).toContain('alt="&quot;Clean&quot; &amp; ready"');
    expect(result.body).toContain("Clean &amp; dry");
    expect(result.body).not.toContain(raw);
  });

  it("returns a real 404 and noindex for draft and missing sites", async () => {
    for (const slug of ["draft-example", "missing-example"]) {
      const result = await request(slug);
      expect(result.statusCode).toBe(404);
      expect(result.headers["X-Robots-Tag"]).toBe("noindex");
    }
  });

  it("renders only gated PDF links with escaped authored text", async () => {
    state.site = {
      slug: "cleaning-example", templateId: "A", brandName: "Example", bio: "Local cleaners",
      serviceArea: "Tampa", additionalServiceAreas: [], services: [], sections: [{ id: "resources" }],
      resources: [
        { id: "guide", title: "Welcome <guide>", description: "Before & after", bytes: 1500,
          url: "https://example.convex.site/microsite-resource/cleaning-example/guide/key" },
        { id: "invalid", title: "Hidden", bytes: 300, url: "https://example.convex.cloud/api/storage/private" },
      ],
    };
    const result = await request("cleaning-example");
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("Welcome &lt;guide&gt;");
    expect(result.body).toContain("Before &amp; after");
    expect(result.body).toContain('href="https://example.convex.site/microsite-resource/cleaning-example/guide/key"');
    expect(result.body).not.toContain("storage/private");
    expect(result.body).not.toContain("Hidden");
  });

  it("rejects invalid slugs and preserves reserved app routes", async () => {
    expect((await request("bad_slug")).statusCode).toBe(404);
    const reserved = await request("showcase");
    expect(reserved.statusCode).toBe(200);
    expect(reserved.body).toContain('<div id="root"></div>');
    expect(reserved.body).toContain('src="/assets/index-test.js"');
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
