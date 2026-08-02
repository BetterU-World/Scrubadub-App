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
import { ownerDashboardFixtures } from "./fixtures/ownerDashboardFixtures";
import {
  isDemoModeEnabled,
  isDemoPresentationMode,
  shouldRenderDemoApp,
} from "./demoRoute";

describe("Demo Mode routing", () => {
  it("is disabled by default and only enables the exact internal owner route", () => {
    expect(isDemoModeEnabled(undefined)).toBe(false);
    expect(isDemoModeEnabled("false")).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/owner", undefined)).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/owner", "true")).toBe(true);
    expect(shouldRenderDemoApp("/demo", "true")).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/worker", "true")).toBe(false);
  });

  it("recognizes only presentation=1", () => {
    expect(isDemoPresentationMode("?presentation=1")).toBe(true);
    expect(isDemoPresentationMode("?presentation=0")).toBe(false);
    expect(isDemoPresentationMode("?viewport=desktop")).toBe(false);
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
