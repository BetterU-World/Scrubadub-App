import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import en from "../i18n/en/common.json";
import es from "../i18n/es/common.json";
import { cleanerSubmissionError } from "./cleanerSubmissionError";

describe("cleaner submission messages", () => {
  it("keeps completion message keys and interpolation tokens aligned in English and Spanish", () => {
    expect(Object.keys(en.jobCompletion).sort()).toEqual(Object.keys(es.jobCompletion).sort());
    for (const key of Object.keys(en.jobCompletion) as (keyof typeof en.jobCompletion)[]) {
      expect(es.jobCompletion[key].match(/\{\{[^}]+\}\}/g)).toEqual(en.jobCompletion[key].match(/\{\{[^}]+\}\}/g));
    }
  });

  for (const lng of ["en", "es"] as const) {
    it.each([
      ["Cannot submit: 1 required inventory item(s) not reported", "inventoryError"],
      ["Cannot submit: 2 item(s) not completed. All checklist items must be marked", "checklistError"],
      ["Only a team lead, assigned manager, or owner can submit this job", "teamLead"],
      ["Confirm the workers who performed this job", "selectWorkers"],
      ["Performed worker must be a current available job assignee", "selectWorkers"],
      ["This job timer was administratively closed", "stateError"],
      ["Not assigned to perform this job", "stateError"],
      ["Network failed; private server stack must not be displayed", "failed"],
    ] as const)(`${lng}: translates %s without exposing server details`, async (message, key) => {
      const i18n = createInstance();
      await i18n.init({ lng, resources: { en: { translation: en }, es: { translation: es } } });
      expect(cleanerSubmissionError(new Error(message), i18n.t)).toBe((lng === "en" ? en : es).jobCompletion[key]);
    });
  }
});
