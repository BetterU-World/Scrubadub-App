export type PublicAddOnPricing = {
  pricingMethod: "flat" | "starting_at" | "per_unit";
  priceCents: number;
  unitLabel: string | null;
};

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
