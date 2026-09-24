import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { ProposalContentView } from "../ProposalContentView";
import { EMPTY_PROPOSAL_FORM, localProposalTotals, proposalFormFromRecord, proposalFormIsDirty } from "./proposalEditorModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, args?: Record<string, unknown>) => {
  const value = key.split(".").reduce((entry: any, part) => entry?.[part], en as any) ?? key;
  return typeof value === "string" ? value.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) => String(args?.[name] ?? "")) : key;
} }) }));
vi.mock("./ProposalCatalogAddOnPicker", () => ({ ProposalCatalogAddOnPicker: () => createElement("div", { "data-testid": "catalog-picker" }) }));

import { ProposalEditor } from "./ProposalEditor";
import { ProposalReviewItems } from "./ProposalReviewItems";

const noop = () => {};
const lines = [
  { lineItemId: "monthly", sourceType: "custom", name: "Windows", pricingMethod: "flat", unitPriceCents: 2500, billingCadence: "monthly" },
  { lineItemId: "once", sourceType: "custom", name: "Deep clean", pricingMethod: "per_unit", unitPriceCents: 3000, quantity: 2, unitLabel: "room", billingCadence: "one_time" },
];
const form = { ...EMPTY_PROPOSAL_FORM, title: "Office proposal", clientName: "Client", monthlyPrice: "100", oneTimePrice: "50", scopeOfWork: "Clean offices", notes: "Client-visible note" };

describe("proposal editor V2", () => {
  it("loads saved fields and detects main-form edits separately from saved add-ons", () => {
    const saved = proposalFormFromRecord({ title: "Office proposal", monthlyPriceCents: 10000, notes: "Client-visible note" });
    expect(saved.monthlyPrice).toBe("100");
    expect(proposalFormIsDirty(saved, saved)).toBe(false);
    expect(proposalFormIsDirty({ ...saved, monthlyPrice: "120" }, saved)).toBe(true);
  });

  it("uses the existing pricing helper for mixed monthly and one-time totals", () => {
    expect(localProposalTotals(form, lines)).toMatchObject({
      baseMonthlyPriceCents: 10000, addOnMonthlyTotalCents: 2500, monthlyTotalCents: 12500,
      baseOneTimePriceCents: 5000, addOnOneTimeTotalCents: 6000, oneTimeTotalCents: 11000,
    });
    expect(localProposalTotals({ ...form, monthlyPrice: "bad" }, lines)).toBeNull();
  });

  it("renders grouped sections, source suggestion, client notes, and unsaved calculation", () => {
    const html = renderToStaticMarkup(createElement(ProposalEditor, {
      proposal: { addOnLineItems: [], assessmentSuggestedMonthlyPriceCents: 12000 }, form, onChange: noop,
      sourceAssessment: { title: "Site visit", completedAt: Date.UTC(2026, 0, 5) },
      dirty: true, saving: false, revision: false, onSave: noop, onCancel: noop,
      onAddCatalog: async () => {}, onAddCustom: async () => {}, onUpdateLine: async () => {},
      onRemoveLine: async () => {}, onFeedback: noop,
    }));
    for (const section of ["client", "services", "pricing", "notes"]) expect(html).toContain(`id="proposal-section-${section}"`);
    expect(html).toContain("Site visit");
    expect(html).toContain(en.proposals.v2.useEstimateAsBase);
    expect(html).toContain(en.proposals.v2.notesToClient);
    expect(html).toContain(en.proposals.v2.unsavedCalculation);
    expect(html).toContain(en.proposals.v2.unsavedState);
  });

  it("keeps optional warnings distinct from the existing starting-at block", () => {
    const warning = renderToStaticMarkup(createElement(ProposalReviewItems, { proposal: {
      status: "draft", scopeOfWork: "", calculatedTotals: { hasMonthlyPricing: false, hasOneTimePricing: false, hasUnfinalizedStartingAt: false },
    } }));
    expect(warning).toContain(en.proposals.v2.reviewWarnings);
    expect(warning).toContain(en.proposals.v2.warningsNotBlocking);
    const blocked = renderToStaticMarkup(createElement(ProposalReviewItems, { proposal: {
      status: "draft", scopeOfWork: "Scope", calculatedTotals: { hasMonthlyPricing: true, hasOneTimePricing: false, hasUnfinalizedStartingAt: true },
    } }));
    expect(blocked).toContain(en.proposals.v2.needsAttention);
    const clean = renderToStaticMarkup(createElement(ProposalReviewItems, { proposal: {
      status: "draft", scopeOfWork: "Scope", calculatedTotals: { hasMonthlyPricing: true, hasOneTimePricing: false, hasUnfinalizedStartingAt: false },
    } }));
    expect(clean).toBe("");
  });

  it("shows canonical client content and qualifies legacy base pricing", () => {
    const content: any = { company: { companyName: "Provider" }, clientName: "Client", proposal: {
      title: "Office proposal", notes: "Client-visible note", monthlyPriceLabel: "$100.00",
      totals: { monthlyTotalLabel: "$125.00" }, addOnLineItems: [],
    } };
    const html = renderToStaticMarkup(createElement(ProposalContentView, { content }));
    expect(html).toContain("$125.00");
    expect(html).toContain("Client-visible note");
    expect(html).not.toContain(en.proposals.termsNotSet);
    const legacy = renderToStaticMarkup(createElement(ProposalContentView, { content, legacyBaseOnly: true }));
    expect(legacy).toContain("$100.00");
    expect(legacy).not.toContain("$125.00");
  });

  it("has Spanish equivalents for every new C2 label", () => {
    const walk = (english: any, spanish: any) => { for (const [key, value] of Object.entries(english)) {
      if (typeof value === "object") walk(value, spanish?.[key]); else expect(spanish?.[key]).toBeTruthy();
    } };
    walk(en.proposals.v2, es.proposals.v2);
  });
});
