import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("packages/frontend/vercel.json", "utf8")) as {
  rewrites: { source: string; destination: string }[];
};

function destination(path: string) {
  for (const route of config.rewrites) {
    const match = new RegExp(`^${route.source}$`).exec(path);
    if (match) return route.destination.replace(/\$(\d+)/g, (_value, group) => match[Number(group)] ?? "");
  }
  return null;
}

describe("Vercel slash routing", () => {
  it.each(["/scrubadubsolutionsllc", "/scrubadubsolutionsllc/", "/showcase", "/showcase/", "/login", "/login/", "/definitely-missing-slug-zz20261001", "/definitely-missing-slug-zz20261001/"])(
    "sends %s through the mini-site function",
    path => expect(destination(path)).toBe(`/api/mini-site?slug=${path.split("/")[1]}`),
  );

  it.each(["/scrubadubsolutionsllc/cleaner", "/scrubadubsolutionsllc/cleaner/"])(
    "sends %s through the cleaner handler",
    path => expect(destination(path)).toBe("/api/mini-site?slug=scrubadubsolutionsllc&subpage=cleaner"),
  );

  it("preserves static and capability routes", () => {
    expect(destination("/giveaway")).toBe("/giveaway/index.html");
    expect(destination("/giveaway/")).toBe("/giveaway/index.html");
    expect(destination("/sitemap.xml")).toBe("/api/sitemap");
    for (const path of ["/r/token", "/r/token/", "/c/token", "/c/token/"]) {
      expect(destination(path)).toBe("/index.html");
    }
  });
});
