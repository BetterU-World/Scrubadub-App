import { describe, expect, it } from "vitest";
import { aggregateAssessmentAnalytics } from "../assessmentAnalytics";

describe("assessment analytics aggregation", () => {
  it("calculates duration, abandonment, device, continuity, and conversion without raw responses", () => {
    const attempts = [
      { _id: "completed-a", status: "completed" as const, startedAt: 1_000, completedAt: 61_000 },
      { _id: "completed-b", status: "completed" as const, startedAt: 2_000, completedAt: 122_000 },
      { _id: "abandoned", status: "abandoned" as const, startedAt: 3_000 },
      { _id: "active", status: "in_progress" as const, startedAt: 4_000 },
    ];
    const events = [
      { attemptId: "completed-a", eventKey: "assessment_started", createdAt: 1_000, metadata: { deviceCategory: "mobile" as const, sessionId: "aaaaaaaaaaaaaaaa" } },
      { attemptId: "completed-b", eventKey: "assessment_started", createdAt: 2_000, metadata: { deviceCategory: "desktop" as const, sessionId: "bbbbbbbbbbbbbbbb" } },
      { attemptId: "abandoned", eventKey: "assessment_progress", createdAt: 5_000, metadata: { sectionKey: "growth", questionKey: "growth.bottleneck" } },
      { attemptId: "completed-a", eventKey: "assessment_resumed", createdAt: 9_000, metadata: { sessionId: "cccccccccccccccc" } },
      { attemptId: "completed-a", eventKey: "assessment_resumed", createdAt: 10_000, metadata: { sessionId: "cccccccccccccccc" } },
      { attemptId: "completed-a", eventKey: "secure_return_opened", createdAt: 70_000 },
      { attemptId: "completed-a", eventKey: "scrub_support_cta_clicked", createdAt: 71_000 },
      { attemptId: "completed-a", eventKey: "scrub_support_cta_clicked", createdAt: 72_000 },
      { attemptId: "completed-a", eventKey: "scrub_interest_submitted", createdAt: 73_000 },
    ];

    const result = aggregateAssessmentAnalytics(attempts, events, Date.UTC(2026, 6, 28));
    expect(result.funnel).toMatchObject({ starts: 4, completions: 2, abandoned: 1, inProgress: 1, completionRate: 50 });
    expect(result.completionBehavior).toMatchObject({ averageDurationMs: 90_000, medianDurationMs: 90_000 });
    expect(result.completionBehavior.abandonmentByQuestion[0]).toEqual({ key: "growth.bottleneck", count: 1 });
    expect(result.devices).toEqual([
      { deviceCategory: "mobile", starts: 1, completions: 1, completionRate: 100 },
      { deviceCategory: "desktop", starts: 1, completions: 1, completionRate: 100 },
    ]);
    expect(result.continuity).toMatchObject({ resumedAttempts: 1, completedResumed: 1, completedResumeRate: 50, secureReturnAttempts: 1, averageSessionsPerCompleted: 1.5 });
    expect(result.conversion).toMatchObject({ ctaClickAttempts: 1, ctaClickThroughRate: 50, interestSubmissions: 1, interestSubmissionRate: 50 });
    expect(result.funnel.starts).toBe(result.funnel.completions + result.funnel.inProgress + result.funnel.abandoned);
  });

  it("partitions every assessment record exactly once even when legacy completion data is incomplete", () => {
    const result = aggregateAssessmentAnalytics([
      { _id: "completed", status: "completed", startedAt: 1_000 },
      { _id: "active", status: "in_progress", startedAt: 2_000 },
      { _id: "abandoned", status: "abandoned", startedAt: 3_000 },
      { _id: "deleted", status: "deleted", startedAt: 4_000 },
    ], []);

    expect(result.funnel).toMatchObject({ starts: 3, completions: 1, inProgress: 1, abandoned: 1 });
    expect(result.funnel.starts).toBe(result.funnel.completions + result.funnel.inProgress + result.funnel.abandoned);
    expect(result.completionBehavior.averageDurationMs).toBeNull();
  });

  it("moves an existing record from in progress to completed without adding a start", () => {
    const inProgress = aggregateAssessmentAnalytics([
      { _id: "same-attempt", status: "in_progress", startedAt: 1_000 },
    ], []);
    const completed = aggregateAssessmentAnalytics([
      { _id: "same-attempt", status: "completed", startedAt: 1_000, completedAt: 2_000 },
    ], []);

    expect(inProgress.funnel).toMatchObject({ starts: 1, completions: 0, inProgress: 1, abandoned: 0 });
    expect(completed.funnel).toMatchObject({ starts: 1, completions: 1, inProgress: 0, abandoned: 0 });
  });
});
