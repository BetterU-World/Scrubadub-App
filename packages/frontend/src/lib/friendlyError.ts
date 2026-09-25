/**
 * Maps known backend error messages to user-friendly display text.
 *
 * Returns { title, body } for recognised error patterns,
 * or null if the error is not a known case.
 */
export function friendlyError(
  raw: string,
): { title: string; body: string } | null {
  // Rate-limit errors
  if (/rate.limit/i.test(raw) || /too many/i.test(raw)) {
    return {
      title: "Too many attempts",
      body: "Try again in a moment.",
    };
  }

  // Stripe Connect not set up (cleaner or company)
  if (/not connected stripe/i.test(raw) || /connect onboarding/i.test(raw)) {
    return {
      title: "Payouts aren\u2019t connected yet",
      body: "Connect payouts to receive payments through SCRUB.",
    };
  }

  return null;
}

/**
 * Produce a single user-facing message from an error,
 * applying friendlyError mapping first.  Falls back to
 * the provided default when the error is unrecognised.
 */
export function toFriendlyMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
  translate?: (key: string) => string,
): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  // Convex wraps action failures in a transport message. Only recognize known
  // conditions; never display an arbitrary backend message to the user.
  if (/rate limit exceeded/i.test(raw)) return translate?.("errors.rateLimited") ?? "Too many attempts. Try again in a moment.";
  if (/invalid or expired reset token/i.test(raw)) return translate?.("errors.resetLinkExpired") ?? fallback;
  if (/invalid email address/i.test(raw)) return translate?.("auth.invalidEmail") ?? fallback;
  if (/assigned manager is invalid/i.test(raw)) return translate?.("walkthroughs.invalidAssignee") ?? fallback;
  if (/select a walkthrough date and start time|date and start time/i.test(raw)) return translate?.("walkthroughs.scheduleRequired") ?? fallback;
  if (/property address is required/i.test(raw)) return translate?.("walkthroughs.propertyAddressRequired") ?? fallback;
  if (/session required/i.test(raw)) return translate?.("walkthroughs.sessionExpired") ?? fallback;
  if (/classify this request/i.test(raw)) return translate?.("requests.propertyClassificationRequired") ?? fallback;
  if (/owner or manager session required/i.test(raw)) return translate?.("requests.propertyPermissionRequired") ?? fallback;
  if (/client relationship must belong/i.test(raw)) return translate?.("requests.propertyClientRelationshipInvalid") ?? fallback;
  if (/classify the request or linked property/i.test(raw)) return translate?.("commercialConversion.classificationRequiredError") ?? fallback;
  if (/commercial accounts can only be created for requests classified as commercial/i.test(raw)) return translate?.("commercialConversion.notCommercialError") ?? fallback;
  const mapped = friendlyError(raw);
  if (mapped && !translate) return `${mapped.title} — ${mapped.body}`;
  if (translate) return fallback;
  const looksLikeIdentifier =
    /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/i.test(raw.trim()) ||
    /^[A-Z][A-Z0-9_]*(?:_[A-Z0-9_]+)+$/.test(raw.trim());
  const looksInternal =
    looksLikeIdentifier ||
    raw.length > 180 ||
    /convex|server error|uncaught|exception|stack|\bat\s+\w+|_generated|\[request id|unauthorized|forbidden/i.test(raw);
  return raw && !looksInternal ? raw : fallback;
}

export function toSignInMessage(
  err: unknown,
  translate: (key: string) => string,
): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (/rate limit exceeded/i.test(raw)) return translate("errors.rateLimited");
  if (/invalid email or password/i.test(raw)) return translate("auth.incorrectCredentials");
  return translate("feedback.unexpectedError");
}

export function isValidSignInEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
