import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send: provider }; } }));
import { deliverJobAssignedEmail, deliverJobCompletedEmail, deliverJobApprovedEmail, sendJobAssignedEmail } from "../email";

beforeEach(() => {
  provider.mockReset();
  vi.stubEnv("APP_URL", "https://scrub.example.test"); vi.stubEnv("RESEND_API_KEY", "test-only-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "mail@example.test"); vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
});
afterEach(() => vi.unstubAllEnvs());
const send = () => deliverJobAssignedEmail("private@example.test", "Private property", "2030-01-02");

describe("operational provider outcome classification", () => {
  it.each(["assignment", "completion", "approval"] as const)("returns acceptance and actual message ID for %s", async kind => {
    provider.mockResolvedValue({ data: { id: "actual-message-id" }, error: null });
    const result = kind === "assignment" ? await send() : kind === "completion"
      ? await deliverJobCompletedEmail("private@example.test", "Private property", "Worker", 1800000000000)
      : await deliverJobApprovedEmail("private@example.test", "Private property");
    expect(result).toEqual({ status: "provider_accepted", providerMessageId: "actual-message-id" });
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("records acceptance without inventing a missing provider ID and preserves boolean wrappers", async () => {
    provider.mockResolvedValue({ data: {}, error: null });
    expect(await send()).toEqual({ status: "provider_accepted" });
    expect(await sendJobAssignedEmail("private@example.test", "Private", "2030-01-02")).toBe(true);
  });
  it("recognizes only an explicit rate_limit_exceeded rejection as retryable", async () => {
    provider.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Private error text" } });
    expect(await send()).toEqual({ status: "failed", category: "rate_limited" });
  });
  it.each([["validation_error", 422], ["restricted_api_key", 403], ["daily_quota_exceeded", 429], ["monthly_quota_exceeded", 429]])(
    "classifies %s as a permanent rejection", async (name, statusCode) => {
      provider.mockResolvedValue({ data: null, error: { name, statusCode, message: "private@example.test" } });
      expect(await send()).toEqual({ status: "failed", category: "provider_rejected" });
    });
  it.each([
    { data: null, error: { name: "application_error", statusCode: null } },
    { data: null, error: { name: "application_error", statusCode: 500 } },
    { data: null, error: { name: "service_unavailable", statusCode: 503 } },
    { data: null, error: { name: "invalid_idempotent_request", statusCode: 409 } },
    { data: null, error: { name: "concurrent_idempotent_requests", statusCode: 409 } },
    { data: null, error: { name: "application_error", statusCode: 400 } },
    {}, null,
  ])("conservatively marks SDK/network/malformed/conflict outcomes unknown: %j", async response => {
    provider.mockResolvedValue(response);
    expect(await send()).toEqual({ status: "unknown", category: "provider_uncertain" });
  });
  it("does not log a thrown error containing private data or attempt an internal retry", async () => {
    provider.mockRejectedValue(new Error("timeout private@example.test: Private property"));
    const log = vi.spyOn(console, "error");
    try { expect(await send()).toEqual({ status: "unknown", category: "provider_uncertain" }); expect(log).not.toHaveBeenCalled(); }
    finally { log.mockRestore(); }
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it.each(["missing-key", "local", "kill-switch"] as const)("classifies definite preflight %s failure without contacting the provider", async mode => {
    if (mode === "missing-key") vi.stubEnv("RESEND_API_KEY", "");
    if (mode === "local") vi.stubEnv("APP_URL", "http://localhost:5173");
    if (mode === "kill-switch") vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "true");
    expect(await send()).toEqual({ status: "failed", category: "configuration" });
    expect(provider).not.toHaveBeenCalled();
  });
});
