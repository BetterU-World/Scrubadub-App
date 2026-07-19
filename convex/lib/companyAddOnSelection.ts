import type { Id } from "../_generated/dataModel";

export const MAX_REQUESTED_ADD_ONS = 20;
export const MAX_ADD_ON_QUANTITY = 999;

export type RequestedAddOnSelection = {
  companyAddOnId: Id<"companyAddOns">;
  selectionVersion: string;
  quantity?: number;
};

export function companyAddOnSelectionVersion(record: { updatedAt: number }) {
  return Math.trunc(record.updatedAt).toString(36);
}

export async function createRequestedAddOnSnapshots(
  ctx: any,
  companyId: Id<"companies">,
  selections: RequestedAddOnSelection[]
) {
  if (selections.length > MAX_REQUESTED_ADD_ONS) {
    throw new Error(`Select no more than ${MAX_REQUESTED_ADD_ONS} add-ons`);
  }

  const seen = new Set<string>();
  const snapshots = [];
  for (const selection of selections) {
    const key = String(selection.companyAddOnId);
    if (seen.has(key)) throw new Error("Duplicate add-on selection");
    seen.add(key);

    const record = await ctx.db.get(selection.companyAddOnId);
    if (!record || record.companyId !== companyId || !record.isActive || !record.isPublic || record.archivedAt !== undefined) {
      throw new Error("Selected add-on is unavailable");
    }
    if (selection.selectionVersion !== companyAddOnSelectionVersion(record)) {
      throw new Error("Add-on pricing changed. Review the current selection before submitting");
    }

    if (record.pricingMethod === "per_unit") {
      if (!Number.isSafeInteger(selection.quantity) || selection.quantity! < 1 || selection.quantity! > MAX_ADD_ON_QUANTITY) {
        throw new Error(`Per-unit quantity must be a whole number between 1 and ${MAX_ADD_ON_QUANTITY}`);
      }
    } else if (selection.quantity !== undefined) {
      throw new Error("Quantity is only allowed for per-unit add-ons");
    }

    snapshots.push({
      sourceCompanyAddOnId: record._id,
      name: record.name,
      pricingMethod: record.pricingMethod,
      priceCents: record.priceCents,
      unitLabel: record.unitLabel,
      quantity: record.pricingMethod === "per_unit" ? selection.quantity : undefined,
    });
  }
  return snapshots;
}
