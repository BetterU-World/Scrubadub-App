import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("assessment results admin", () => {
  it("keeps list and detail routes behind the existing superadmin gate", () => {
    const app = read("packages/frontend/src/App.tsx");
    const gate = app.indexOf("user?.isSuperadmin === true");
    const detail = app.indexOf('path="/admin/assessments/:attemptId"');
    const list = app.indexOf('path="/admin/assessments"');
    expect(gate).toBeGreaterThan(-1);
    expect(detail).toBeGreaterThan(gate);
    expect(list).toBeGreaterThan(detail);
    expect(app).toContain("AssessmentResultDetailPage");
    expect(app).toContain("AssessmentResultsPage");
  });

  it("uses verified superadmin queries and does not request raw assessment responses", () => {
    const backend = read("convex/queries/assessmentAdmin.ts");
    expect(backend).toContain("requireSuperadminSession");
    expect(backend).toContain("getAssessmentResults");
    expect(backend).toContain("getAssessmentResultDetail");
    expect(backend).toContain("aggregateAssessmentAnalytics");
    expect(backend).toContain('query("assessmentEvents")');
    expect(backend).not.toContain('query("assessmentResponses")');
    expect(backend).not.toContain("capabilityHash:");
    expect(backend).not.toContain("browserKeyHash:");
    expect(backend).not.toContain("qualitativeText:");
  });

  it("provides responsive result cards, an accessible table, and frozen report detail", () => {
    const list = read("packages/frontend/src/pages/admin/AssessmentResultsPage.tsx");
    const detail = read("packages/frontend/src/pages/admin/AssessmentResultDetailPage.tsx");
    expect(list).toContain("md:hidden");
    expect(list).toContain("TableScrollRegion");
    expect(list).toContain("resultsTableLabel");
    expect(list).toContain("searchPlaceholder");
    expect(list).toContain("analytics.funnel");
    expect(list).toContain("analytics.completionBehavior");
    expect(list).toContain("analytics.resumeReturn");
    expect(list).toContain("analytics.scrubInterest");
    expect(detail).toContain("showContinuity={false}");
    expect(detail).toContain("assessmentAdmin.privacyNote");
  });

  it("keeps the complete assessment-admin catalogs in English and Spanish parity", () => {
    const en = JSON.parse(read("packages/frontend/src/i18n/en/common.json")).assessmentAdmin;
    const es = JSON.parse(read("packages/frontend/src/i18n/es/common.json")).assessmentAdmin;
    const keys = (value: any, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === "object" ? keys(child, path) : [path];
    });
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });
});
