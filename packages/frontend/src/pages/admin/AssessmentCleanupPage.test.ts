import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useAuth", () => ({ useAuth: vi.fn() }));
import { CleanupResultSummary, type CleanupDryRun, type CleanupResult } from "./AssessmentCleanupPage";
import { approvedIdsFromLatestDryRun, canConfirmAssessmentCleanup } from "./assessmentCleanupUi";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const report = (overrides: Partial<CleanupDryRun> = {}): CleanupDryRun => ({
  mode: "dry_run", totalAssessmentRecords: 2, deleteAllUnfinished: false, blocked: false, blockingReasons: [],
  meaningfulInProgressCandidateIds: [], remainingMeaningfulInProgressAttemptId: null,
  preservedIds: ["preserved" as any], proposedDeletionIds: ["delete-a" as any, "delete-b" as any],
  currentFunnel: { starts: 2, completed: 0, inProgress: 2, abandoned: 0 },
  projectedFunnel: { starts: 1, completed: 0, inProgress: 1, abandoned: 0 },
  projectedDeletionCounts: { assessmentAttempts: 1, assessmentResponses: 1, assessmentEvents: 1, assessmentProspects: 0, assessmentReportTokens: 0, rateLimits: 0 },
  attempts: [], ...overrides,
});

describe("temporary assessment cleanup superadmin UI", () => {
  it("keeps the direct route inside the existing superadmin gate", () => {
    const app = read("packages/frontend/src/App.tsx");
    const gate = app.indexOf("user?.isSuperadmin === true");
    const route = app.indexOf('path="/admin/assessment-cleanup"');
    expect(route).toBeGreaterThan(gate);
    expect(app).not.toContain('href="/admin/assessment-cleanup"');
    expect(read("packages/frontend/src/pages/admin/AssessmentCleanupPage.tsx")).toContain("if (!canAccess) return null");
  });

  it("requires an unblocked current dry run and the exact confirmation phrase", () => {
    expect(canConfirmAssessmentCleanup(report(), "DELETE_DUPLICATE_ASSESSMENTS", false)).toBe(true);
    expect(canConfirmAssessmentCleanup(report(), "delete_duplicate_assessments", false)).toBe(false);
    expect(canConfirmAssessmentCleanup(report({ blocked: true }), "DELETE_DUPLICATE_ASSESSMENTS", false)).toBe(false);
    expect(canConfirmAssessmentCleanup(report({ proposedDeletionIds: [] }), "DELETE_DUPLICATE_ASSESSMENTS", false)).toBe(false);
    expect(canConfirmAssessmentCleanup(report({ deleteAllUnfinished: true }), "DELETE_DUPLICATE_ASSESSMENTS", false)).toBe(false);
    expect(canConfirmAssessmentCleanup(report({ deleteAllUnfinished: true }), "DELETE_DUPLICATE_ASSESSMENTS", true)).toBe(true);
    expect(canConfirmAssessmentCleanup(null, "DELETE_DUPLICATE_ASSESSMENTS", false)).toBe(false);
  });

  it("takes approved IDs directly from the latest dry run without sharing its mutable array", () => {
    const current = report();
    const approved = approvedIdsFromLatestDryRun(current);
    expect(approved).toEqual(current.proposedDeletionIds);
    expect(approved).not.toBe(current.proposedDeletionIds);
  });

  it("renders the required evidence, JSON review, survivor selection, and completion result sections", () => {
    const page = read("packages/frontend/src/pages/admin/AssessmentCleanupPage.tsx");
    for (const text of [
      "Run assessment cleanup dry run", "Current funnel", "Projected funnel", "blockingReasons",
      "Preserved attempt IDs", "Meaningful in-progress candidates", "Proposed deletion IDs",
      "Projected dependent-record deletions", "Surviving assessments", "Proposed deletions",
      "Copyable dry-run JSON", "preserveInProgressAttemptId", "window.confirm",
      "Assessment cleanup completed", "Final funnel", "protectedRecordsDeleted",
      "Delete all unfinished assessments", "deleteAllUnfinished",
    ]) expect(page).toContain(text);
  });

  it("renders successful final totals, deletion counts, IDs, and protected-record confirmation", () => {
    const result: CleanupResult = {
      mode: "confirmed", deletedAttemptIds: ["deleted-1" as any], preservedAttemptIds: ["preserved-1" as any],
      deletedCounts: { assessmentAttempts: 1, assessmentResponses: 1, assessmentEvents: 1, assessmentProspects: 0, assessmentReportTokens: 0, rateLimits: 2 },
      finalFunnel: { starts: 4, completed: 3, inProgress: 1, abandoned: 0 },
      remainingMeaningfulInProgressAttemptId: "preserved-1" as any, protectedRecordsDeleted: false,
    };
    const markup = renderToStaticMarkup(createElement(CleanupResultSummary, { result }));
    expect(markup).toContain("Assessment cleanup completed");
    expect(markup).toContain("4 starts / 3 completed / 1 in progress / 0 abandoned");
    expect(markup).toContain("deleted-1");
    expect(markup).toContain("preserved-1");
    expect(markup).toContain("Protected attempts deleted:");
    expect(markup).toContain("No");
  });
});
