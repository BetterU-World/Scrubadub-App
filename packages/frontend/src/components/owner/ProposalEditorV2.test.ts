// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { ProposalContentView } from "../ProposalContentView";
import { EMPTY_PROPOSAL_FORM, localProposalTotals, proposalFormFromRecord, proposalFormIsDirty } from "./proposalEditorModel";

const language = vi.hoisted(() => ({ current: "en" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, args?: Record<string, unknown>) => {
  const value = key.split(".").reduce((entry: any, part) => entry?.[part], ((args?.lng ?? language.current) === "es" ? es : en) as any) ?? key;
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
  it.each([["en", en], ["es", es]] as const)("labels provenance and stages the budget note from a compact %s pricing section", async (locale, labels) => {
    language.current = locale;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const rootElement = document.createElement("div");
    const root = createRoot(rootElement);
    const onChange = vi.fn();
    const onSave = vi.fn();
    const onOpenEstimate = vi.fn();
    try {
      await act(async () => root.render(createElement(ProposalEditor, {
        proposal: { appliedEstimateRevisionId: "revision", appliedEstimate: { strategy: "hourly", cadence: "one_time", approvedAt: 1 },
          assessmentSuggestedMonthlyPriceCents: 12000, addOnLineItems: lines },
        form, onChange, onSave, onOpenEstimate, dirty: false, saving: false, revision: false, onCancel: noop,
        onAddCatalog: async () => {}, onAddCustom: async () => {}, onUpdateLine: async () => {},
        onRemoveLine: async () => {}, onFeedback: noop,
      })));
      const pricing = rootElement.querySelector("#proposal-section-pricing")!;
      expect(pricing.textContent).toContain(labels.proposals.pricingSource.applied);
      expect(pricing.textContent).toContain(labels.smartEstimates.strategies.hourly);
      const button = (label: string) => Array.from(pricing.querySelectorAll("button")).find(item => item.textContent?.trim() === label)!;
      const reopen = button(labels.proposals.pricingSource.reopen);
      expect(reopen.className).toContain("w-full");
      await act(async () => reopen.click());
      expect(onOpenEstimate).toHaveBeenCalledOnce();
      await act(async () => button(labels.proposals.v2.useEstimateAsBase).click());
      expect(onChange).toHaveBeenCalledExactlyOnceWith("monthlyPrice", "120");
      expect(onSave).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      language.current = "en";
      vi.unstubAllGlobals();
    }
  });

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

  it("renders an issued Spanish proposal with separate cadence groups and an explicit zero base", () => {
    const html = renderToStaticMarkup(createElement(ProposalContentView, { issueNumber: 4, content: {
      presentation: { locale: "es", terms: "Acceso por recepción.", validThrough: "2030-01-31" },
      company: { companyName: "Example Cleaning" }, clientName: "Client",
      proposal: { title: "Weekly Service", serviceFrequency: "weekly", oneTimePriceLabel: "$0.00", monthlyPriceLabel: "$200.00",
        totals: { oneTimeTotalLabel: "$35.00", monthlyTotalLabel: "$230.00" },
        addOnLineItems: [
          { name: "Oven", pricingMethod: "flat", billingCadence: "one_time", lineTotalLabel: "$35.00" },
          { name: "Glass", pricingMethod: "flat", billingCadence: "monthly", lineTotalLabel: "$30.00" },
        ] },
    } }));
    expect(html).toContain('lang="es"');
    for (const value of ["Semanal", "$0.00", "$35.00", "$230.00", "Acceso por recepción.", "Imprimir / Guardar como PDF", "informativo"]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain("Exclusiones");
  });

  it("has Spanish equivalents for every new C2 label", () => {
    const walk = (english: any, spanish: any) => { for (const [key, value] of Object.entries(english)) {
      if (typeof value === "object") walk(value, spanish?.[key]); else expect(spanish?.[key]).toBeTruthy();
    } };
    walk(en.proposals.v2, es.proposals.v2);
  });
});
