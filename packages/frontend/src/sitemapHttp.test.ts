import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

const state = vi.hoisted(() => ({
  page: { slugs: ["scrubadubsolutionsllc"], isDone: true, continueCursor: "" },
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class { query() { return Promise.resolve(state.page); } },
}));

import handler from "../api/sitemap";

async function request() {
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 200,
    body: "",
    setHeader(name: string, value: string) { headers[name] = value; },
    end(value: string) { response.body = value; },
  };
  await handler({ url: "/api/sitemap" } as IncomingMessage, response as unknown as ServerResponse);
  return { ...response, headers };
}

describe("raw sitemap HTTP response", () => {
  beforeEach(() => { process.env.VITE_CONVEX_URL = "https://example.convex.cloud"; });

  it("returns published mini-sites alongside platform pages", async () => {
    const result = await request();
    expect(result.statusCode).toBe(200);
    expect(result.headers["Content-Type"]).toBe("application/xml; charset=utf-8");
    expect(result.body).toContain("<loc>https://scrubscrubscrub.com/scrubadubsolutionsllc</loc>");
    expect(result.body).toContain("<loc>https://scrubscrubscrub.com/cleaning-business-software</loc>");
  });

  it("reports unavailable when the runtime Convex URL is absent", async () => {
    delete process.env.VITE_CONVEX_URL;
    const result = await request();
    expect(result.statusCode).toBe(503);
  });
});
