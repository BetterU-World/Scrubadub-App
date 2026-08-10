import { describe, expect, it } from "vitest";
import { filterByManagerJobScope, getEffectiveManagerJobScope } from "./managerJobScope";

const jobs = [
  { id: "assigned", isAssignedToCurrentUser: true },
  { id: "company", isAssignedToCurrentUser: false },
];

describe("manager job scope", () => {
  it("defaults authorized managers to all jobs and supports canonical personal scope", () => {
    expect(filterByManagerJobScope(jobs, "all", true)).toEqual(jobs);
    expect(filterByManagerJobScope(jobs, "my", true)).toEqual([jobs[0]]);
  });

  it("contracts safely to personal jobs when all-jobs permission is absent or revoked", () => {
    expect(getEffectiveManagerJobScope("all", false)).toBe("my");
    expect(filterByManagerJobScope(jobs, "all", false)).toEqual([jobs[0]]);
  });
});
