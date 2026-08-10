import { describe, expect, it } from "vitest";
import { getJobTiming, normalizePauseNote } from "../jobTiming";

describe("job timing", () => {
  it("treats legacy jobs as elapsed active time", () => {
    expect(getJobTiming({ startedAt: 1_000, completedAt: 61_000 })).toEqual({ elapsedMs: 60_000, totalPausedMs: 0, activeMs: 60_000, currentPauseMs: 0 });
  });

  it("excludes multiple closed pauses using stored duration", () => {
    const result = getJobTiming({ startedAt: 0, completedAt: 100_000, pauseHistory: [{ pausedAt: 10_000, resumedAt: 20_000, durationMs: 10_000 }, { pausedAt: 50_000, resumedAt: 70_000, durationMs: 20_000 }] });
    expect(result).toEqual({ elapsedMs: 100_000, totalPausedMs: 30_000, activeMs: 70_000, currentPauseMs: 0 });
  });

  it("excludes an open pause and remains correct after refresh", () => {
    const result = getJobTiming({ startedAt: 1_000, currentPauseStartedAt: 31_000, pauseHistory: [{ pausedAt: 31_000 }] }, 61_000);
    expect(result).toEqual({ elapsedMs: 60_000, totalPausedMs: 30_000, activeMs: 30_000, currentPauseMs: 30_000 });
  });

  it("uses cancellation as the terminal timing boundary", () => {
    const job = { startedAt: 1_000, cancelledAt: 61_000, pauseHistory: [{ pausedAt: 31_000, resumedAt: 41_000, durationMs: 10_000 }] };
    expect(getJobTiming(job, 3_600_000)).toEqual({ elapsedMs: 60_000, totalPausedMs: 10_000, activeMs: 50_000, currentPauseMs: 0 });
  });

  it("uses an administrative stop as a non-lifecycle timing boundary", () => {
    expect(getJobTiming({ startedAt: 1_000, timerStoppedAt: 61_000 }, 120_000)).toEqual({ elapsedMs: 60_000, totalPausedMs: 0, activeMs: 60_000, currentPauseMs: 0 });
  });

  it("requires and trims Other notes", () => {
    expect(() => normalizePauseNote("other", "   ")).toThrow("required");
    expect(normalizePauseNote("other", "  Door code issue  ")).toBe("Door code issue");
  });
});
