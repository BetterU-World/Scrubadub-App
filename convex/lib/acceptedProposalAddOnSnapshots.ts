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

export function operationalAddOnSnapshots(snapshots: AcceptedProposalAddOnSnapshot[] | undefined) {
  return (snapshots ?? []).map((snapshot) => ({
    snapshotId: snapshot.snapshotId,
    name: snapshot.name,
    quantity: snapshot.quantity,
    unitLabel: snapshot.unitLabel,
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
