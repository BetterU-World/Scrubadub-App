import { afterEach, describe, expect, it, vi } from "vitest";
import {
  areExternalSideEffectsDisabled,
  assertExternalSideEffectsAllowed,
  requireAppUrl,
} from "../environment";
import { validateAuthEnv, requireBlobToken, requireResendEnv } from "../validateEnv";
import { getStripeClientOrNull } from "../stripe";
import { sendAssessmentReportEmail } from "../email";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("environment safety policy", () => {
  it("disables external side effects for local URLs", () => {
    process.env.APP_URL = "http://localhost:5173";
    delete process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS;
    expect(areExternalSideEffectsDisabled()).toBe(true);
  });

  it("gives the explicit kill switch precedence for a valid non-local preview URL", async () => {
    process.env.APP_URL = "https://scrub-preview.example.test";
    process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_configured_but_must_not_be_used";

    expect(areExternalSideEffectsDisabled()).toBe(true);
    expect(() => assertExternalSideEffectsAllowed("External request"))
      .toThrow("External request is disabled in this environment");
    expect(() => getStripeClientOrNull()).toThrow("Stripe is disabled in this environment");

    process.env.RESEND_API_KEY = "re_configured_but_must_not_be_used";
    process.env.RESEND_FROM_EMAIL = "qa@example.test";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(sendAssessmentReportEmail({
      email: "recipient@example.test",
      language: "en",
      token: "safe-test-token",
      expiresAt: Date.now() + 60_000,
    })).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("preserves production-like behavior when no kill switch is set", () => {
    process.env.APP_URL = "https://app.example.test";
    delete process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS;
    expect(areExternalSideEffectsDisabled()).toBe(false);
  });

  it("requires a valid absolute application URL without a fallback", () => {
    process.env.APP_URL = "not-a-url";
    expect(() => requireAppUrl()).toThrow("APP_URL must be a valid absolute URL");
  });

  it("keeps auth independent from optional integration secrets", () => {
    process.env.TOKEN_PEPPER = "local-only-token-pepper";
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(() => validateAuthEnv()).not.toThrow();
    expect(() => requireResendEnv()).toThrow("RESEND_API_KEY, RESEND_FROM_EMAIL");
    expect(() => requireBlobToken()).toThrow("BLOB_READ_WRITE_TOKEN");
  });
});
