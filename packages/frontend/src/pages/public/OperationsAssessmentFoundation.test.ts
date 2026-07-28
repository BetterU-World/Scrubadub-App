import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clearProgress, loadProgress, saveProgress } from "../../lib/assessmentPersistence";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as unknown as Storage;
}

describe("operations assessment public foundation", () => {
  it("keeps the English and Spanish assessment catalogs in exact key parity", () => {
    const en = JSON.parse(read("packages/frontend/src/i18n/en/common.json")).assessment;
    const es = JSON.parse(read("packages/frontend/src/i18n/es/common.json")).assessment;
    const keys = (value: any, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === "object" ? keys(child, path) : [path];
    });
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });

  it("round-trips and clears same-device progress safely", () => {
    const target = storage();
    saveProgress({ answers: { "business.team_size": "solo" }, currentQuestionKey: "scheduling.primary_method", language: "es", lastActivityAt: 123 }, target);
    expect(loadProgress(target)).toMatchObject({ answers: { "business.team_size": "solo" }, language: "es", currentQuestionKey: "scheduling.primary_method" });
    clearProgress(target);
    expect(loadProgress(target)).toBeNull();
    target.setItem("scrub_operations_assessment_v1", "not-json");
    expect(loadProgress(target)).toBeNull();
  });

  it("routes assessment before auth guards and reserves it from slug routing", () => {
    const app = read("packages/frontend/src/App.tsx");
    expect(app.indexOf('pathname === "/assessment"')).toBeLessThan(app.indexOf("// --- GUARD 1"));
    expect(app).toContain('"/assessment"');
    expect(app.indexOf('pathname === "/assessment"')).toBeLessThan(app.indexOf("const slugMatch"));
  });

  it("keeps production exposure explicitly gated until reporting exists", () => {
    const feature = read("packages/frontend/src/lib/assessmentFeature.ts");
    const landing = read("packages/frontend/src/pages/auth/LandingPage.tsx");
    expect(feature).toContain("VITE_ENABLE_OPERATIONS_ASSESSMENT");
    expect(feature).toContain("import.meta.env.DEV");
    expect(landing).toContain("isOperationsAssessmentEnabled");
  });

  it("uses responsive, accessible question and sticky-navigation contracts", () => {
    const page = read("packages/frontend/src/pages/public/OperationsAssessmentPage.tsx");
    expect(page).toContain("min-w-0 overflow-x-hidden");
    expect(page).toContain("min-h-12 cursor-pointer");
    expect(page).toContain("focus-within:ring-2");
    expect(page).toContain("safe-area-inset-bottom");
    expect(page).toContain('role="alert"');
    expect(page).toContain("headingRef.current?.focus()");
    expect(page).not.toContain("overflow-x-auto");
  });

  it("restores completed attempts into the frozen completion state", () => {
    const page = read("packages/frontend/src/pages/public/OperationsAssessmentPage.tsx");
    expect(page).toContain('result.attempt.status === "completed"');
    expect(page).toContain("result.attempt.completionSnapshot");
    expect(page).toContain('setView("report")');
    expect(page).toContain("generateReport");
    expect(page).not.toContain("clearProgress();\n        setView(\"report\")");
  });

  it("renders the advisory report without exposing internal evidence or formula data", () => {
    const report = read("packages/frontend/src/pages/public/OperationsAssessmentReport.tsx");
    expect(report).toContain("executiveDiagnosis");
    expect(report).toContain("executiveSummary");
    expect(report).toContain("scorecard");
    expect(report).toContain("strengths");
    expect(report).toContain("opportunities");
    expect(report).toContain('role="img"');
    expect(report).toContain("heading.current?.focus()");
    expect(report).not.toContain("evidenceReferences");
    expect(report).not.toContain("applicableWeight");
    expect(report).not.toContain("benchmarkKey");
  });

  it("renders an accessible, staged roadmap without exposing roadmap internals", () => {
    const roadmap = read("packages/frontend/src/pages/public/OperationsAssessmentRoadmap.tsx");
    expect(roadmap).toContain('aria-labelledby={showHeading ? "growth-roadmap-heading" : undefined}');
    expect(roadmap).toContain("recommendedActions");
    expect(roadmap).toContain("successIndicators");
    expect(roadmap).toContain("stages.map");
    expect(roadmap).toContain("recommendedActions.slice(0, 3)");
    expect(roadmap).not.toContain("evidenceReferences");
    expect(roadmap).not.toContain("dependencyKeys");
    expect(roadmap).not.toContain("priority:");
  });

  it("orders the polished report from diagnosis to action, evidence, follow-on work, and strengths", () => {
    const report = read("packages/frontend/src/pages/public/OperationsAssessmentReport.tsx");
    const diagnosis = report.indexOf("assessment.report.executiveDiagnosis");
    const now = report.indexOf("assessment.report.startHere");
    const scorecard = report.indexOf("assessment.report.scorecard");
    const next = report.indexOf("assessment.report.whatComesNext");
    const maintain = report.indexOf("assessment.report.strengthsToProtect");
    expect(diagnosis).toBeLessThan(now);
    expect(now).toBeLessThan(scorecard);
    expect(scorecard).toBeLessThan(next);
    expect(next).toBeLessThan(maintain);
    expect(report).not.toContain("<Findings");
  });

  it("provides a professional completion transition before report generation", () => {
    const page = read("packages/frontend/src/pages/public/OperationsAssessmentPage.tsx");
    expect(page).toContain('"completing"');
    expect(page).toContain("assessment.completion.acknowledgement");
    expect(page).toContain("assessment.completion.preparing");
    expect(page.indexOf('setView("completing")')).toBeLessThan(page.indexOf("await complete("));
    expect(page).toContain("motion-reduce:animate-none");
  });

  it("keeps the full report ahead of optional continuity and separates consent", () => {
    const report = read("packages/frontend/src/pages/public/OperationsAssessmentReport.tsx");
    const continuity = read("packages/frontend/src/pages/public/AssessmentContinuity.tsx");
    expect(report.indexOf("<OperationsAssessmentRoadmap")).toBeLessThan(report.indexOf("<AssessmentContinuity"));
    expect(continuity).toContain('type="email"');
    expect(continuity).toContain("marketingConsent: false");
    expect(continuity).toContain('role="status"');
    expect(continuity).not.toMatch(/unlock|pricing|subscribe|payment/i);
  });

  it("allows secure completed returns while new starts remain feature flagged", () => {
    const app = read("packages/frontend/src/App.tsx");
    expect(app).toContain('new URLSearchParams(window.location.search).has("return")');
    expect(app).toContain("isOperationsAssessmentEnabled");
    const page = read("packages/frontend/src/pages/public/OperationsAssessmentPage.tsx");
    expect(page).toContain("openReturnLink");
    expect(page).toContain('setView("report")');
  });

  it("uses the shared applicability evaluator and context-aware stale-state recovery", () => {
    const page = read("packages/frontend/src/pages/public/OperationsAssessmentPage.tsx");
    expect(page).toContain('from "../../../../../convex/lib/assessmentApplicability"');
    expect(page).toContain("priorResponses");
    expect(page).toContain("progressRef.current");
    expect(page).toContain("assessment.errors.branchRefresh");
    expect(page).not.toContain("function applicable(");
  });

  it("deduplicates rapid persistence and translates rate-limit recovery", () => {
    const page = read("packages/frontend/src/pages/public/OperationsAssessmentPage.tsx");
    expect(page).toContain("persistenceRef.current");
    expect(page).toContain("lastSavedRef.current");
    expect(page).toContain("assessment.errors.rateLimit");
    expect(page).toContain("/rate limit|too many/i");
  });
});
