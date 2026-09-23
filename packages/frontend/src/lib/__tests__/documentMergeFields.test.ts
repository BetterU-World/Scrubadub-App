import { describe, expect, it } from "vitest";
import {
  renderTemplatePreview,
  SAMPLE_SERVICE_AGREEMENT_VALUES,
  tokenForField,
} from "../documentMergeFields";

describe("service agreement merge-field preview", () => {
  it("shows the canonical client field and the persisted QA spelling consistently", () => {
    expect(tokenForField("client_name")).toBe("{{client_name}}");
    expect(renderTemplatePreview("For {{client_name}} / {{clientName}} at {{property_address}}"))
      .toBe("For Acme Offices / Acme Offices at 500 Market Street");
  });

  it("keeps unrelated supplied merge values unchanged", () => {
    expect(renderTemplatePreview("{{company_name}}: {{contract_price}}", SAMPLE_SERVICE_AGREEMENT_VALUES))
      .toBe("Sparkle Clean LLC: $2,400.00 per month");
  });
});
