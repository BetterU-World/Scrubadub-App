import { describe, expect, it } from "vitest";
import { matchesDateRange, sortJobs } from "./jobBrowsing";

const oldJob = { _id: "old", _creationTime: 1, scheduledDate: "2026-08-12", startTime: "10:00", approvedAt: 20 };
const newJob = { _id: "new", _creationTime: 2, scheduledDate: "2026-08-11", startTime: "11:00", startedAt: 10 };

describe("job browsing", () => {
  it("supports deterministic created, scheduled, and updated sorts", () => {
    expect(sortJobs([oldJob, newJob], "created_desc").map((j) => j._id)).toEqual(["new", "old"]);
    expect(sortJobs([oldJob, newJob], "created_asc").map((j) => j._id)).toEqual(["old", "new"]);
    expect(sortJobs([oldJob, newJob], "soonest").map((j) => j._id)).toEqual(["new", "old"]);
    expect(sortJobs([oldJob, newJob], "updated_desc").map((j) => j._id)).toEqual(["old", "new"]);
  });

  it("matches All, Today, and the current Monday-to-Sunday week", () => {
    const now = new Date(2026, 7, 12, 12);
    expect(matchesDateRange("1999-01-01", "all", now)).toBe(true);
    expect(matchesDateRange("2026-08-12", "today", now)).toBe(true);
    expect(matchesDateRange("2026-08-10", "week", now)).toBe(true);
    expect(matchesDateRange("2026-08-17", "week", now)).toBe(false);
  });
});
