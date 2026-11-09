import type { OperationalEmailOutcome } from "./operationalEmailModel";

const definiteRejections = new Set(["validation_error", "missing_api_key", "restricted_api_key", "invalid_permission",
  "suspended_api_key", "not_found", "method_not_allowed", "invalid_attachment", "invalid_parameter",
  "missing_required_field", "missing_required_parameter", "email_above_quota", "invalid_idempotency_key",
  "daily_quota_exceeded", "monthly_quota_exceeded"]);

/** Never persist provider error text: it can contain recipient addresses or message details. */
export function operationalEmailResult(response: unknown): OperationalEmailOutcome {
  if (!response || typeof response !== "object") return { status: "unknown", category: "provider_uncertain" };
  const { data, error } = response as { data?: { id?: unknown }; error?: { name?: string; statusCode?: number } | null };
  if (error === null) {
    const id = data?.id;
    return { status: "provider_accepted", ...(typeof id === "string" && /^[\w-]{1,128}$/.test(id) ? { providerMessageId: id } : {}) };
  }
  if (error?.name === "rate_limit_exceeded" && error.statusCode === 429) return { status: "failed", category: "rate_limited" };
  if (error?.name && definiteRejections.has(error.name) && error.statusCode !== undefined &&
      error.statusCode >= 400 && error.statusCode < 500) return { status: "failed", category: "provider_rejected" };
  // Includes SDK network errors (application_error/statusCode:null), malformed results,
  // 409 conflicts and 5xx: a provider might already have accepted the request.
  return { status: "unknown", category: "provider_uncertain" };
}
