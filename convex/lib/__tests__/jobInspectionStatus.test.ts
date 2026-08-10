import { describe, expect, it } from "vitest";
import { deriveJobInspectionStatus } from "../jobInspectionStatus";

describe("job inspection presentation precedence", () => {
  it("lets final canonical states outrank intermediate inspection copy", () => {
    expect(deriveJobInspectionStatus({ status: "submitted", inspectionCycleOpen: false }, 1)).toBe("submitted");
    expect(deriveJobInspectionStatus({ status: "submitted", inspectionCycleOpen: true }, 1)).toBe("reinspection_requested");
    expect(deriveJobInspectionStatus({ status: "approved", inspectionCycleOpen: true }, 1)).toBe("none");
    expect(deriveJobInspectionStatus({ status: "cancelled", inspectionCycleOpen: false }, 1)).toBe("none");
  });
});
