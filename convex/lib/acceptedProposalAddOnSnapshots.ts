import { proposalAddOnLineAmount, validateProposalAddOnLines } from "./proposalAddOnLineItems";

export type AcceptedProposalAddOnSnapshot = {
  snapshotId: string;
  sourceProposalId: any;
  sourceProposalLineItemId: string;
  originalSourceType: "request_snapshot" | "catalog" | "custom";
  sourceClientRequestId?: any;
  sourceCompanyAddOnId?: any;
  name: string;
  pricingMethod: "flat" | "starting_at" | "per_unit";
  unitPriceCents: number;
  unitLabel?: string;
  quantity?: number;
  finalizedPriceCents?: number;
  lineTotalCents: number;
  billingCadence: "one_time" | "monthly";
  executionApplicability?: "every_job" | "first_job";
};

export type ScheduleAddOnSelection = {
  sourceProposalLineItemId: string;
  executionApplicability: "every_job" | "first_job";
};

export async function copyAcceptedProposalAddOnSnapshots(ctx: any, proposalId: any, companyId: any) {
  const proposal: any = await ctx.db.get(proposalId);
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.companyId !== companyId) throw new Error("Access denied");
  if (proposal.status !== "accepted") throw new Error("Add-ons can only be copied from an accepted proposal");

  const lines = validateProposalAddOnLines(proposal.addOnLineItems ?? []);
  const snapshots: AcceptedProposalAddOnSnapshot[] = lines.map((line) => {
    const lineTotalCents = proposalAddOnLineAmount(line);
    if (lineTotalCents === null) throw new Error("Accepted proposal contains an unfinalized starting-at add-on");
    return {
      snapshotId: crypto.randomUUID(),
      sourceProposalId: proposal._id,
      sourceProposalLineItemId: line.lineItemId,
      originalSourceType: line.sourceType,
      sourceClientRequestId: line.sourceClientRequestId,
      sourceCompanyAddOnId: line.sourceCompanyAddOnId,
      name: line.name,
      pricingMethod: line.pricingMethod,
      unitPriceCents: line.unitPriceCents,
      unitLabel: line.unitLabel,
      quantity: line.quantity,
      finalizedPriceCents: line.finalizedPriceCents,
      lineTotalCents,
      billingCadence: line.billingCadence,
    };
  });
  return { proposal, snapshots };
}

export async function copyScheduleAddOnSnapshots(ctx: any, proposalId: any, companyId: any, selections: ScheduleAddOnSelection[]) {
  const { proposal, snapshots } = await copyAcceptedProposalAddOnSnapshots(ctx, proposalId, companyId);
  if (selections.length > 20) throw new Error("A schedule can include at most 20 add-ons");
  const ids = new Set<string>();
  for (const selection of selections) {
    if (!selection.sourceProposalLineItemId?.trim() || ids.has(selection.sourceProposalLineItemId)) {
      throw new Error("Schedule add-on selections must be unique and well formed");
    }
    ids.add(selection.sourceProposalLineItemId);
  }
  const byId = new Map(snapshots.map((snapshot) => [snapshot.sourceProposalLineItemId, snapshot]));
  const selected = selections.map((selection) => {
    const snapshot = byId.get(selection.sourceProposalLineItemId);
    if (!snapshot) throw new Error("Schedule add-on must belong to the accepted proposal");
    return { ...snapshot, snapshotId: crypto.randomUUID(), executionApplicability: selection.executionApplicability };
  });
  return { proposal, snapshots: selected };
}

export function operationalAddOnSnapshots(snapshots: AcceptedProposalAddOnSnapshot[] | undefined) {
  return (snapshots ?? []).map((snapshot) => ({
    snapshotId: snapshot.snapshotId,
    name: snapshot.name,
    quantity: snapshot.quantity,
    unitLabel: snapshot.unitLabel,
    executionRequirement: snapshot.executionApplicability,
  }));
}

export function sanitizedSharedJobAddOns(items: Array<{ name: string; quantity?: number; unitLabel?: string; executionRequirement?: "every_job" | "first_job" }> | undefined) {
  return (items ?? []).map((item) => ({
    snapshotId: crypto.randomUUID(),
    name: item.name,
    quantity: item.quantity,
    unitLabel: item.unitLabel,
    executionRequirement: item.executionRequirement,
  }));
}

export function formatAgreementAddOnLines(snapshots: AcceptedProposalAddOnSnapshot[]) {
  if (snapshots.length === 0) return "None";
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  return snapshots.map((line) => {
    const quantity = line.quantity ? `${line.quantity} ${line.unitLabel}${line.quantity === 1 ? "" : "s"} — ` : "";
    const cadence = line.billingCadence === "monthly" ? "monthly" : "one-time";
    return `• ${line.name}: ${quantity}${money(line.lineTotalCents)} (${cadence})`;
  }).join("\n");
}
