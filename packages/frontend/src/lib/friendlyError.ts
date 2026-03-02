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
  fallback = "Something went wrong",
): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const mapped = friendlyError(raw);
  if (mapped) return `${mapped.title} — ${mapped.body}`;
  return raw || fallback;
}
