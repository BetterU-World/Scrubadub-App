import { describe, expect, it } from "vitest";
import { SERVICE_AGREEMENT_MERGE_FIELDS } from "../serviceAgreementMergeFieldCatalogue";
import { SERVICE_AGREEMENT_FIELDS, renderTemplatePreview } from "../../../packages/frontend/src/lib/documentMergeFields";
import { diagnoseAgreementTemplate } from "../serviceAgreementAuthoring";
import { renderDocumentTemplate } from "../documentMergeFields";

describe("agreement authoring merge catalogue", () => {
  it("shares every canonical insertion field with the agreement resolver", () => {
    expect(SERVICE_AGREEMENT_FIELDS.map((field) => field.key)).toEqual(SERVICE_AGREEMENT_MERGE_FIELDS.map((field) => field.key));
    for (const key of ["agreement_end_date", "renewal_date", "scope_of_work", "payment_terms", "terms"]) {
      expect(SERVICE_AGREEMENT_FIELDS.some((field) => field.key === key)).toBe(true);
    }
    expect(SERVICE_AGREEMENT_FIELDS.some((field) => field.key === "clientName")).toBe(false);
  });

  it("recognizes aliases, unknowns, expected and optional missing values while preserving malformed literals", () => {
    const body = "{{client_name}} {{clientName}} {{mystery}} {{property_address}} {{renewal_date}} {{bad-key}}";
    const values = { client_name: "Client", clientName: "Client", property_address: "To be confirmed", renewal_date: "" };
    const report = diagnoseAgreementTemplate(body, values);
    expect(report.unknownTokens).toEqual(["mystery"]);
    expect(report.missingValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "client_name", expected: true }),
      expect.objectContaining({ key: "property_address", expected: true }),
      expect.objectContaining({ key: "renewal_date", expected: false }),
    ]));
    expect(report.tokens).not.toContain("bad-key");
    expect(renderDocumentTemplate(body, values)).toContain("{{bad-key}}");
    expect(renderTemplatePreview("{{clientName}}", { clientName: "Acme" })).toBe("Acme");
  });
});
