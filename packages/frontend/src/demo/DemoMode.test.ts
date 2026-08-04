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
import {
  DemoWorkerChecklistPage,
  DemoWorkerJobDetailPage,
  DemoWorkerJobsPage,
} from "../pages/demo/DemoWorkerJourneyPages";
import { ownerSections, workerSections } from "../components/layout/navigation";
import { ShowcaseNotFoundPage } from "./ShowcaseNotFoundPage";
import { ShowcasePlaceholderPage } from "./ShowcasePlaceholderPage";
import { ownerDashboardFixtures } from "./fixtures/ownerDashboardFixtures";
import {
  brightSideWorkerHomeFixture,
  brightSideWorkerJobPreviewFixture,
  brightSideWorkerJobs,
  getBrightSideWorkerJob,
  RIVERSTONE_SHOWCASE_JOB_ID,
} from "./fixtures/workerShowcaseFixtures";
import {
  getDemoPersona,
  isDemoModeEnabled,
  isDemoPresentationMode,
  shouldRenderDemoApp,
} from "./demoRoute";
import {
  assertShowcaseRegistryComplete,
  buildShowcasePath,
  getShowcasePage,
  getShowcasePages,
  workerShowcaseJourneyRoutes,
} from "./showcaseRegistry";

describe("Demo Mode routing", () => {
  it("is disabled by default and recognizes only strict Owner and Worker path segments", () => {
    expect(isDemoModeEnabled(undefined)).toBe(false);
    expect(isDemoModeEnabled("false")).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/owner", undefined)).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/owner", "true")).toBe(true);
    expect(shouldRenderDemoApp("/demo", "true")).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/worker", "true")).toBe(true);
    expect(shouldRenderDemoApp("/internal/demo/worker/jobs", "true")).toBe(true);
    expect(shouldRenderDemoApp("/internal/demo/owner/properties", "true")).toBe(true);
    expect(shouldRenderDemoApp("/internal/demo/worker/something-unknown", "true")).toBe(true);
    expect(shouldRenderDemoApp("/internal/demo/workerish", "true")).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/ownerish", "true")).toBe(false);
    expect(shouldRenderDemoApp("/internal/demo/unknown", "true")).toBe(false);
    expect(getDemoPersona("/internal/demo/owner")).toBe("owner");
    expect(getDemoPersona("/internal/demo/worker")).toBe("worker");
    expect(getDemoPersona("/internal/demo/worker/jobs?ignored=true")).toBe("worker");
    expect(getDemoPersona("/internal/demo/workerish")).toBeNull();
    expect(getDemoPersona("/internal/demo/unknown")).toBeNull();
  });

  it("recognizes only presentation=1", () => {
    expect(isDemoPresentationMode("?presentation=1")).toBe(true);
    expect(isDemoPresentationMode("?presentation=0")).toBe(false);
    expect(isDemoPresentationMode("?viewport=desktop")).toBe(false);
  });
});

describe("Worker Showcase", () => {
  it("renders a cohesive, populated BrightSide workday with Showcase-only navigation", () => {
    const html = renderToStaticMarkup(createElement(DemoWorkerPage));

    expect(html).toContain("BrightSide Cleaning Co.");
    expect(html).toContain("Riverstone Retreat");
    expect(html).toContain("Do this now");
    expect(html).toContain("Today’s schedule");
    expect(html).not.toContain("Completed-cleaning photos");
    expect(html).not.toContain("Performance");
    expect(html).toContain('href="/internal/demo/worker/jobs"');
    expect(html).not.toContain('href="/jobs"');
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

  it("renders the complete read-only Home to Jobs to Detail to Checklist journey", () => {
    const jobsHtml = renderToStaticMarkup(createElement(DemoWorkerJobsPage, {
      presentation: true,
      currentPath: "/internal/demo/worker/jobs",
    }));
    const detailHtml = renderToStaticMarkup(createElement(DemoWorkerJobDetailPage, {
      showcaseJobId: RIVERSTONE_SHOWCASE_JOB_ID,
      presentation: true,
      currentPath: `/internal/demo/worker/jobs/${RIVERSTONE_SHOWCASE_JOB_ID}`,
    }));
    const checklistHtml = renderToStaticMarkup(createElement(DemoWorkerChecklistPage, {
      showcaseJobId: RIVERSTONE_SHOWCASE_JOB_ID,
      presentation: true,
      currentPath: `/internal/demo/worker/jobs/${RIVERSTONE_SHOWCASE_JOB_ID}/checklist`,
    }));

    expect(jobsHtml).toContain("Active job");
    expect(jobsHtml).toContain("Upcoming jobs");
    expect(jobsHtml).toContain("Completed jobs");
    expect(jobsHtml).toContain(`href="/internal/demo/worker/jobs/${RIVERSTONE_SHOWCASE_JOB_ID}?presentation=1"`);
    expect(detailHtml).toContain("Access instructions");
    expect(detailHtml).toContain("Required add-ons");
    expect(detailHtml).toContain(`href="/internal/demo/worker/jobs/${RIVERSTONE_SHOWCASE_JOB_ID}/checklist?presentation=1"`);
    expect(checklistHtml).toContain("Cleaning workspace");
    expect(checklistHtml).toContain("Completed-cleaning photos");
    expect(checklistHtml).toContain("9 of 12");
    expect(`${jobsHtml}${detailHtml}${checklistHtml}`).not.toMatch(/<input|<form|type="file"/);
    expect([...`${jobsHtml}${detailHtml}${checklistHtml}`.matchAll(/href="([^"]+)"/g)].every((match) => match[1].startsWith("/internal/demo/worker"))).toBe(true);
  });

  it("derives every Riverstone view from the same canonical Showcase job", () => {
    const riverstone = getBrightSideWorkerJob(RIVERSTONE_SHOWCASE_JOB_ID)!;
    const homeRiverstone = brightSideWorkerHomeFixture.todayJobs.find((job) => job.id === RIVERSTONE_SHOWCASE_JOB_ID)!;

    expect(homeRiverstone.propertyName).toBe(riverstone.propertyName);
    expect(homeRiverstone.propertyAddress).toBe(riverstone.address);
    expect(homeRiverstone.status).toBe(riverstone.status);
    expect(brightSideWorkerJobPreviewFixture.propertyName).toBe(riverstone.propertyName);
    expect(brightSideWorkerJobPreviewFixture.status).toBe(riverstone.status);
  });

  it("renders an isolated Worker job not-found state for unknown Showcase ids", () => {
    const html = renderToStaticMarkup(createElement(DemoWorkerJobDetailPage, {
      showcaseJobId: "unknown-job",
      presentation: true,
      currentPath: "/internal/demo/worker/jobs/unknown-job",
    }));
    expect(html).toContain("Job not found");
    expect(html).toContain('href="/internal/demo/worker/jobs?presentation=1"');
  });
});

describe("Owner Dashboard demo", () => {
  it("renders the canonical fixture synchronously with Showcase-only navigation", () => {
    const html = renderToStaticMarkup(createElement(DemoOwnerPage));

    expect(html).toContain("BrightSide Cleaning Co.");
    expect(html).toContain("Riverstone Retreat");
    expect(html).toContain("Loose porch railing needs maintenance review");
    expect(html).toContain("data-demo-static-card");
    expect(html).toContain('href="/internal/demo/owner/jobs"');
    expect(html).not.toContain('href="/jobs"');
  });

  it("shows the complete production owner navigation hierarchy as safe links", () => {
    const html = renderToStaticMarkup(createElement(DemoOwnerPage));

    for (const section of ownerSections) {
      expect(html).toContain(section.titleKey);
      for (const item of section.items) {
        if (item.href === "/jobs/requests") continue;
        expect(html).toContain(item.labelKey);
      }
    }
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((href) => href.startsWith("/internal/demo/owner"))).toBe(true);
  });

  it("renders presentation mode without the demo shell chrome", () => {
    const html = renderToStaticMarkup(createElement(DemoOwnerPage, { presentation: true }));

    expect(html).toContain("BrightSide Cleaning Co.");
    expect(html).not.toContain("Demo Mode");
    expect(html).not.toContain("Fictional workspace");
    expect(html).not.toContain("dashboard.gettingStarted");
  });

  it("renders a distinct read-only Owner jobs presentation for Product Proof", () => {
    const html = renderToStaticMarkup(createElement(DemoOwnerPage, { presentation: true, currentPath: "/internal/demo/owner/jobs" }));

    expect(html).toContain("Operating schedule");
    expect(html).toContain("Riverstone Retreat");
    expect(html).toContain("Maple &amp; Main Offices");
    expect(html).not.toContain("Welcome back");
    expect(html).not.toMatch(/<input|<form|<button/);
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
      "packages/frontend/src/pages/demo/DemoWorkerJourneyPages.tsx",
      "packages/frontend/src/demo/ShowcaseWorkerJobPreview.tsx",
      "packages/frontend/src/demo/ShowcaseWorkerJourney.tsx",
      "packages/frontend/src/demo/ShowcasePlaceholderPage.tsx",
      "packages/frontend/src/demo/ShowcaseNotFoundPage.tsx",
      "packages/frontend/src/demo/showcaseRegistry.ts",
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

describe("SCRUB Showcase registry", () => {
  it("classifies every production Owner and Worker navigation item exactly once", () => {
    expect(() => assertShowcaseRegistryComplete()).not.toThrow();
    expect(getShowcasePages("owner")).toHaveLength(ownerSections.flatMap((section) => section.items).filter((item) => item.href !== "/jobs/requests").length);
    expect(getShowcasePages("worker")).toHaveLength(workerSections.flatMap((section) => section.items).length);
  });

  it("implements the Owner and Worker core destinations while preserving other placeholders", () => {
    const ownerPages = getShowcasePages("owner");
    const workerPages = getShowcasePages("worker");
    expect(ownerPages.filter((page) => page.availability === "implemented").map((page) => page.relativePath)).toEqual(["/", "/jobs"]);
    expect(ownerPages.filter((page) => !["/", "/jobs"].includes(page.relativePath)).every((page) => page.availability === "placeholder")).toBe(true);
    expect(workerPages.filter((page) => page.availability === "implemented").map((page) => page.relativePath)).toEqual(["/", "/jobs"]);
    expect(workerPages.filter((page) => !["/", "/jobs"].includes(page.relativePath)).every((page) => page.availability === "placeholder")).toBe(true);
    expect(workerShowcaseJourneyRoutes.jobDetail).toBe("/jobs/:showcaseJobId");
    expect(workerShowcaseJourneyRoutes.checklist).toBe("/jobs/:showcaseJobId/checklist");
  });

  it("builds only persona-scoped Showcase destinations and preserves presentation mode", () => {
    expect(buildShowcasePath("owner", "/jobs")).toBe("/internal/demo/owner/jobs");
    expect(buildShowcasePath("worker", "/payments", true)).toBe("/internal/demo/worker/payments?presentation=1");
  });

  it("renders polished placeholder and not-found states without production destinations", () => {
    const workerPayments = getShowcasePage("worker", "/payments")!;
    const placeholderHtml = renderToStaticMarkup(createElement(ShowcasePlaceholderPage, {
      page: workerPayments,
      currentPath: "/internal/demo/worker/payments",
      presentation: true,
    }));
    const notFoundHtml = renderToStaticMarkup(createElement(ShowcaseNotFoundPage, {
      persona: "worker",
      currentPath: "/internal/demo/worker/something-unknown",
      presentation: true,
    }));

    expect(placeholderHtml).toContain("SCRUB Showcase");
    expect(placeholderHtml).toContain("not included in SCRUB Showcase yet");
    expect(placeholderHtml).toContain("Review planned job payments");
    expect(placeholderHtml).toContain('href="/internal/demo/worker?presentation=1"');
    expect(placeholderHtml).not.toContain('href="/payments"');
    expect(notFoundHtml).toContain("Showcase page not found");
    expect(notFoundHtml).toContain("safely inside SCRUB Showcase");
  });

  it("marks the current desktop and mobile destination with aria-current", () => {
    const ownerHtml = renderToStaticMarkup(createElement(DemoOwnerPage, {
      currentPath: "/internal/demo/owner/jobs",
    }));
    const workerHtml = renderToStaticMarkup(createElement(DemoWorkerPage, {
      currentPath: "/internal/demo/worker/availability",
    }));

    expect(ownerHtml).toContain('href="/internal/demo/owner/jobs" aria-current="page"');
    expect(workerHtml).toContain('href="/internal/demo/worker/availability" aria-current="page"');
    expect(ownerHtml).not.toContain('href="/internal/demo/worker');
    expect(workerHtml).not.toContain('href="/internal/demo/owner');
  });
});
