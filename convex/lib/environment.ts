declare const process: { env: Record<string, string | undefined> };

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variables: ${name}. Set it in the Convex deployment environment variables.`,
    );
  }
  return value;
}

export function requireAppUrl(): string {
  const value = requireValue("APP_URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("APP_URL must be a valid absolute URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("APP_URL must use http or https");
  }
  return value.replace(/\/+$/, "");
}

export function requireStripeSecretKey(): string {
  return requireValue("STRIPE_SECRET_KEY");
}

export function isExternalSideEffectsKillSwitchEnabled(): boolean {
  return TRUE_VALUES.has(
    (process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS ?? "").trim().toLowerCase(),
  );
}

export function isLocalAppUrl(): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(requireAppUrl()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function areExternalSideEffectsDisabled(): boolean {
  // Explicit disablement always wins, including for valid preview/non-local URLs.
  if (isExternalSideEffectsKillSwitchEnabled()) return true;
  return isLocalAppUrl();
}

export function assertExternalSideEffectsAllowed(integration: string): void {
  if (areExternalSideEffectsDisabled()) {
    throw new Error(`${integration} is disabled in this environment`);
  }
}
