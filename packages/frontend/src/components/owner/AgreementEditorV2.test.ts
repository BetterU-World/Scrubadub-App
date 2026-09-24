import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { EMPTY_AGREEMENT_FORM, agreementFormFromRecord, agreementFormIsDirty, sectionForReviewField } from "./agreementEditorModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string) => key.split(".").reduce((value: any, part) => value?.[part], en as any) ?? key,
}) }));
vi.mock("../AgreementContentView", () => ({ AgreementContentView: () => createElement("div", { "data-testid": "shared-agreement-content" }) }));

import { StructuredAgreementEditor } from "./StructuredAgreementEditor";
import { AgreementReviewItems } from "./AgreementReviewItems";
import { AgreementTemplateChooser } from "./AgreementTemplateChooser";

const noop = () => {};
const form = { ...EMPTY_AGREEMENT_FORM, title: "Office cleaning", clientName: "Acme", terms: "Thirty days notice", notes: "Call manager" };

describe("agreement editor V2", () => {
  it("loads carried proposal values and detects only actual edits", () => {
    const loaded = agreementFormFromRecord({ title: "Office cleaning", contractAmountCents: 12500, terms: "Thirty days notice" });
    expect(loaded.contractAmount).toBe("125");
    expect(loaded.terms).toBe("Thirty days notice");
    expect(agreementFormIsDirty(loaded, loaded)).toBe(false);
    expect(agreementFormIsDirty({ ...loaded, terms: "New term" }, loaded)).toBe(true);
    expect(sectionForReviewField("priceSummary")).toBe("billing");
  });

  it("groups named fields, separates internal notes, and presents save state", () => {
    const render = (dirty: boolean) => renderToStaticMarkup(createElement(StructuredAgreementEditor, {
      form, onChange: noop, onSave: noop, onCancel: noop, onChangeTemplate: noop,
      onUnsavedNavigation: noop, saving: false, dirty, template: { name: "Standard", version: 3, fallback: false },
      canManageTemplates: false, addOns: [], revision: false,
    }));
    const dirtyHtml = render(true);
    for (const section of ["details", "services", "billing", "terms", "notes"]) {
      expect(dirtyHtml).toContain(`id="agreement-section-${section}"`);
    }
    expect(dirtyHtml).toContain("Office cleaning");
    expect(dirtyHtml).toContain("Thirty days notice");
    expect(dirtyHtml).toContain(en.serviceAgreements.v2.internalOnly);
    expect(dirtyHtml).toContain(en.serviceAgreements.v2.unsavedState);
    expect(dirtyHtml).not.toContain(en.serviceAgreements.v2.manageTemplates);
    expect(render(false)).toContain(en.serviceAgreements.v2.savedState);
  });

  it("keeps strong warnings and suggestions distinct and offers field navigation", () => {
    const html = renderToStaticMarkup(createElement(AgreementReviewItems, { review: {
      warnings: [{ code: "client_name_missing", field: "clientName" }],
      suggestions: [{ code: "end_date_missing", field: "effectiveEndDate" }],
    }, onGoToField: noop }));
    expect(html).toContain(en.serviceAgreements.v2.needsAttention);
    expect(html).toContain(en.serviceAgreements.v2.suggestions);
    expect(html.match(/Edit field/g)).toHaveLength(2);
    const clean = renderToStaticMarkup(createElement(AgreementReviewItems, { review: { warnings: [], suggestions: [] } }));
    expect(clean).toContain(en.serviceAgreements.v2.noReviewItems);
    expect(clean).not.toContain(en.serviceAgreements.v2.needsAttention);
  });

  it("shows approved choices and candidate through the shared renderer before explicit apply", () => {
    const html = renderToStaticMarkup(createElement(AgreementTemplateChooser, {
      choices: [{ _id: "template-2", name: "Company standard", version: 2, isDefault: true }],
      selectedId: "template-2", currentId: "template-1", candidate: {
        canonicalPreview: { title: "Candidate" }, authoringReview: { warnings: [], suggestions: [] },
      }, loading: false, applying: false, blocked: false, onSelect: noop, onApply: noop, onClose: noop,
      confirmOpen: false, onConfirmOpenChange: noop,
    }));
    expect(html).toContain("Company standard");
    expect(html).toContain(en.serviceAgreements.v2.candidatePreview);
    expect(html).toContain("data-testid=\"shared-agreement-content\"");
    expect(html).toContain(en.serviceAgreements.v2.applyTemplate);
    expect(html).toContain(en.serviceAgreements.v2.templatePreserves);
  });

  it("has corresponding Spanish copy for each V2 label and review code", () => {
    const walk = (english: any, spanish: any) => {
      for (const [key, value] of Object.entries(english)) {
        if (typeof value === "object") walk(value, spanish?.[key]);
        else expect(spanish?.[key]).toBeTruthy();
      }
    };
    walk(en.serviceAgreements.v2, es.serviceAgreements.v2);
  });
});
