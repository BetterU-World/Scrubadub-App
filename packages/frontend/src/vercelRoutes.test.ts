import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("packages/frontend/vercel.json", "utf8")) as {
  trailingSlash: boolean;
  functions: Record<string, { includeFiles: string }>;
  rewrites: { source: string; destination: string }[];
};

function destination(path: string) {
  if (config.trailingSlash === false && path.length > 1 && path.endsWith("/")) return `308 ${path.slice(0, -1)}`;
  for (const route of config.rewrites) {
    const match = new RegExp(`^${route.source}$`).exec(path);
    if (match) return route.destination.replace(/\$(\d+)/g, (_value, group) => match[Number(group)] ?? "");
  }
  return null;
}

describe("Vercel slash routing", () => {
  it.each(["/scrubadubsolutionsllc", "/showcase", "/login", "/definitely-missing-slug-zz20261001"])(
    "sends %s through the mini-site function",
    path => expect(destination(path)).toBe(`/api/mini-site?slug=${path.split("/")[1]}`),
  );

  it.each(["/scrubadubsolutionsllc/cleaner"])(
    "sends %s through the cleaner handler",
    path => expect(destination(path)).toBe("/api/mini-site?slug=scrubadubsolutionsllc&subpage=cleaner"),
  );

  it("preserves static and capability routes", () => {
    expect(destination("/giveaway")).toBe("/giveaway/index.html");
    expect(destination("/sitemap.xml")).toBe("/api/sitemap");
    for (const path of ["/r/token", "/c/token"]) {
      expect(destination(path)).toBe("/index.html");
    }
  });

  it("redirects trailing slashes to the slashless canonical path", () => {
    for (const path of ["/scrubadubsolutionsllc/", "/scrubadubsolutionsllc/cleaner/", "/login/", "/showcase/", "/giveaway/", "/r/token/", "/c/token/"]) {
      expect(destination(path)).toBe(`308 ${path.slice(0, -1)}`);
    }
  });

  it("packages the built Vite shell with the mini-site function", () => {
    expect(config.functions["api/mini-site.ts"].includeFiles).toBe("dist/index.html");
  });
});
