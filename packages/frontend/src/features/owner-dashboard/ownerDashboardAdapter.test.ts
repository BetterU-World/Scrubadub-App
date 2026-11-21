import { describe, expect, it } from "vitest";
import { adaptProductionOwnerDashboard } from "./ownerDashboardAdapter";

describe("adaptProductionOwnerDashboard", () => {
  it("preserves production loading without the legacy checklist", () => {
    const model = adaptProductionOwnerDashboard({
      firstName: "Maya",
      companyName: "BrightSide",
      stats: undefined,
    });

    expect(model.metrics.map((metric) => metric.value)).toEqual(["—", "—", "—", "—", "—", "—"]);
    expect(model.upcomingJobs).toEqual([]);
    expect(model.recentRedFlags).toEqual([]);
    expect(model.onboarding).toBeNull();
  });

});
