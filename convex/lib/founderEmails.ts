/**
 * Single source of truth for founder / internal-tester emails.
 *
 * At runtime the Convex env-var FOUNDER_EMAILS (comma-separated) is merged
 * with the hardcoded fallback list so the bypass works even before the
 * env-var is configured.
 *
 * Safe for Convex queries/mutations (V8 isolate runtime).
 */

const HARDCODED: string[] = ["dzbfyse@gmail.com"];

function getFounderEmails(): string[] {
  let envRaw = "";
  try {
    envRaw = process.env.FOUNDER_EMAILS ?? "";
  } catch {
    // process.env may not exist in Convex query/mutation runtime
  }
  const fromEnv = envRaw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...HARDCODED, ...fromEnv]));
}

export function isFounderEmail(email: string): boolean {
  if (!email) return false;
  return getFounderEmails().includes(email.toLowerCase());
}
