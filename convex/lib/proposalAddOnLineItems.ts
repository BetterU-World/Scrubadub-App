import { MAX_ADD_ON_PRICE_CENTS } from "./companyAddOnValidation";

export const MAX_PROPOSAL_ADD_ON_LINES = 50;
export const MAX_PROPOSAL_TOTAL_CENTS = 1_000_000_000;

export type ProposalAddOnLine = {
  lineItemId: string;
  sourceType: "request_snapshot" | "catalog" | "custom";
  sourceClientRequestId?: any;
  sourceCompanyAddOnId?: any;
  name: string;
  pricingMethod: "flat" | "starting_at" | "per_unit";
  unitPriceCents: number;
  unitLabel?: string;
  quantity?: number;
  finalizedPriceCents?: number;
  billingCadence: "one_time" | "monthly";
};

function cents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_ADD_ON_PRICE_CENTS) {
    throw new Error(`${label} must be positive whole cents no greater than ${MAX_ADD_ON_PRICE_CENTS}`);
  }
  return value;
}

export function normalizeProposalAddOnLine(line: ProposalAddOnLine): ProposalAddOnLine {
  const name = line.name.trim();
  if (!name || name.length > 80) throw new Error("Line item name must be between 1 and 80 characters");
  const unitPriceCents = cents(line.unitPriceCents, "Unit price");
  if (line.pricingMethod === "per_unit") {
    const unitLabel = line.unitLabel?.trim();
    if (!unitLabel || unitLabel.length > 40) throw new Error("Per-unit lines require a unit label between 1 and 40 characters");
    line = { ...line, unitLabel };
    if (!Number.isSafeInteger(line.quantity) || line.quantity! < 1 || line.quantity! > 999) {
      throw new Error("Per-unit quantity must be a whole number between 1 and 999");
    }
    if (line.finalizedPriceCents !== undefined) throw new Error("Finalized price is only allowed for starting-at lines");
  } else if (line.quantity !== undefined || line.unitLabel !== undefined) {
    throw new Error("Quantity and unit label are only allowed for per-unit lines");
  }
  if (line.pricingMethod === "starting_at") {
    if (line.finalizedPriceCents !== undefined && cents(line.finalizedPriceCents, "Finalized price") < unitPriceCents) {
      throw new Error("Finalized price cannot be below the starting price");
    }
  } else if (line.finalizedPriceCents !== undefined) {
    throw new Error("Finalized price is only allowed for starting-at lines");
  }
  if (line.billingCadence !== "one_time" && line.billingCadence !== "monthly") throw new Error("Invalid billing cadence");
  if (line.sourceType === "request_snapshot") {
    if (!line.sourceClientRequestId || !line.sourceCompanyAddOnId) throw new Error("Requested lines require request and catalog traceability");
  } else if (line.sourceType === "catalog") {
    if (line.sourceClientRequestId || !line.sourceCompanyAddOnId) throw new Error("Catalog lines require catalog-only traceability");
  } else if (line.sourceType === "custom") {
    if (line.sourceClientRequestId || line.sourceCompanyAddOnId) throw new Error("Custom lines cannot reference source records");
  } else {
    throw new Error("Invalid proposal add-on source");
  }
  return { ...line, name, unitPriceCents };
}

export function validateProposalAddOnLines(lines: ProposalAddOnLine[]) {
  if (lines.length > MAX_PROPOSAL_ADD_ON_LINES) throw new Error(`Proposal supports at most ${MAX_PROPOSAL_ADD_ON_LINES} add-on lines`);
  const ids = new Set<string>();
  return lines.map((line) => {
    if (!line.lineItemId || ids.has(line.lineItemId)) throw new Error("Proposal line IDs must be unique");
    ids.add(line.lineItemId);
    return normalizeProposalAddOnLine(line);
  });
}

function checkedAdd(a: number, b: number) {
  const total = a + b;
  if (!Number.isSafeInteger(total) || total > MAX_PROPOSAL_TOTAL_CENTS) throw new Error("Proposal total is too large");
  return total;
}

function baseCents(value: number | undefined) {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PROPOSAL_TOTAL_CENTS) throw new Error("Proposal base price is invalid");
  return value;
}

export function proposalAddOnLineAmount(line: ProposalAddOnLine) {
  const valid = normalizeProposalAddOnLine(line);
  if (valid.pricingMethod === "starting_at") return valid.finalizedPriceCents ?? null;
  const amount = valid.pricingMethod === "per_unit" ? valid.unitPriceCents * valid.quantity! : valid.unitPriceCents;
  if (!Number.isSafeInteger(amount) || amount > MAX_PROPOSAL_TOTAL_CENTS) throw new Error("Proposal line total is too large");
  return amount;
}

export function calculateProposalTotals(proposal: { monthlyPriceCents?: number; oneTimePriceCents?: number; addOnLineItems?: ProposalAddOnLine[] }) {
  const lines = validateProposalAddOnLines(proposal.addOnLineItems ?? []);
  let addOnMonthlyTotalCents = 0;
  let addOnOneTimeTotalCents = 0;
  let hasUnfinalizedStartingAt = false;
  for (const line of lines) {
    const amount = proposalAddOnLineAmount(line);
    if (amount === null) { hasUnfinalizedStartingAt = true; continue; }
    if (line.billingCadence === "monthly") addOnMonthlyTotalCents = checkedAdd(addOnMonthlyTotalCents, amount);
    else addOnOneTimeTotalCents = checkedAdd(addOnOneTimeTotalCents, amount);
  }
  const baseMonthlyPriceCents = baseCents(proposal.monthlyPriceCents);
  const baseOneTimePriceCents = baseCents(proposal.oneTimePriceCents);
  return {
    baseMonthlyPriceCents,
    baseOneTimePriceCents,
    addOnMonthlyTotalCents,
    addOnOneTimeTotalCents,
    monthlyTotalCents: checkedAdd(baseMonthlyPriceCents, addOnMonthlyTotalCents),
    oneTimeTotalCents: checkedAdd(baseOneTimePriceCents, addOnOneTimeTotalCents),
    hasMonthlyPricing: proposal.monthlyPriceCents !== undefined || lines.some((line) => line.billingCadence === "monthly" && proposalAddOnLineAmount(line) !== null),
    hasOneTimePricing: proposal.oneTimePriceCents !== undefined || lines.some((line) => line.billingCadence === "one_time" && proposalAddOnLineAmount(line) !== null),
    hasUnfinalizedStartingAt,
  };
}

export function assertProposalReadyForDelivery(proposal: any) {
  const totals = calculateProposalTotals(proposal);
  if (totals.hasUnfinalizedStartingAt) throw new Error("Finalize every starting-at add-on before sending or accepting the proposal");
  return totals;
}

export function newProposalLineItemId() {
  return crypto.randomUUID();
}
