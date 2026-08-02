import { describe, expect, it } from "vitest";
import { adaptProductionOwnerDashboard } from "./ownerDashboardAdapter";

describe("adaptProductionOwnerDashboard", () => {
  it("preserves production loading and onboarding behavior", () => {
    const model = adaptProductionOwnerDashboard({
      firstName: "Maya",
      companyName: "BrightSide",
      stats: undefined,
      manualRead: false,
    });

    expect(model.metrics.map((metric) => metric.value)).toEqual(["—", "—", "—", "—", "—", "—"]);
    expect(model.upcomingJobs).toEqual([]);
    expect(model.recentRedFlags).toEqual([]);
    expect(model.onboarding?.completed).toBe(0);
  });

  it("hides onboarding after the production manual-read state is set", () => {
    const model = adaptProductionOwnerDashboard({
      firstName: "Maya",
      companyName: "BrightSide",
      stats: undefined,
      manualRead: true,
    });

    expect(model.onboarding).toBeNull();
  });
});
