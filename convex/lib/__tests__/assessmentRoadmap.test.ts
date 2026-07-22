import { describe, expect, it } from "vitest";
import { generateRoadmapSnapshot, ROADMAP_RULES } from "../assessmentRoadmap";
const L = (x: string) => ({ en: x, es: x });
const f = (sectionKey: string, n: number) => ({
  id: `opportunity.${sectionKey}.v1`,
  sectionKey,
  title: L(sectionKey),
  observation: L("needs structure"),
  whyItMatters: L("matters operationally"),
  evidenceReferences: [`${sectionKey}.${n}`],
  roadmapCompatibilityKeys: [sectionKey],
});
const report = (o: any = {}) => ({
  reportVersion: 1,
  definitionVersion: 2,
  scoringVersion: 1,
  maturityKey: "building_consistency",
  confidenceKey: "high",
  branchContext: { soloOperator: false, teamSize: "5_10" },
  opportunities: [
    f("quality", 1),
    f("scheduling", 2),
    f("financial", 3),
    f("team", 4),
    f("client", 5),
    f("growth", 6),
  ],
  strengths: [f("business", 7), f("financial", 8)],
  ...o,
});
describe("assessment roadmap", () => {
  it("is deterministic and orders foundational materiality first", () => {
    const a = generateRoadmapSnapshot(report(), 10);
    expect(a).toEqual(generateRoadmapSnapshot(report(), 10));
    expect(a.stages.now[0].sectionKey).toBe("scheduling");
  });
  it("places dependencies after prerequisites and never makes Now depend on later stages", () => {
    const r = generateRoadmapSnapshot(report(), 1);
    const schedule = r.stages.now.find((x) => x.sectionKey === "scheduling");
    const quality = r.stages.next.find((x) => x.sectionKey === "quality");
    expect(schedule).toBeTruthy();
    expect(quality.dependencyKeys).toEqual(["scheduling"]);
    expect(r.stages.now.every((x) => x.dependencyKeys.length === 0)).toBe(true);
  });
  it("declares an acyclic dependency graph and unique deduplication keys", () => {
    const keys = new Set(ROADMAP_RULES.map((x) => x.deduplicationKey));
    expect(keys.size).toBe(ROADMAP_RULES.length);
    for (const rule of ROADMAP_RULES)
      expect(rule.dependencyKey).not.toBe(rule.sectionKey);
  });
  it("omits hidden team work and limits sparse confidence", () => {
    const r = generateRoadmapSnapshot(
      report({
        confidenceKey: "limited",
        branchContext: { soloOperator: true, teamSize: "solo" },
      }),
      1,
    );
    expect(
      Object.values(r.stages)
        .flat()
        .some((x: any) => x.sectionKey === "team"),
    ).toBe(false);
    expect(
      r.stages.now.length + r.stages.next.length + r.stages.later.length,
    ).toBeLessThanOrEqual(2);
    expect(r.stages.maintain).toHaveLength(0);
  });
  it("uses measured moderate language and direct high-confidence guidance", () => {
    expect(
      generateRoadmapSnapshot(report(), 1).stages.now[0].currentState.en,
    ).not.toContain("suggests this priority");
    expect(
      generateRoadmapSnapshot(report({ confidenceKey: "moderate" }), 1).stages
        .now[0].currentState.en,
    ).toContain("suggests this priority");
  });
  it("varies foundational and advanced guidance by stable maturity key", () => {
    expect(
      generateRoadmapSnapshot(
        report({ maturityKey: "establishing_foundations" }),
        1,
      ).stages.now[0].recommendedActions[0].en,
    ).toContain("minimum standard");
    expect(
      generateRoadmapSnapshot(
        report({ maturityKey: "operationally_advanced" }),
        1,
      ).stages.now[0].recommendedActions[0].en,
    ).toContain("leading indicator");
  });
  it("creates Maintain only from supported strengths", () => {
    const r = generateRoadmapSnapshot(report({ strengths: [] }), 1);
    expect(r.stages.maintain).toHaveLength(0);
    expect(
      generateRoadmapSnapshot(report(), 1).stages.maintain.length,
    ).toBeGreaterThan(0);
  });
  it("keeps operational actions ahead of optional SCRUB support", () => {
    const item = Object.values(generateRoadmapSnapshot(report(), 1).stages)
      .flat()
      .find((x: any) => x.scrubSupport) as any;
    expect(item.recommendedActions.length).toBeGreaterThan(0);
    expect(item.successIndicators.length).toBeGreaterThan(0);
    expect(item.scrubSupport.en).toContain("can support");
  });
});
