export type PublicAddOnPricing = {
  pricingMethod: "flat" | "starting_at" | "per_unit";
  priceCents: number;
  unitLabel: string | null;
};

export type PublicAddOnSelection = {
  companyAddOnId: string;
  selectionVersion: string;
  quantity?: number;
};

export function encodePublicAddOnSelection(selection: PublicAddOnSelection) {
  return [selection.companyAddOnId, selection.selectionVersion, selection.quantity ?? ""].join("|");
}

export function parsePublicAddOnSelections(search: string): PublicAddOnSelection[] {
  const parsed: PublicAddOnSelection[] = [];
  for (const value of new URLSearchParams(search).getAll("addOn")) {
    const [companyAddOnId, selectionVersion, rawQuantity, ...extra] = value.split("|");
    if (!companyAddOnId || !selectionVersion || extra.length) continue;
    const quantity = rawQuantity === "" || rawQuantity === undefined ? undefined : Number(rawQuantity);
    if (quantity !== undefined && !Number.isSafeInteger(quantity)) continue;
    parsed.push({ companyAddOnId, selectionVersion, quantity });
  }
  return parsed;
}

export function formatPublicAddOnPrice(
  addOn: PublicAddOnPricing,
  locale: string,
  labels: {
    startingAt: (price: string) => string;
    perUnit: (price: string, unit: string) => string;
  }
) {
  const price = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(addOn.priceCents / 100);

  if (addOn.pricingMethod === "starting_at") return labels.startingAt(price);
  if (addOn.pricingMethod === "per_unit") return labels.perUnit(price, addOn.unitLabel ?? "");
  return price;
}
