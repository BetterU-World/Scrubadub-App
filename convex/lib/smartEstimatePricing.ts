import { v, type Infer } from "convex/values";
import { assertProposalReadyForDelivery, MAX_PROPOSAL_TOTAL_CENTS, type ProposalAddOnLine } from "./proposalAddOnLineItems";

export const estimateBaseValidator = v.object({
  strategy: v.literal("flat"),
  cadence: v.union(v.literal("one_time"), v.literal("monthly")),
  baseCents: v.number(),
  minimumCents: v.optional(v.number()),
});

export const estimateOverrideValidator = v.object({
  baseCents: v.number(),
  reason: v.optional(v.string()),
});

export const estimateEngineVersion = 1;

function checkedCents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PROPOSAL_TOTAL_CENTS) {
    throw new Error("Estimate prices must be non-negative whole cents within the proposal limit");
  }
  return value;
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
  const recommendedBaseCents = Math.max(checkedCents(input.baseCents), minimumCents);
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
    engineVersion: estimateEngineVersion,
    recommendedBaseCents,
    approvedBaseCents,
    recommended,
    approved,
    override: override ? { baseCents: approvedBaseCents, reason: reason || undefined } : undefined,
  };
}
