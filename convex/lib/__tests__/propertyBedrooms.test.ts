import { describe, expect, it } from "vitest";
import { deriveBedroomAggregates, normalizeBedrooms, type PropertyBedroom } from "../propertyBedrooms";

const profile: PropertyBedroom[] = [{
  id: "primary",
  label: " Primary ",
  beds: [{ id: "queen", type: "standard_bed", size: "queen", quantity: 2, sheetSets: 1, sleepingPillows: 2 }],
}, {
  id: "bunks",
  label: "Bunk Room",
  beds: [{ id: "twins", type: "bunk_bed", size: "twin", quantity: 3, sheetSets: 2, sleepingPillows: 1 }],
}];

describe("property bedroom profiles", () => {
  it("normalizes labels and derives compatibility totals per sleeping surface", () => {
    const normalized = normalizeBedrooms(profile)!;
    expect(normalized[0].label).toBe("Primary");
    expect(deriveBedroomAggregates(normalized)).toEqual({ beds: 2, sheetSets: 8, pillowCount: 7 });
  });

  it("keeps an empty profile in legacy aggregate mode", () => {
    expect(normalizeBedrooms([])).toBeUndefined();
  });

  it("rejects duplicate labels and empty bedrooms", () => {
    expect(() => normalizeBedrooms([...profile, { id: "duplicate", label: "primary", beds: profile[0].beds }])).toThrow("labels must be unique");
    expect(() => normalizeBedrooms([{ id: "empty", label: "Empty", beds: [] }])).toThrow("needs at least one bed");
  });

  it("rejects zero quantities and negative linen counts", () => {
    expect(() => normalizeBedrooms([{ ...profile[0], beds: [{ ...profile[0].beds[0], quantity: 0 }] }])).toThrow("quantity");
    expect(() => normalizeBedrooms([{ ...profile[0], beds: [{ ...profile[0].beds[0], sheetSets: -1 }] }])).toThrow("sheet sets");
  });
});
