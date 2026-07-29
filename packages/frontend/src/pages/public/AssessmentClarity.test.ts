import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("assessment question clarity", () => {
  it("shows global guidance and only targeted single-choice helpers", () => {
    const page = read("packages/frontend/src/pages/public/OperationsAssessmentPage.tsx");
    expect(page).toContain("assessment.clarity.globalGuidance");
    expect(page).toContain('"growth.primary_objective": "assessment.clarity.primaryGoal"');
    expect(page).toContain('"growth.bottleneck": "assessment.clarity.greatestImpact"');
    expect(page).toContain('"scheduling.primary_method": "assessment.clarity.mostOften"');
    expect(page).toContain('"business.primary_model": "assessment.clarity.closest"');
    expect(page).toContain('aria-describedby={[clarityHelperKey');
  });

  it("keeps clarity copy in English and Spanish parity without changing the frozen definition", () => {
    const en = JSON.parse(read("packages/frontend/src/i18n/en/common.json"));
    const es = JSON.parse(read("packages/frontend/src/i18n/es/common.json"));
    expect(Object.keys(es.assessment.clarity).sort()).toEqual(Object.keys(en.assessment.clarity).sort());
    expect(read("convex/lib/assessmentDefinition.ts")).not.toContain("assessment.clarity");
  });
});
