import { describe, expect, it } from "vitest";
import { generateReportSnapshot, scoreBand, SCORE_BANDS } from "../assessmentReport";

const section = (sectionKey: string, score: number, positive = [sectionKey + ".positive"], opportunity = [sectionKey + ".opportunity"]) => ({ sectionKey, score, applicableWeight: 10, positiveEvidenceIds: positive, opportunityEvidenceIds: opportunity, roadmapCompatibilityKeys: [sectionKey] });
const completion = (overrides: any = {}) => ({
  definitionVersion: 2, scoringVersion: 1, benchmarkCompatibilityKey: "v1", completedAt: 1,
  operationsScore: 65, maturityKey: "operating_reliably", confidenceKey: "high" as const,
  confidenceMetadata: { reasonKeys: [] }, branchContext: { soloOperator: false, teamSize: "5_10" },
  sectionResults: [section("business", 80), section("scheduling", 90), section("team", 70), section("quality", 30), section("client", 55), section("financial", 75), section("growth", 45)],
  ...overrides,
});

describe("assessment report generation", () => {
  it("is deterministic for identical frozen completion snapshots", () => {
    expect(generateReportSnapshot(completion(), 100)).toEqual(generateReportSnapshot(completion(), 100));
  });
  it("requires configured evidence for strengths and opportunities", () => {
    const report = generateReportSnapshot(completion({ sectionResults: [section("quality", 90, []), section("client", 20, [], [])] }), 1);
    expect(report.strengths).toHaveLength(0); expect(report.opportunities).toHaveLength(0);
  });
  it("omits hidden team findings and scorecard entries for solo operators", () => {
    const report = generateReportSnapshot(completion({ branchContext: { soloOperator: true, teamSize: "solo" } }), 1);
    expect(report.scorecard.map((item) => item.sectionKey)).not.toContain("team");
    expect([...report.strengths, ...report.opportunities].map((item) => item.sectionKey)).not.toContain("team");
  });
  it("uses confidence-aware language and fewer limited-confidence findings", () => {
    const high = generateReportSnapshot(completion(), 1);
    const moderate = generateReportSnapshot(completion({ confidenceKey: "moderate" }), 1);
    const limited = generateReportSnapshot(completion({ confidenceKey: "limited" }), 1);
    expect(high.executiveSummary[0].en).toContain("strong basis");
    expect(moderate.executiveSummary[0].en).toContain("suggests");
    expect(limited.executiveSummary[0].en).toContain("limited or uncertain");
    expect(limited.strengths.length).toBeLessThanOrEqual(2); expect(limited.opportunities.length).toBeLessThanOrEqual(2);
  });
  it("builds a deterministic diagnosis from frozen report facts", () => {
    const report = generateReportSnapshot(completion(), 1);
    expect(report.executiveDiagnosis.headline.en).toContain("Scheduling and Organization");
    expect(report.executiveDiagnosis.headline.en).toContain("Quality and Consistency");
    expect(report.executiveDiagnosis.strongestArea.sectionKey).toBe("scheduling");
    expect(report.executiveDiagnosis.priorityArea.sectionKey).toBe("quality");
    expect(report.executiveDiagnosis.summary.en).toContain("team-based operation");
  });
  it("uses branch-aware diagnosis language without exposing private responses", () => {
    const report = generateReportSnapshot(completion({ branchContext: { soloOperator: true, teamSize: "solo" } }), 1);
    expect(report.executiveDiagnosis.summary.en).toContain("solo operation");
    expect(JSON.stringify(report.executiveDiagnosis)).not.toContain("5_10");
  });
  it("selects priorities deterministically without duplicate section findings", () => {
    const report = generateReportSnapshot(completion(), 1);
    expect(report.strengths[0].sectionKey).toBe("scheduling");
    expect(report.opportunities[0].sectionKey).toBe("quality");
    expect(new Set(report.strengths.map((item) => item.sectionKey)).size).toBe(report.strengths.length);
  });
  it("covers every score with exactly one interpretation band", () => {
    for (let score = 0; score <= 100; score++) {
      expect(SCORE_BANDS.filter((band) => score >= band.min && score <= band.max)).toHaveLength(1);
      expect(scoreBand(score)).toBeTruthy();
    }
  });
  it("contains no benchmark, percentile, formulas, or participant free text", () => {
    const serialized = JSON.stringify(generateReportSnapshot(completion({ reflection: "<script>private text</script>" }), 1));
    expect(serialized).not.toMatch(/percentile|formula|private text|<script>/i);
  });
});
