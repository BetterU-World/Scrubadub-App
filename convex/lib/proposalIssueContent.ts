import { v } from "convex/values";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const frequency = v.union(
  v.literal("one_time"), v.literal("weekly"), v.literal("biweekly"),
  v.literal("monthly"), v.literal("quarterly"), v.literal("custom"), v.null(),
);

/** The complete immutable proposal presentation, without lifecycle or delivery metadata. */
export const proposalIssueContentValidator = v.object({
  company: v.object({
    companyName: v.string(),
    companyLogoUrl: nullableString,
    companyEmail: nullableString,
    companyPhone: nullableString,
  }),
  clientName: v.string(),
  proposal: v.object({
    title: v.string(),
    businessName: nullableString,
    propertyAddress: nullableString,
    serviceFrequency: frequency,
    serviceFrequencyLabel: nullableString,
    serviceFrequencyNotes: nullableString,
    scopeOfWork: nullableString,
    notes: nullableString,
    monthlyPriceCents: nullableNumber,
    monthlyPriceLabel: nullableString,
    oneTimePriceCents: nullableNumber,
    oneTimePriceLabel: nullableString,
    addOnLineItems: v.array(v.object({
      name: v.string(),
      pricingMethod: v.union(v.literal("flat"), v.literal("starting_at"), v.literal("per_unit")),
      unitPriceCents: v.number(),
      unitPriceLabel: nullableString,
      unitLabel: nullableString,
      quantity: nullableNumber,
      finalizedPriceCents: nullableNumber,
      finalizedPriceLabel: nullableString,
      billingCadence: v.union(v.literal("one_time"), v.literal("monthly")),
      lineTotalCents: nullableNumber,
      lineTotalLabel: nullableString,
    })),
    totals: v.object({
      baseMonthlyPriceCents: v.number(),
      baseOneTimePriceCents: v.number(),
      addOnMonthlyTotalCents: v.number(),
      addOnOneTimeTotalCents: v.number(),
      monthlyTotalCents: v.number(),
      oneTimeTotalCents: v.number(),
      hasMonthlyPricing: v.boolean(),
      hasOneTimePricing: v.boolean(),
      hasUnfinalizedStartingAt: v.boolean(),
      monthlyTotalLabel: nullableString,
      oneTimeTotalLabel: nullableString,
    }),
  }),
});

export function proposalIssueContent(payload: any) {
  const { companyName, companyLogoUrl, companyEmail, companyPhone } = payload.company;
  const {
    title, businessName, propertyAddress, serviceFrequency, serviceFrequencyLabel,
    serviceFrequencyNotes, scopeOfWork, notes, monthlyPriceCents, monthlyPriceLabel,
    oneTimePriceCents, oneTimePriceLabel, addOnLineItems, totals,
  } = payload.proposal;
  return {
    company: { companyName, companyLogoUrl, companyEmail, companyPhone },
    clientName: payload.clientName,
    proposal: {
      title, businessName, propertyAddress, serviceFrequency, serviceFrequencyLabel,
      serviceFrequencyNotes, scopeOfWork, notes, monthlyPriceCents, monthlyPriceLabel,
      oneTimePriceCents, oneTimePriceLabel, addOnLineItems, totals,
    },
  };
}
