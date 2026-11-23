type PropertyFacts = { squareFootage?: number; bedrooms?: readonly unknown[]; baths?: number };
type WalkthroughFacts = { squareFootage?: number; bedrooms?: number; bathrooms?: number };

type FactSource = "property" | "walkthrough";
type Observation = { value: number; source: FactSource };
export type EstimateFact = Observation & { alternative?: Observation };
export type EstimateFacts = Partial<Record<"areaHundredths" | "bedrooms" | "bathHalves", EstimateFact>>;

export const estimateFactScales = { areaHundredths: 100, bedrooms: 1, bathHalves: 2 } as const;

function scaled(value: number | undefined, scale: number) {
  if (value === undefined || !Number.isFinite(value) || value < 0 || value * scale > 1e9) return undefined;
  const result = Math.round(value * scale);
  return Math.abs(result - value * scale) <= 1e-6 ? result : undefined;
}

function fact(current: number | undefined, observed: number | undefined, scale: number): EstimateFact | undefined {
  const property = scaled(current, scale);
  const walkthrough = scaled(observed, scale);
  if (property === undefined) {
    return walkthrough === undefined ? undefined : { value: walkthrough, source: "walkthrough" };
  }
  return {
    value: property,
    source: "property",
    ...(walkthrough !== undefined && walkthrough !== property
      ? { alternative: { value: walkthrough, source: "walkthrough" as const } } : {}),
  };
}

export function resolveEstimatePropertyFacts(property?: PropertyFacts | null, walkthrough?: WalkthroughFacts | null): EstimateFacts {
  return {
    areaHundredths: fact(property?.squareFootage, walkthrough?.squareFootage, estimateFactScales.areaHundredths),
    bedrooms: fact(property?.bedrooms?.length || undefined, walkthrough?.bedrooms, estimateFactScales.bedrooms),
    bathHalves: fact(property?.baths, walkthrough?.bathrooms, estimateFactScales.bathHalves),
  };
}
