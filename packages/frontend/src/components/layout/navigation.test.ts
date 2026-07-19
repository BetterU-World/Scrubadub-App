import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getMobileNavItemsForRole,
  getMoreNavItemsForRole,
  getNavSectionsForRole,
  isMoreNavActive,
  isNavItemActive,
  ownerSections,
} from "./navigation";

const hrefs = (items: { href: string }[]) => items.map((item) => item.href);

describe("role mobile navigation", () => {
  it("selects the approved visible destinations without overflow", () => {
    expect(hrefs(getMobileNavItemsForRole("owner"))).toEqual([
      "/",
      "/jobs",
      "/requests",
      "/properties",
    ]);
    expect(hrefs(getMobileNavItemsForRole("manager"))).toEqual([
      "/",
      "/jobs",
      "/calendar",
      "/red-flags",
    ]);
    expect(hrefs(getMobileNavItemsForRole("cleaner"))).toEqual([
      "/",
      "/jobs",
      "/availability",
    ]);
    expect(hrefs(getMobileNavItemsForRole("maintenance"))).toEqual([
      "/",
      "/jobs",
      "/availability",
    ]);
    expect(getMobileNavItemsForRole("affiliate")).toEqual([]);
  });

  it("derives More from the same permission-filtered configuration", () => {
    expect(hrefs(getMoreNavItemsForRole("owner"))).toContain("/calendar");
    expect(hrefs(getMoreNavItemsForRole("owner"))).toContain("/clients");
    expect(hrefs(getMoreNavItemsForRole("cleaner"))).toContain("/payments");
    expect(hrefs(getMoreNavItemsForRole("cleaner"))).toContain("/calendar");

    const withoutCapability = getNavSectionsForRole("manager", false).flatMap(
      (section) => hrefs(section.items)
    );
    const withCapability = getNavSectionsForRole("manager", true).flatMap(
      (section) => hrefs(section.items)
    );
    expect(withoutCapability).not.toContain("/owner/settings/add-ons");
    expect(withCapability).toContain("/owner/settings/add-ons");
  });

  it("matches route families on path boundaries", () => {
    const jobs = ownerSections[0].items.find((item) => item.href === "/jobs")!;
    const root = ownerSections[0].items.find((item) => item.href === "/")!;

    expect(isNavItemActive(jobs, "/jobs/new")).toBe(true);
    expect(isNavItemActive(jobs, "/jobs/job-123/edit")).toBe(true);
    expect(isNavItemActive(jobs, "/jobsite")).toBe(false);
    expect(isNavItemActive(root, "/")).toBe(true);
    expect(isNavItemActive(root, "/jobs")).toBe(false);
  });

  it("supports declarative aliases and More active state", () => {
    const payments = ownerSections[1].items.find(
      (item) => item.href === "/owner/payments"
    )!;
    expect(isNavItemActive(payments, "/owner/cleaner-payments")).toBe(true);
    expect(isNavItemActive(payments, "/owner/settlements")).toBe(true);
    expect(isMoreNavActive("/calendar", "owner")).toBe(true);
    expect(isMoreNavActive("/jobs/job-123", "owner")).toBe(false);
    expect(isMoreNavActive("/admin", "owner", false, true)).toBe(true);
    expect(isMoreNavActive("/terms", "owner")).toBe(false);
  });

  it("keeps the More control accessible", () => {
    const mobileNavSource = readFileSync(
      resolve(process.cwd(), "packages/frontend/src/components/layout/MobileNav.tsx"),
      "utf8"
    );
    const layoutSource = readFileSync(
      resolve(process.cwd(), "packages/frontend/src/components/layout/AppLayout.tsx"),
      "utf8"
    );
    const sidebarSource = readFileSync(
      resolve(process.cwd(), "packages/frontend/src/components/layout/Sidebar.tsx"),
      "utf8"
    );

    expect(mobileNavSource).toContain('aria-current={isActive ? "page" : undefined}');
    expect(mobileNavSource).toContain('aria-current={moreIsActive ? "page" : undefined}');
    expect(mobileNavSource).toContain('aria-controls="mobile-navigation"');
    expect(mobileNavSource).toContain("aria-expanded={menuOpen}");
    expect(mobileNavSource).not.toContain("overflow-x-auto");
    expect(layoutSource).toContain("menuTriggerRef.current = trigger");
    expect(layoutSource).toContain("hasMobileNavigation && (");
    expect(sidebarSource).toContain("triggerRef?.current?.focus()");
  });
});
