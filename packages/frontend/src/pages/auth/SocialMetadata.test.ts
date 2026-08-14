import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "packages/frontend/index.html"), "utf8");

describe("root social metadata", () => {
  it("provides one complete, crawler-visible social preview", () => {
    expect(html).toContain('<link rel="canonical" href="https://scrubscrubscrub.com" />');
    expect(html).toContain('<meta property="og:title" content="SCRUB — Operations Software for Cleaning Businesses" />');
    expect(html).toContain('<meta property="og:description" content="Run your cleaning business with one platform for scheduling, jobs, teams, clients, quality control, payments, and more." />');
    expect(html).toContain('<meta property="og:image" content="https://scrubscrubscrub.com/logo-full.png" />');
    expect(html).toContain('<meta property="og:url" content="https://scrubscrubscrub.com" />');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta name="twitter:title" content="SCRUB — Operations Software for Cleaning Businesses" />');
    expect(html).toContain('<meta name="twitter:description" content="Run your cleaning business with one platform for scheduling, jobs, teams, clients, quality control, payments, and more." />');
    expect(html).toContain('<meta name="twitter:image" content="https://scrubscrubscrub.com/logo-full.png" />');
  });

  it("does not use the removed homepage video poster for previews", () => {
    expect(html).not.toContain("scrub-demo-poster.png");
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/property="og:(title|description|image|url|type)"/g)).toHaveLength(5);
    expect(html.match(/name="twitter:(card|title|description|image)"/g)).toHaveLength(4);
  });
});
