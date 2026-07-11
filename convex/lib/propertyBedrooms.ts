import { v } from "convex/values";

export const bedTypeValidator = v.union(
  v.literal("standard_bed"),
  v.literal("bunk_bed"),
  v.literal("sofa_bed"),
  v.literal("futon"),
  v.literal("daybed"),
  v.literal("crib"),
  v.literal("rollaway"),
  v.literal("other")
);

export const bedSizeValidator = v.union(
  v.literal("twin"),
  v.literal("twin_xl"),
  v.literal("full"),
  v.literal("queen"),
  v.literal("king"),
  v.literal("california_king"),
  v.literal("crib"),
  v.literal("custom"),
  v.literal("not_applicable")
);

export const bedroomsValidator = v.array(v.object({
  id: v.string(),
  label: v.string(),
  beds: v.array(v.object({
    id: v.string(),
    type: bedTypeValidator,
    size: bedSizeValidator,
    quantity: v.number(),
    sheetSets: v.number(),
    sleepingPillows: v.number(),
  })),
}));

export type PropertyBedroom = {
  id: string;
  label: string;
  beds: Array<{
    id: string;
    type: "standard_bed" | "bunk_bed" | "sofa_bed" | "futon" | "daybed" | "crib" | "rollaway" | "other";
    size: "twin" | "twin_xl" | "full" | "queen" | "king" | "california_king" | "crib" | "custom" | "not_applicable";
    quantity: number;
    sheetSets: number;
    sleepingPillows: number;
  }>;
};

export function normalizeBedrooms(input: PropertyBedroom[] | undefined) {
  if (!input?.length) return undefined;
  if (input.length > 50) throw new Error("A property can have at most 50 bedrooms");

  const bedroomIds = new Set<string>();
  const labels = new Set<string>();
  const bedIds = new Set<string>();
  let totalBeds = 0;

  const bedrooms = input.map((bedroom) => {
    const id = bedroom.id.trim();
    const label = bedroom.label.trim();
    if (!id || bedroomIds.has(id)) throw new Error("Bedroom IDs must be unique");
    if (!label) throw new Error("Every bedroom needs a label");
    const normalizedLabel = label.toLocaleLowerCase();
    if (labels.has(normalizedLabel)) throw new Error("Bedroom labels must be unique");
    if (!bedroom.beds.length) throw new Error(`${label} needs at least one bed`);
    if (bedroom.beds.length > 20) throw new Error(`${label} can have at most 20 beds`);
    bedroomIds.add(id);
    labels.add(normalizedLabel);
    totalBeds += bedroom.beds.length;

    const beds = bedroom.beds.map((bed) => {
      const bedId = bed.id.trim();
      if (!bedId || bedIds.has(bedId)) throw new Error("Bed IDs must be unique");
      bedIds.add(bedId);
      for (const [name, value, max] of [
        ["quantity", bed.quantity, 100],
        ["sheet sets", bed.sheetSets, 1000],
        ["sleeping pillows", bed.sleepingPillows, 1000],
      ] as const) {
        const min = name === "quantity" ? 1 : 0;
        if (!Number.isInteger(value) || value < min || value > max) {
          throw new Error(`${label}: ${name} must be a whole number from ${min} to ${max}`);
        }
      }
      return { ...bed, id: bedId };
    });
    return { id, label, beds };
  });

  if (totalBeds > 200) throw new Error("A property can have at most 200 bed configurations");
  return bedrooms;
}

export function deriveBedroomAggregates(bedrooms: PropertyBedroom[]) {
  return {
    beds: bedrooms.length,
    sheetSets: bedrooms.reduce((total, room) => total + room.beds.reduce((sum, bed) => sum + bed.quantity * bed.sheetSets, 0), 0),
    pillowCount: bedrooms.reduce((total, room) => total + room.beds.reduce((sum, bed) => sum + bed.quantity * bed.sleepingPillows, 0), 0),
  };
}
