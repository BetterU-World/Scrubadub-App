import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const pipeline = read("packages/frontend/src/pages/owner/PipelinePage.tsx");
const details = read("packages/frontend/src/pages/owner/RequestDetailPage.tsx");

describe("lead pipeline operational workspace", () => {
  it("renders canonical stages, counts, filters, search, sorting, and attention states", () => {
    for (const stage of ["new", "qualification", "walkthrough", "proposal", "decision", "agreement", "onboarding", "converted", "closed"]) {
      expect(pipeline).toContain(`"${stage}"`);
    }
    expect(pipeline).toContain("attentionCount");
    expect(pipeline).toContain("searchPlaceholder");
    expect(pipeline).toContain("leadTypeFilter");
    expect(pipeline).toContain("pipeline.sorts.attention");
  });

  it("uses explicit next-action links and exposes linked-record visibility", () => {
    expect(pipeline).toContain("pipeline.nextAction.hrefSuffix");
    expect(pipeline).toContain("pipeline.linked");
    expect(pipeline).toContain("pipeline.actions.");
  });

  it("contains the board on mobile and provides accessible labels and focus", () => {
    expect(pipeline).toContain("overflow-x-auto");
    expect(pipeline).toContain("tabIndex={0}");
    expect(pipeline).toContain("aria-labelledby");
    expect(pipeline).toContain("sr-only");
  });

  it("aligns Request Details with the same server-derived projection", () => {
    expect(details).toContain("request-pipeline-summary");
    expect(details).toContain("pipeline.nextAction.key");
    expect(details).toContain("pipeline.linked");
  });

  it("keeps English and Spanish pipeline keys in exact parity", () => {
    const en = JSON.parse(read("packages/frontend/src/i18n/en/common.json")).pipeline;
    const es = JSON.parse(read("packages/frontend/src/i18n/es/common.json")).pipeline;
    const keys = (value: any, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === "object" ? keys(child, path) : [path];
    });
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });
});
