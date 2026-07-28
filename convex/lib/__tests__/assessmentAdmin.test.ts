import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const SUPERADMIN_EMAIL = "dzbfyse@gmail.com";

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword("test-password-123");
  const definition = await t.mutation(api.assessments.prepare, {});
  return await t.run(async (ctx) => {
    const founder = await ctx.db.insert("users", {
      email: SUPERADMIN_EMAIL,
      passwordHash,
      name: "Founder",
      role: "affiliate",
      status: "active",
    });
    const owner = await ctx.db.insert("users", {
      email: "owner@example.com",
      passwordHash,
      name: "Owner",
      role: "owner",
      status: "active",
    });
    const now = Date.now();
    const completion = (score: number, soloOperator: boolean) => ({
      definitionId: definition._id,
      definitionVersion: 2,
      scoringVersion: 1,
      benchmarkCompatibilityKey: "v1",
      completedAt: now + score,
      operationsScore: score,
      maturityKey: score >= 60 ? "operating_reliably" : "building_consistency",
      confidenceKey: "high" as const,
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
      branchContext: { soloOperator, teamSize: soloOperator ? "solo" : "5_10" },
    });
    const attempt = async (score: number, soloOperator: boolean, reportVersion: number) =>
      await ctx.db.insert("assessmentAttempts", {
        definitionId: definition._id,
        definitionVersion: 2,
        scoringVersion: 1,
        reportContentVersion: reportVersion,
        benchmarkCompatibilityKey: "v1",
        status: "completed",
        audience: "public",
        responseLanguage: soloOperator ? "es" : "en",
        capabilityHash: `${score}`.repeat(64).slice(0, 64),
        browserKeyHash: `${score + 1}`.repeat(64).slice(0, 64),
        startedAt: now,
        lastActivityAt: now + score,
        completedAt: now + score,
        expiresAt: now + 60_000,
        completionSnapshot: completion(score, soloOperator),
        reportSnapshot: {
          scoringVersion: 1,
          reportContentVersion: reportVersion,
          generatedAt: now,
          payload: reportVersion === 2 ? {
            reportVersion: 2,
            executiveDiagnosis: {
              strongestArea: { sectionKey: "quality", title: { en: "Quality", es: "Calidad" } },
              priorityArea: { sectionKey: "scheduling", title: { en: "Scheduling", es: "Programación" } },
            },
          } : {
            reportVersion: 1,
            scorecard: [
              { sectionKey: "client", score: 80, title: { en: "Client", es: "Cliente" } },
              { sectionKey: "financial", score: 30, title: { en: "Financial", es: "Finanzas" } },
            ],
          },
        },
        roadmapSnapshot: {
          roadmapVersion: 1,
          generatedAt: now,
          payload: {
            roadmapVersion: 1,
            stageOrder: ["now"],
            stages: { now: [{ sectionKey: "scheduling", title: { en: "Scheduling", es: "Programación" } }] },
          },
        },
      });
    const first = await attempt(70, false, 2);
    const second = await attempt(60, true, 1);
    await ctx.db.insert("assessmentAttempts", {
      definitionId: definition._id,
      definitionVersion: 2,
      scoringVersion: 1,
      reportContentVersion: 2,
      benchmarkCompatibilityKey: "v1",
      status: "in_progress",
      audience: "public",
      responseLanguage: "en",
      capabilityHash: "a".repeat(64),
      browserKeyHash: "b".repeat(64),
      startedAt: now,
      lastActivityAt: now,
      expiresAt: now + 60_000,
    });
    await ctx.db.insert("assessmentProspects", {
      attemptId: first,
      normalizedEmail: "owner@example.com",
      firstName: "Avery",
      businessName: "Bright Clean",
      preferredLanguage: "en",
      deliveryAuthorizedAt: now,
      marketingConsent: false,
      scrubInterest: "interested",
      scrubInterestAt: now,
      deliveryStatus: "delivered",
      reportVersion: 2,
      roadmapVersion: 1,
      source: "assessment_report",
      createdAt: now,
      updatedAt: now,
    });
    return { founder, owner, first, second };
  });
}

async function login(t: ReturnType<typeof convexTest>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: "test-password-123" });
}

describe("assessment results admin", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("returns founder-only aggregate and recent-result summaries", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    const auth = await login(t, SUPERADMIN_EMAIL);
    const result = await t.query(api.queries.assessmentAdmin.getAssessmentResults, {
      userId: seeded.founder,
      sessionToken: auth.sessionToken,
    });
    expect(result.stats).toMatchObject({
      starts: 3,
      completions: 2,
      completionRate: 66.7,
      averageScore: 65,
      contactCaptures: 1,
      scrubInterest: 1,
      soloCompletions: 1,
      teamCompletions: 1,
    });
    expect(result.recent).toHaveLength(2);
    expect(result.recent.find((row) => row.attemptId === seeded.first)).toMatchObject({
      strongestArea: { sectionKey: "quality" },
      priorityArea: { sectionKey: "scheduling" },
      contact: { email: "owner@example.com", scrubInterest: "interested" },
    });
    expect(result.recent.find((row) => row.attemptId === seeded.second)).toMatchObject({
      strongestArea: { sectionKey: "client" },
      priorityArea: { sectionKey: "financial" },
    });
  });

  it("returns only frozen report detail and excludes assessment secrets and raw responses", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    const auth = await login(t, SUPERADMIN_EMAIL);
    const detail = await t.query(api.queries.assessmentAdmin.getAssessmentResultDetail, {
      userId: seeded.founder,
      sessionToken: auth.sessionToken,
      attemptId: seeded.first,
    });
    expect(detail).toMatchObject({
      summary: { operationsScore: 70 },
      report: { reportVersion: 2 },
      roadmap: { roadmapVersion: 1 },
    });
    expect(JSON.stringify(detail)).not.toMatch(/capabilityHash|browserKeyHash|qualitativeText|answerValue|tokenHash/);
  });

  it("rejects ordinary authenticated users", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    const auth = await login(t, "owner@example.com");
    await expect(t.query(api.queries.assessmentAdmin.getAssessmentResults, {
      userId: seeded.owner,
      sessionToken: auth.sessionToken,
    })).rejects.toThrow("Super admin session required");
  });
});
