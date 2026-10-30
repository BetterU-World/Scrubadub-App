import type { TFunction } from "i18next";

export function cleanerSubmissionError(error: unknown, t: TFunction): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/required inventory/.test(message)) return t("jobCompletion.inventoryError");
  if (/not completed|All checklist/.test(message)) return t("jobCompletion.checklistError");
  if (/team lead|assigned manager/.test(message)) return t("jobCompletion.teamLead");
  if (/workers who performed|Performed worker|Invalid performed/.test(message)) return t("jobCompletion.selectWorkers");
  if (/administratively closed|execution is unavailable|Not assigned|Access denied|current state|not in progress|verified session/.test(message)) return t("jobCompletion.stateError");
  return t("jobCompletion.failed");
}
