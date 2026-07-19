import { copyAcceptedProposalAddOnSnapshots } from "./acceptedProposalAddOnSnapshots";

export const MAX_INVOICE_CENTS = 1_000_000_000;

export type InvoiceAddOnLineItem = {
  snapshotId: string;
  sourceProposalId: any;
  sourceProposalLineItemId: string;
  name: string;
  pricingMethod: "flat" | "starting_at" | "per_unit";
  unitPriceCents: number;
  unitLabel?: string;
  quantity?: number;
  finalizedPriceCents?: number;
  billingCadence: "one_time" | "monthly";
  lineTotalCents: number;
};

function checkedCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_INVOICE_CENTS) {
    throw new Error(`${label} must be a safe whole-cent amount within supported bounds`);
  }
  return value;
}

export function calculateInvoiceTotals(baseSubtotalCents: number, items: InvoiceAddOnLineItem[] = [], taxCents = 0) {
  const base = checkedCents(baseSubtotalCents, "Base subtotal");
  const tax = checkedCents(taxCents, "Tax");
  let addOnSubtotalCents = 0;
  for (const item of items) {
    addOnSubtotalCents = checkedCents(addOnSubtotalCents + checkedCents(item.lineTotalCents, "Add-on line total"), "Add-on subtotal");
  }
  const subtotalCents = checkedCents(base + addOnSubtotalCents, "Invoice subtotal");
  const totalCents = checkedCents(subtotalCents + tax, "Invoice total");
  return { baseSubtotalCents: base, addOnSubtotalCents, subtotalCents, taxCents: tax, totalCents };
}

export async function buildInvoiceAddOnSnapshot(ctx: any, account: any) {
  if (!account.sourceProposalId) return { sourceProposalId: undefined, items: [] as InvoiceAddOnLineItem[] };
  const { proposal, snapshots } = await copyAcceptedProposalAddOnSnapshots(ctx, account.sourceProposalId, account.companyId);
  const priorInvoices = await ctx.db.query("invoices").withIndex("by_company", (q: any) => q.eq("companyId", account.companyId)).collect();
  const consumedOneTimeIds = new Set(priorInvoices
    .filter((invoice: any) => invoice.status !== "void")
    .flatMap((invoice: any) => invoice.addOnLineItems ?? [])
    .filter((line: any) => line.billingCadence === "one_time" && line.sourceProposalId === proposal._id)
    .map((line: any) => line.sourceProposalLineItemId));
  const eligible = snapshots.filter((line) => line.billingCadence === "monthly" || !consumedOneTimeIds.has(line.sourceProposalLineItemId));
  const items = eligible.map((line) => ({
    snapshotId: crypto.randomUUID(), sourceProposalId: proposal._id, sourceProposalLineItemId: line.sourceProposalLineItemId,
    name: line.name, pricingMethod: line.pricingMethod, unitPriceCents: line.unitPriceCents, unitLabel: line.unitLabel,
    quantity: line.quantity, finalizedPriceCents: line.finalizedPriceCents, billingCadence: line.billingCadence, lineTotalCents: line.lineTotalCents,
  }));
  calculateInvoiceTotals(account.contractAmountCents ?? 0, items);
  return { sourceProposalId: proposal._id, items };
}

export function publicInvoiceAddOns(items: InvoiceAddOnLineItem[] | undefined) {
  return (items ?? []).map(({ sourceProposalId: _p, sourceProposalLineItemId: _l, snapshotId, ...line }) => ({ snapshotId, ...line }));
}
