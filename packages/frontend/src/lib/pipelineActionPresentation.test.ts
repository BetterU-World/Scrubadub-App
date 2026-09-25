import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../i18n/en/common.json";
import es from "../i18n/es/common.json";
import { isOptionalAgreementSetupAction } from "./pipelineActionPresentation";

describe("request copy and agreement action presentation", () => {
  it("provides the approved EN/ES Requests and walkthrough copy", () => {
    expect(en.requests.leadDetails).toBe("Lead details");
    expect(es.requests.leadDetails).toBe("Detalles del prospecto");
    expect(en.walkthroughs.helper).toContain("you can use it to start a proposal");
    expect(es.walkthroughs.helper).toContain("puedes usarlo para iniciar una propuesta");
    expect(en.walkthroughs.photoTodo).toBe("Add a link to each photo you want to keep with this walkthrough.");
    expect(es.walkthroughs.photoTodo).toBe("Agrega un enlace a cada foto que quieras guardar con este recorrido.");
    expect(en.proposals.completeWalkthroughToStart).toBe("Complete a walkthrough to start a proposal.");
    expect(es.proposals.completeWalkthroughToStart).toBe("Completa un recorrido para iniciar una propuesta.");
  });

  it("labels acknowledged and signed agreement setup as optional without commercial wording", () => {
    for (const key of ["acknowledged_continue_setup", "signed_received_continue_setup"] as const) {
      expect(isOptionalAgreementSetupAction(key)).toBe(true);
      expect(en.pipeline.actions[key]).toBe("Review agreement and service options");
      expect(es.pipeline.actions[key]).toBe("Revisar el acuerdo y las opciones de servicio");
    }
    expect(isOptionalAgreementSetupAction("create_agreement")).toBe(false);
    const detail = readFileSync(resolve(process.cwd(), "packages/frontend/src/pages/owner/RequestDetailPage.tsx"), "utf8");
    expect(detail).toContain('isOptionalAgreementSetupAction((request as any).pipeline.nextAction.key) ? "btn-secondary" : "btn-primary"');
    expect(detail).toContain('max-w-full whitespace-normal text-sm');
    expect(detail).toContain('className="btn-primary text-sm"'); // Residential Schedule Service remains primary.
    expect(detail).toContain('t("proposals.completeWalkthroughToStart")');
  });

  it("keeps commercial account creation language in the eligible account panel", () => {
    expect(en.commercialConversion.commercialNextStep).toBe("Create the commercial account");
    expect(en.commercialConversion.commercialNextStepDescription).toBe("Set up recurring service, team assignments, and billing for this client.");
    expect(es.commercialConversion.commercialNextStepDescription).toBe("Configura el servicio recurrente, las asignaciones del equipo y la facturación de este cliente.");
  });
});
