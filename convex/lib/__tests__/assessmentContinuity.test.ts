import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashTokenForLookup } from "../tokenHash";
const modules = import.meta.glob("../../**/*.ts");
const backend = () => convexTest(schema, modules);
const token = (c: string) => c.repeat(64);
async function seed(t: any, cap = token("a")) {
  const definition = await t.mutation((api as any).assessments.prepare, {});
  const now = Date.now();
  const attemptId = await t.run(async (ctx: any) =>
    ctx.db.insert("assessmentAttempts", {
      definitionId: definition._id,
      definitionVersion: 2,
      scoringVersion: 1,
      reportContentVersion: 1,
      benchmarkCompatibilityKey: "v1",
      status: "completed",
      audience: "public",
      responseLanguage: "en",
      capabilityHash: await hashTokenForLookup(cap),
      browserKeyHash: "b".repeat(64),
      startedAt: now,
      lastActivityAt: now,
      completedAt: now,
      expiresAt: now - 1,
      completionSnapshot: {
        definitionId: definition._id,
        definitionVersion: 2,
        scoringVersion: 1,
        benchmarkCompatibilityKey: "v1",
        completedAt: now,
        operationsScore: 70,
        maturityKey: "operating_reliably",
        confidenceKey: "high",
        confidenceMetadata: {
          coverageScore: 100,
          reasonKeys: [],
          categoryCoverage: [],
          uncertainResponseCount: 0,
          thinSectionKeys: [],
          contradictoryPatternCount: 0,
        },
        sectionResults: [],
        applicableSectionIds: [],
        applicableQuestionCount: 0,
        answeredScoredQuestionCount: 0,
        evidenceIds: [],
        branchContext: { soloOperator: true },
      },
      reportSnapshot: {
        scoringVersion: 1,
        reportContentVersion: 1,
        generatedAt: now,
        payload: { reportVersion: 1 },
      },
      roadmapSnapshot: {
        roadmapVersion: 1,
        generatedAt: now,
        payload: { roadmapVersion: 1, stageOrder: [], stages: {} },
      },
    }),
  );
  return { attemptId, cap };
}
describe("assessment continuity", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-pepper";
  });
  it("creates one attempt prospect, defaults consent false, and persists only a token hash", async () => {
    const t = backend(),
      s = await seed(t);
    const args = {
      attemptId: s.attemptId,
      capability: s.cap,
      email: " Owner@Example.com ",
      language: "en" as const,
      marketingConsent: false,
      token: token("c"),
    };
    await t.mutation(
      (internal as any).assessmentContinuity.prepareDelivery,
      args,
    );
    await t.mutation((internal as any).assessmentContinuity.prepareDelivery, {
      ...args,
      token: token("d"),
    });
    const prospects = await t.run((c: any) =>
      c.db.query("assessmentProspects").collect(),
    );
    const tokens = await t.run((c: any) =>
      c.db.query("assessmentReportTokens").collect(),
    );
    expect(prospects).toHaveLength(1);
    expect(prospects[0]).toMatchObject({
      normalizedEmail: "owner@example.com",
      marketingConsent: false,
      scrubInterest: "unspecified",
    });
    expect(tokens).toHaveLength(2);
    expect(
      tokens.every(
        (x: any) => x.tokenHash !== token("c") && x.tokenHash !== token("d"),
      ),
    ).toBe(true);
    expect(tokens[0].revokedAt).toBeTypeOf("number");
  });
  it("allows one email across attempts and records granted consent", async () => {
    const t = backend(),
      a = await seed(t, token("a")),
      b = await seed(t, token("e"));
    for (const [s, n] of [
      [a, "f"],
      [b, "1"],
    ] as any[])
      await t.mutation((internal as any).assessmentContinuity.prepareDelivery, {
        attemptId: s.attemptId,
        capability: s.cap,
        email: "same@example.com",
        language: "es",
        marketingConsent: true,
        token: token(n),
      });
    const rows = await t.run((c: any) =>
      c.db.query("assessmentProspects").collect(),
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.every((x: any) => x.marketingConsentAt && x.consentVersion),
    ).toBe(true);
  });
  it("rejects invalid and oversized identity input", async () => {
    const t = backend(),
      s = await seed(t);
    const base = {
      attemptId: s.attemptId,
      capability: s.cap,
      language: "en",
      marketingConsent: false,
      token: token("2"),
    };
    await expect(
      t.mutation((internal as any).assessmentContinuity.prepareDelivery, {
        ...base,
        email: "invalid",
      }),
    ).rejects.toThrow("valid email");
    await expect(
      t.mutation((internal as any).assessmentContinuity.prepareDelivery, {
        ...base,
        email: "a@b.com",
        firstName: "x".repeat(81),
      }),
    ).rejects.toThrow("shorten");
  });
  it("opens only the intended frozen report, rotates tokens, and safely rejects invalid or expired links", async () => {
    const t = backend(),
      s = await seed(t);
    await t.mutation((internal as any).assessmentContinuity.prepareDelivery, {
      attemptId: s.attemptId,
      capability: s.cap,
      email: "a@b.com",
      language: "en",
      marketingConsent: false,
      token: token("3"),
    });
    expect(
      await t.mutation((api as any).assessmentContinuity.openReturnLink, {
        token: token("3"),
      }),
    ).toMatchObject({
      report: { reportVersion: 1 },
      roadmap: { roadmapVersion: 1 },
    });
    await expect(
      t.mutation((api as any).assessmentContinuity.openReturnLink, {
        token: "bad",
      }),
    ).rejects.toThrow("invalid or expired");
    const row = await t.run((c: any) =>
      c.db.query("assessmentReportTokens").first(),
    );
    await t.run((c: any) => c.db.patch(row._id, { expiresAt: Date.now() - 1 }));
    await expect(
      t.mutation((api as any).assessmentContinuity.openReturnLink, {
        token: token("3"),
      }),
    ).rejects.toThrow("invalid or expired");
  });
  it("records SCRUB interest separately and deduplicates safe funnel events", async () => {
    const t = backend(),
      s = await seed(t);
    await t.mutation((internal as any).assessmentContinuity.prepareDelivery, {
      attemptId: s.attemptId,
      capability: s.cap,
      email: "a@b.com",
      language: "en",
      marketingConsent: false,
      token: token("4"),
    });
    await t.mutation((api as any).assessmentContinuity.submitInterest, {
      attemptId: s.attemptId,
      capability: s.cap,
      interested: true,
    });
    for (let i = 0; i < 2; i++)
      await t.mutation((api as any).assessmentContinuity.recordEvent, {
        attemptId: s.attemptId,
        eventKey: "report_viewed",
        deduplicationKey: `${s.attemptId}:report`,
        language: "en",
        metadata: { reportVersion: 1 },
      });
    expect(
      (
        await t.run((c: any) => c.db.query("assessmentEvents").collect())
      ).filter((event: any) => event.eventKey === "report_viewed"),
    ).toHaveLength(1);
    expect(
      (await t.run((c: any) => c.db.query("assessmentProspects").first()))
        .scrubInterest,
    ).toBe("interested");
  });
});
