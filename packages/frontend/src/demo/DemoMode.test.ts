import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown> | string) => {
      if (key === "dashboard.welcomeBack") return `Welcome back, ${(options as Record<string, unknown>)?.name}`;
      return key;
    },
  }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { DemoOwnerPage } from "../pages/demo/DemoOwnerPage";
import { DemoWorkerPage } from "../pages/demo/DemoWorkerPage";
import { ownerSections, workerSections } from "../components/layout/navigation";
import { ownerDashboardFixtures } from "./fixtures/ownerDashboardFixtures";
import { brightSideWorkerHomeFixture } from "./fixtures/workerShowcaseFixtures";
import {
  getDemoPersona,
  isDemoModeEnabled,
  isDemoPresentationMode,
  shouldRenderDemoApp,
} from "./demoRoute";

describe("Demo Mode routing", () => {
  it("is disabled by default and only enables exact internal Showcase routes", () => {
    expect(isDemoModeEnabled(undefined)).toBe(false);
    expect(isDemoModeEnabled("false")).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/owner", undefined)).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/owner", "true")).toBe(true);
    expect(shouldRenderDemoApp("/demo", "true")).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/worker", "true")).toBe(true);
    expect(shouldRenderDemoApp("/internal/demo/unknown", "true")).toBe(false);
    expect(getDemoPersona("/internal/demo/owner")).toBe("owner");
    expect(getDemoPersona("/internal/demo/worker")).toBe("worker");
    expect(getDemoPersona("/internal/demo/unknown")).toBeNull();
  });

  it("recognizes only presentation=1", () => {
    expect(isDemoPresentationMode("?presentation=1")).toBe(true);
    expect(isDemoPresentationMode("?presentation=0")).toBe(false);
    expect(isDemoPresentationMode("?viewport=desktop")).toBe(false);
  });
});

describe("Worker Showcase", () => {
  it("renders a cohesive, populated BrightSide workday with static interactions", () => {
    const html = renderToStaticMarkup(createElement(DemoWorkerPage));

    expect(html).toContain("BrightSide Cleaning Co.");
    expect(html).toContain("Riverstone Retreat");
    expect(html).toContain("Current assignment");
    expect(html).toContain("Completed-cleaning photos");
    expect(html).toContain("9 of 12");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
  });

  it("mirrors the complete production worker navigation and mobile More item", () => {
    const html = renderToStaticMarkup(createElement(DemoWorkerPage));

    for (const section of workerSections) {
      expect(html).toContain(section.titleKey);
      for (const item of section.items) expect(html).toContain(item.labelKey);
    }
    expect(html).toContain("nav.more");
  });

  it("removes shell chrome in presentation mode", () => {
    const html = renderToStaticMarkup(createElement(DemoWorkerPage, { presentation: true }));

    expect(html).toContain("Riverstone Retreat");
    expect(html).not.toContain("Demo Mode");
    expect(html).not.toContain("Fictional workspace");
  });

  it("keeps the canonical fixture deterministic and aligned with the owner fixture", () => {
    expect(brightSideWorkerHomeFixture.worker.companyName).toBe(ownerDashboardFixtures.canonical.viewer.companyName);
    expect(brightSideWorkerHomeFixture.todayJobs[0].propertyName).toBe(ownerDashboardFixtures.canonical.upcomingJobs[0].propertyName);
    expect(brightSideWorkerHomeFixture.todayJobs[0].status).toBe(ownerDashboardFixtures.canonical.upcomingJobs[0].status);
    expect(JSON.stringify(brightSideWorkerHomeFixture)).not.toMatch(/@|\d{3}[-.)]\s*\d{3}/);
  });
});

describe("Owner Dashboard demo", () => {
  it("renders the canonical fixture synchronously with static interactions", () => {
    const html = renderToStaticMarkup(createElement(DemoOwnerPage));

    expect(html).toContain("BrightSide Cleaning Co.");
    expect(html).toContain("Riverstone Retreat");
    expect(html).toContain("Loose porch railing needs maintenance review");
    expect(html).toContain("data-demo-static-card");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<button");
  });

  it("shows the complete production owner navigation hierarchy without making it interactive", () => {
    const html = renderToStaticMarkup(createElement(DemoOwnerPage));

    for (const section of ownerSections) {
      expect(html).toContain(section.titleKey);
      for (const item of section.items) {
        expect(html).toContain(item.labelKey);
      }
    }
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<button");
  });

  it("renders presentation mode without the demo shell chrome", () => {
    const html = renderToStaticMarkup(createElement(DemoOwnerPage, { presentation: true }));

    expect(html).toContain("BrightSide Cleaning Co.");
    expect(html).not.toContain("Demo Mode");
    expect(html).not.toContain("Fictional workspace");
  });

  it("keeps the canonical fixture deterministic and scenario-ready", () => {
    expect(ownerDashboardFixtures.canonical).toBe(ownerDashboardFixtures.canonical);
    expect(ownerDashboardFixtures.canonical.metrics).toHaveLength(6);
    expect(ownerDashboardFixtures.canonical.upcomingJobs).toHaveLength(5);
    expect(JSON.stringify(ownerDashboardFixtures.canonical)).not.toMatch(/@|\d{3}[-.)]\s*\d{3}/);
  });

  it("keeps every shared dashboard translation available in English and Spanish", () => {
    const root = process.cwd();
    const en = JSON.parse(readFileSync(resolve(root, "packages/frontend/src/i18n/en/common.json"), "utf8"));
    const es = JSON.parse(readFileSync(resolve(root, "packages/frontend/src/i18n/es/common.json"), "utf8"));
    const requiredKeys = [
      "welcomeBack",
      "properties",
      "teamMembers",
      "activeJobs",
      "openRedFlags",
      "awaitingApproval",
      "openMaintenance",
      "upcomingJobs",
      "recentRedFlags",
      "gettingStarted",
      "ofComplete",
      "createFirstProperty",
      "addFirstTeamMember",
      "scheduleFirstJob",
      "readGoldStandard",
      "markManualsRead",
    ];

    for (const key of requiredKeys) {
      expect(en.dashboard[key]).toBeTruthy();
      expect(es.dashboard[key]).toBeTruthy();
    }
  });

  it("contains no connected application imports in the demo subtree", () => {
    const root = process.cwd();
    const demoFiles = [
      "packages/frontend/src/demo/DemoApp.tsx",
      "packages/frontend/src/demo/DemoShell.tsx",
      "packages/frontend/src/pages/demo/DemoOwnerPage.tsx",
      "packages/frontend/src/pages/demo/DemoWorkerPage.tsx",
      "packages/frontend/src/demo/ShowcaseWorkerJobPreview.tsx",
      "packages/frontend/src/features/worker-home/WorkerHomePresentation.tsx",
      "packages/frontend/src/features/owner-dashboard/OwnerDashboardPresentation.tsx",
    ];
    const source = demoFiles.map((file) => readFileSync(resolve(root, file), "utf8")).join("\n");

    expect(source).not.toMatch(/convex\/react|useAuth|useQuery|useMutation|useAction|@vercel\/analytics/);
  });

  it("branches at the entry point before Convex, Sentry, analytics, or application hooks", () => {
    const mainSource = readFileSync(resolve(process.cwd(), "packages/frontend/src/main.tsx"), "utf8");
    const demoBranch = mainSource.indexOf("if (demoMode)");
    const convexClient = mainSource.indexOf("new ConvexReactClient");
    const sentryInit = mainSource.indexOf("Sentry.init");

    expect(demoBranch).toBeGreaterThan(-1);
    expect(demoBranch).toBeLessThan(convexClient);
    expect(demoBranch).toBeLessThan(sentryInit);
    expect(mainSource).toContain("if (!demoMode && import.meta.env.PROD");
  });
});
