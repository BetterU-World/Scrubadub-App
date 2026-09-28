import type { TFunction } from "i18next";

/** Translate canonical validation without exposing raw server traces in the product. */
export function compensationError(error: unknown, t: TFunction): string {
  const message = error instanceof Error ? error.message : String(error);
  const rules: [RegExp, string][] = [
    [/integer minor-unit|Financial total/, "moneyError"],
    [/Confirm the workers|Performed worker|Invalid performed/, "rosterError"],
    [/Stale|Execution evidence changed/, "staleError"],
    [/below recorded settlement/, "belowPaidError"],
    [/exceeds outstanding|No payable/, "overpaymentError"],
    [/already approved|already materialized/, "alreadyApprovedError"],
    [/already reviewed/, "alreadyReviewedError"],
    [/already reversed/, "alreadyReversedError"],
    [/unsettled|Voided obligation/, "voidError"],
    [/evidence required|Approved source/, "eligibilityError"],
    [/Idempotency|retry content/, "retryError"],
    [/reason|basis/, "reasonError"],
    [/payment date/, "dateError"],
  ];
  return t(
    `compensation.${rules.find(([pattern]) => pattern.test(message))?.[1] ?? "genericError"}`,
  );
}
