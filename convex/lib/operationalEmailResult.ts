import type { OperationalEmailOutcome } from "./operationalEmailModel";

const definiteRejections = new Set(["validation_error", "missing_api_key", "restricted_api_key", "invalid_permission",
  "suspended_api_key", "not_found", "method_not_allowed", "invalid_attachment", "invalid_parameter",
  "missing_required_field", "missing_required_parameter", "email_above_quota", "invalid_idempotency_key",
  "daily_quota_exceeded", "monthly_quota_exceeded"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Never persist provider error text: it can contain recipient addresses or message details. */
export function operationalEmailResult(response: unknown): OperationalEmailOutcome {
  if (!isRecord(response)) return { status: "unknown", category: "provider_uncertain" };
  const { data, error } = response;
  if (error === null) {
    // Resend 6.9.3 declares data.id on success, but does not validate its JSON at runtime.
    // No-error alone is not positive evidence. Keep the existing bounded opaque-ID policy;
    // the SDK specifies a string, not a UUID-only contract.
    if (isRecord(data) && typeof data.id === "string" && data.id.length > 0 && data.id.length <= 128 &&
        !/[^A-Za-z0-9_-]/.test(data.id)) {
      return { status: "provider_accepted", providerMessageId: data.id };
    }
    return { status: "unknown", category: "provider_uncertain" };
  }
  // A malformed/contradictory SDK envelope must not authorize a supposedly definite retry.
  if (data !== null || !isRecord(error) || typeof error.name !== "string" || typeof error.statusCode !== "number") {
    return { status: "unknown", category: "provider_uncertain" };
  }
  if (error.name === "rate_limit_exceeded" && error.statusCode === 429) return { status: "failed", category: "rate_limited" };
  if (definiteRejections.has(error.name) &&
      error.statusCode >= 400 && error.statusCode < 500) return { status: "failed", category: "provider_rejected" };
  // Includes SDK network errors (application_error/statusCode:null), malformed results,
  // 409 conflicts and 5xx: a provider might already have accepted the request.
  return { status: "unknown", category: "provider_uncertain" };
}
