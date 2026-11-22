import { v, type Infer } from "convex/values";
import { assertProposalReadyForDelivery, MAX_PROPOSAL_TOTAL_CENTS, proposalAddOnLineAmount, type ProposalAddOnLine } from "./proposalAddOnLineItems";
import { checkedOneTimeProposalSnapshot } from "./jobPricing";

export const estimateFields = {
  strategy: v.union(v.literal("flat"), v.literal("square_feet"), v.literal("hourly"), v.literal("rooms")),
  cadence: v.union(v.literal("one_time"), v.literal("monthly")),
  baseCents: v.optional(v.number()),
  minimumCents: v.optional(v.number()),
  areaHundredths: v.optional(v.number()),
  areaRateHundredthCents: v.optional(v.number()),
  laborMinutes: v.optional(v.number()),
  hourlyRateCents: v.optional(v.number()),
  bedrooms: v.optional(v.number()),
  bathHalves: v.optional(v.number()),
  bedroomRateCents: v.optional(v.number()),
  bathroomRateCents: v.optional(v.number()),
};
export const estimateBaseValidator = v.object(estimateFields);
export type EstimateInput = Infer<typeof estimateBaseValidator>;

export const estimateOverrideValidator = v.object({
  baseCents: v.number(),
  reason: v.optional(v.string()),
});

export class MissingEstimateInput extends Error {}

function checkedCents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PROPOSAL_TOTAL_CENTS) {
    throw new Error("Estimate prices must be non-negative whole cents within the proposal limit");
  }
  return value;
}

export function validateEstimateDraft(input: EstimateInput, override?: Infer<typeof estimateOverrideValidator>) {
  for (const value of Object.values(input)) {
    if (typeof value === "number") checkedCents(value);
  }
  if (override) checkedCents(override.baseCents);
  if (override?.reason && override.reason.length > 1000) throw new Error("Override reason is too long");
}

function required(value: number | undefined) {
  if (value === undefined) throw new MissingEstimateInput("Complete the required pricing inputs");
  return BigInt(checkedCents(value));
}

// All quantities are integers. Round each strategy's total once, half up to a cent.
function flatEquivalent(input: EstimateInput) {
  switch (input.strategy) {
    case "flat":
      return Number(required(input.baseCents));
    case "square_feet":
      // Hundredths of a square foot times hundredths of a cent per square foot.
      return Number((required(input.areaHundredths) * required(input.areaRateHundredthCents) + 5000n) / 10000n);
    case "hourly":
      return Number((required(input.laborMinutes) * required(input.hourlyRateCents) + 30n) / 60n);
    case "rooms":
      return Number(required(input.baseCents) + required(input.bedrooms) * required(input.bedroomRateCents) +
        (required(input.bathHalves) * required(input.bathroomRateCents) + 1n) / 2n);
  }
}

export function estimateProposalBase(cadence: Infer<typeof estimateBaseValidator>["cadence"], cents: number) {
  return {
    oneTimePriceCents: cadence === "one_time" ? cents : undefined,
    monthlyPriceCents: cadence === "monthly" ? cents : undefined,
  };
}

export function calculateEstimate(
  input: Infer<typeof estimateBaseValidator>,
  addOnLineItems: ProposalAddOnLine[],
  override?: Infer<typeof estimateOverrideValidator>,
) {
  const minimumCents = checkedCents(input.minimumCents ?? 0);
  const recommendedBaseCents = Math.max(checkedCents(flatEquivalent(input)), minimumCents);
  const approvedBaseCents = override ? checkedCents(override.baseCents) : recommendedBaseCents;
  const reason = override?.reason?.trim();
  if (reason && reason.length > 1000) throw new Error("Override reason is too long");
  if (approvedBaseCents < minimumCents && !reason) throw new Error("A below-minimum override requires a reason");
  const recommended = assertProposalReadyForDelivery({
    ...estimateProposalBase(input.cadence, recommendedBaseCents), addOnLineItems,
  });
  const approved = assertProposalReadyForDelivery({
    ...estimateProposalBase(input.cadence, approvedBaseCents), addOnLineItems,
  });
  return {
    cadence: input.cadence,
    engineVersion: input.strategy === "flat" ? 1 : 2,
    recommendedBaseCents,
    approvedBaseCents,
    recommended,
    approved,
    override: override ? { baseCents: approvedBaseCents, reason: reason || undefined } : undefined,
  };
}

export function validateEstimateHandoff(
  propertyType: string | null,
  result: ReturnType<typeof calculateEstimate>,
  lines: ProposalAddOnLine[],
) {
  if (propertyType === null) throw new Error("Resolve the Smart Estimate billing destination before applying");
  if (propertyType === "commercial" && result.cadence !== "monthly") {
    throw new Error("Smart Estimate commercial handoff requires a monthly base");
  }
  if (propertyType !== "residential" && propertyType !== "vacation_rental") return;
  if (result.approved.hasMonthlyPricing) {
    throw new Error("Smart Estimate job billing handoff requires one-time pricing only");
  }
  const resolvedLines = lines.map(line => ({
    ...line, lineTotalCents: proposalAddOnLineAmount(line),
    quantity: line.quantity ?? null, unitLabel: line.unitLabel ?? null,
  }));
  try {
    // Zero is allowed on an estimate. Accepted job pricing still has its own invoice eligibility rules.
    checkedOneTimeProposalSnapshot(result.approvedBaseCents, resolvedLines, "proposal");
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new Error(`Smart Estimate exceeds job billing constraints: ${error.message}`);
  }
}
