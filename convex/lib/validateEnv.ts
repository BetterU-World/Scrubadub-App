"use node";

declare const process: { env: Record<string, string | undefined> };

function requireEnv(names: readonly string[]): Record<string, string> {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Set them in your Convex deployment environment variables.`,
    );
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name]!.trim()]));
}

export function validateAuthEnv(): void {
  requireEnv(["TOKEN_PEPPER"]);
}

export function requireResendEnv(): { apiKey: string; fromEmail: string } {
  const values = requireEnv(["RESEND_API_KEY", "RESEND_FROM_EMAIL"]);
  return { apiKey: values.RESEND_API_KEY, fromEmail: values.RESEND_FROM_EMAIL };
}

export function requireBlobToken(): string {
  return requireEnv(["BLOB_READ_WRITE_TOKEN"]).BLOB_READ_WRITE_TOKEN;
}
