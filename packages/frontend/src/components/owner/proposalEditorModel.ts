import { calculateProposalTotals } from "../../../../../convex/lib/proposalAddOnLineItems";

export type ProposalForm = {
  title: string; clientName: string; businessName: string; propertyAddress: string;
  serviceFrequency: string; serviceFrequencyNotes: string; scopeOfWork: string;
  monthlyPrice: string; oneTimePrice: string; notes: string;
};

export const EMPTY_PROPOSAL_FORM: ProposalForm = {
  title: "", clientName: "", businessName: "", propertyAddress: "", serviceFrequency: "",
  serviceFrequencyNotes: "", scopeOfWork: "", monthlyPrice: "", oneTimePrice: "", notes: "",
};

export function proposalFormFromRecord(proposal: Record<string, any>): ProposalForm {
  return {
    title: proposal.title ?? "", clientName: proposal.clientName ?? "", businessName: proposal.businessName ?? "",
    propertyAddress: proposal.propertyAddress ?? "", serviceFrequency: proposal.serviceFrequency ?? "",
    serviceFrequencyNotes: proposal.serviceFrequencyNotes ?? "", scopeOfWork: proposal.scopeOfWork ?? "",
    monthlyPrice: proposal.monthlyPriceCents == null ? "" : String(proposal.monthlyPriceCents / 100),
    oneTimePrice: proposal.oneTimePriceCents == null ? "" : String(proposal.oneTimePriceCents / 100),
    notes: proposal.notes ?? "",
  };
}

export function proposalFormIsDirty(form: ProposalForm, saved: ProposalForm) {
  return (Object.keys(saved) as Array<keyof ProposalForm>).some((key) => form[key] !== saved[key]);
}

export function localProposalTotals(form: ProposalForm, savedAddOns: any[]) {
  const cents = (value: string) => {
    if (!value.trim()) return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new Error("Invalid price");
    return Math.round(number * 100);
  };
  try {
    return calculateProposalTotals({ monthlyPriceCents: cents(form.monthlyPrice), oneTimePriceCents: cents(form.oneTimePrice), addOnLineItems: savedAddOns });
  } catch {
    return null;
  }
}
