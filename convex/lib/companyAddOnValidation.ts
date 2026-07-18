import type { AddOnPricingMethod } from "./companyAddOnPresets";

export const MAX_ADD_ON_PRICE_CENTS = 100_000_000;

function optionalTrimmed(value: string | undefined, max: number, label: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return trimmed;
}

export function validateCompanyAddOnInput(input: {
  name: string;
  description?: string;
  pricingMethod: AddOnPricingMethod;
  priceCents: number;
  unitLabel?: string;
  estimatedDurationMinutes?: number;
  internalNotes?: string;
  isActive: boolean;
  isPublic: boolean;
}) {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new Error("Name must be between 1 and 80 characters");
  if (!Number.isSafeInteger(input.priceCents) || input.priceCents <= 0 || input.priceCents > MAX_ADD_ON_PRICE_CENTS) {
    throw new Error(`Price must be a positive whole number of cents no greater than ${MAX_ADD_ON_PRICE_CENTS}`);
  }
  const unitLabel = optionalTrimmed(input.unitLabel, 40, "Unit label");
  if (input.pricingMethod === "per_unit" && !unitLabel) throw new Error("Unit label is required for per-unit pricing");
  if (input.pricingMethod !== "per_unit" && unitLabel) throw new Error("Unit label is only allowed for per-unit pricing");
  if (input.isPublic && !input.isActive) throw new Error("Inactive add-ons cannot be public");
  if (input.estimatedDurationMinutes !== undefined && (
    !Number.isSafeInteger(input.estimatedDurationMinutes) || input.estimatedDurationMinutes < 1 || input.estimatedDurationMinutes > 1440
  )) throw new Error("Estimated duration must be a whole number between 1 and 1440 minutes");
  return {
    name,
    description: optionalTrimmed(input.description, 500, "Description"),
    pricingMethod: input.pricingMethod,
    priceCents: input.priceCents,
    unitLabel,
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    internalNotes: optionalTrimmed(input.internalNotes, 2000, "Internal notes"),
    isActive: input.isActive,
    isPublic: input.isPublic,
  };
}
