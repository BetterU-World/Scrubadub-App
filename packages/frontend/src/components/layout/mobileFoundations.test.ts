import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("mobile foundation contracts", () => {
  it("enables safe-area viewport geometry", () => {
    expect(read("packages/frontend/index.html")).toContain("viewport-fit=cover");
  });

  it("defines shared safe-area, control, and card contracts", () => {
    const css = read("packages/frontend/src/index.css");

    expect(css).toContain("--mobile-bottom-occlusion");
    expect(css).toMatch(/\.btn-primary\s*\{[^}]*min-h-11/s);
    expect(css).toMatch(/\.btn-secondary\s*\{[^}]*min-h-11/s);
    expect(css).toMatch(/\.btn-danger\s*\{[^}]*min-h-11/s);
    expect(css).toMatch(/\.input-field\s*\{[^}]*min-h-11/s);
    expect(css).toMatch(/\.card\s*\{[^}]*p-4 sm:p-6/s);
    expect(css).toMatch(/\.touch-target\s*\{[^}]*min-h-11 min-w-11/s);
  });

  it("contains the document and authenticated shell at the viewport width", () => {
    const css = read("packages/frontend/src/index.css");
    const layout = read("packages/frontend/src/components/layout/AppLayout.tsx");
    const transition = read("packages/frontend/src/components/layout/PageTransition.tsx");

    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[^}]*max-width: 100%[^}]*min-width: 0/s);
    expect(css).toMatch(/html,\s*body\s*\{[^}]*overflow-x: clip/s);
    expect(layout).toContain("w-full min-w-0 max-w-full");
    expect(layout).toContain("min-h-0 min-w-0 max-w-full flex-1");
    expect(layout).toContain("min-w-0 max-w-full flex-1 p-4");
    expect(transition).toContain("min-w-0 max-w-full animate-page-in");
  });

  it("keeps mobile navigation labels inside their allocated item width", () => {
    const nav = read("packages/frontend/src/components/layout/MobileNav.tsx");

    expect(nav).toContain('<span className="max-w-full truncate">');
    expect(nav).not.toContain('<span className="whitespace-nowrap">');
  });

  it("reserves the shared mobile occlusion in the authenticated shell", () => {
    const layout = read("packages/frontend/src/components/layout/AppLayout.tsx");

    expect(layout).toContain("min-h-screen min-h-[100dvh]");
    expect(layout).toContain('hasMobileNavigation && "pb-[var(--mobile-bottom-occlusion)]"');
    expect(layout).not.toContain("pb-20");
  });

  it("assigns safe-area ownership to the bottom navigation", () => {
    const nav = read("packages/frontend/src/components/layout/MobileNav.tsx");
    const cta = read("packages/frontend/src/components/StickyWorkspaceCTA.tsx");
    const sidebar = read("packages/frontend/src/components/layout/Sidebar.tsx");

    expect(nav).toContain("pb-[var(--safe-area-bottom)]");
    expect(nav).toContain("h-[var(--mobile-nav-height)]");
    expect(cta).toContain("bottom-[var(--mobile-bottom-occlusion)]");
    expect(cta).toContain("md:bottom-0");
    expect(cta).not.toContain("safe-area-inset-bottom");
    expect(sidebar).toContain("top-[var(--safe-area-top)]");
    expect(sidebar).toContain("bottom-[var(--safe-area-bottom)]");
  });
});
