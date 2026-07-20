import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Requests and Manuals mobile overflow contracts", () => {
  it("keeps the Requests view switcher inside a shrinkable two-column mobile grid", () => {
    const header = read("packages/frontend/src/components/ui/LeadsHeader.tsx");

    expect(header).toContain("w-full min-w-0 max-w-full");
    expect(header).toContain("grid-cols-2");
    expect(header).toContain("sm:flex sm:w-auto");
    expect(header).toContain("touch-target flex min-w-0");
    expect(header).toContain("min-w-0 break-words");
  });

  it("bounds the Requests status scroller and long card metadata to the page width", () => {
    const requests = read("packages/frontend/src/pages/owner/RequestListPage.tsx");

    expect(requests).toContain("min-w-0 max-w-full");
    expect(requests).toMatch(/w-full min-w-0 max-w-full[^\"]*overflow-x-auto/);
    expect(requests).toContain('className="max-w-full whitespace-normal break-words"');
    expect(requests).toContain('className="min-w-0 break-words"');
  });

  it("stacks Manuals cards and critical actions at phone widths", () => {
    const manuals = read("packages/frontend/src/pages/shared/ManualsPage.tsx");

    expect(manuals.match(/card flex min-w-0 flex-col items-stretch/g)?.length).toBeGreaterThanOrEqual(3);
    expect(manuals).toContain("sm:flex-row sm:items-center");
    expect(manuals).toContain("break-words font-medium");
    expect(manuals).toContain("touch-target flex w-full");
  });

  it("keeps the Manuals seed dialog within the viewport", () => {
    const manuals = read("packages/frontend/src/pages/shared/ManualsPage.tsx");

    expect(manuals).toContain('className="fixed inset-0 z-50 flex items-center justify-center p-4"');
    expect(manuals).toContain("max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-lg");
    expect(manuals).toContain("flex flex-col-reverse gap-2 sm:flex-row");
    expect(manuals).not.toContain("w-full max-w-lg mx-4");
  });
});
