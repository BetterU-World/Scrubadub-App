"use node";

declare const process: { env: Record<string, string | undefined> };

const REQUIRED_ENV_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TOKEN_PEPPER",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "APP_URL",
] as const;

/**
 * Validates that all critical env vars are present.
 * Call from any "use node" action entry point to fail fast.
 * Throws with a clear message listing all missing vars.
 */
export function validateRequiredEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Set them in your Convex deployment environment variables.`,
    );
  }
}
